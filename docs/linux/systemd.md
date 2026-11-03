---
comments: true
---
# systemd 服务编写实战

> 把程序做成正经服务：开机自启、崩了自动拉起、日志进 journal。[Daemon 编写](../cpp/daemon.md)讲过进程侧（fork/Type 的选择），这篇讲**unit 文件怎么写、怎么调**。排查命令速查见[常用命令](linux-commands.md)与[排查工具箱](diagnostics.md)。

## unit 文件放哪、长什么样

```ini
# /etc/systemd/system/myapp.service   ← 自建服务放这（/usr/lib/systemd/system 是包管理器的地盘）
[Unit]
Description=My App Service
After=network-online.target          # 排序：网络就绪后再启动（不等于强依赖）
Wants=network-online.target          # 弱依赖：跟随启动，失败不拖累我

[Service]
Type=simple                          # 前台进程直接跑；forking/notify 等见 Daemon 篇
ExecStart=/opt/myapp/myapp --config /etc/myapp/config.toml   # 【必须绝对路径】
Restart=on-failure                   # 异常退出自动拉起；always 连正常退出也拉
RestartSec=3
User=appuser                         # 别用 root 跑服务
Group=appuser
WorkingDirectory=/opt/myapp
Environment=LOG_LEVEL=info
EnvironmentFile=/etc/myapp/env       # KEY=VALUE 格式，一行一个
LimitNOFILE=65536                    # fd 上限（网络服务常见需求）

[Install]
WantedBy=multi-user.target           # enable 时挂到哪个启动目标下
```

```bash
sudo systemctl daemon-reload          # 改完 unit 必须执行，否则 systemd 不知道
sudo systemctl enable --now myapp     # 开机自启 + 立即启动
systemctl status myapp                # 状态（含主 PID、退出码、最近日志）
```

## 高频字段速查

| 字段 | 说明 |
| :--- | :--- |
| `Restart=` | `no`（默认）/`on-failure`/`always`/`on-watchdog`；配合 `RestartSec=` 防风暴 |
| `KillMode=` | `control-group`（默认，杀整组）/`process`/`mixed` |
| `TimeoutStopSec=` | stop 时的优雅退出宽限，超时 SIGKILL |
| `ExecStartPre=/Post=` | 启动前/后辅助命令（建目录、迁移等，`-` 前缀忽略失败） |
| `ExecReload=` | `systemctl reload` 执行的动作（通常发 SIGHUP 重载配置） |
| `StandardOutput=` | 默认进 journal；可 `append:/var/log/x.log` |
| `OOMScoreAdjust=-1000` | OOM 时降低被终止概率（见[排查工具箱](diagnostics.md)） |
| `Nice=` / `CPUWeight=` / `MemoryMax=` | 资源约束；`MemoryMax=2G` 超 OOM |

## 安全加固：让服务跑在笼子里

```ini
[Service]
NoNewPrivileges=true          # 禁止提权（setuid 等）
ProtectSystem=strict          # 整个文件系统只读
ProtectHome=true              # 隐藏 /home /root /run/user
PrivateTmp=true               # 独立的 /tmp
ReadWritePaths=/var/lib/myapp # 只放开真正要写的目录
ProtectKernelTunables=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6   # 只允许这些 socket 类型
DynamicUser=yes               # 没有账号也能跑：临时分配 UID（配 StateDirectory= 持久化数据）
```

一条 `systemd-analyze security myapp` 能给当前配置打安全分（0~10），按提示逐项补。**新服务默认就该带这些**——暴露面小了，即使遭到攻击也更难被直接提权。

## 日志：journalctl 配合

```bash
journalctl -u myapp -f                  # 跟踪
journalctl -u myapp --since "1 hour ago"
journalctl -u myapp -p err              # 只看错误级
journalctl -u myapp -o json-pretty      # 结构化输出（含 _PID 等）
```

服务里 `printf`/`std::cout` 到 stdout/stderr 就自动进 journal——**daemon 不用自己再写日志文件**（Type=simple 前台跑时），除非要轮转策略。

## timer：替代 cron 的官方姿势

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=*-*-* 03:00:00        # cron 表达式的 systemd 写法
Persistent=true                  # 错过的（关机期间）开机后补跑
RandomizedDelaySec=300           # 防止整点雪崩

[Install]
WantedBy=timers.target
```

```bash
# timer 需要“挂”在一个同名 .service 上（backup.service 定义要跑的命令）
sudo systemctl enable --now backup.timer
systemctl list-timers                 # 看所有定时任务与下次触发时间
```

比 cron 好在：依赖其他服务、失败自动记录、`Persistent` 补跑、日志齐全。cron 只剩一个优势——写法熟悉。

## 调试与常见坑

```bash
systemd-analyze verify /etc/systemd/system/myapp.service   # 语法静态检查（不启动）
systemd-analyze blame                # 上次启动各服务耗时
systemd-analyze critical-chain myapp # 启动依赖链分析
```

| 症状 | 原因 |
| :--- | :--- |
| 改了 unit 不生效 | 忘 `daemon-reload` |
| `Executable path is not absolute` | ExecStart 用了相对路径或没写全 |
| 服务反复重启 | Restart 风暴；看 `status` 里的退出码（如 203=EXEC 找不到程序，126/127=权限/缺库） |
| 程序找不到动态库 | 用户环境变量不生效——systemd **不经过你的 shell**，库路径写进 unit 的 `Environment=` |
| 后台静默失败 | 标准输出没看：`journalctl -u xxx -n 100` 是第一现场 |
| 依赖的服务没起来 | `After=` 只是顺序，要"没它我不跑"用 `Requires=`；"没它最好有"用 `Wants=` |

延伸：程序侧怎么配合（优雅退出、sd_notify）见[Daemon 编写](../cpp/daemon.md)；服务打不打了看[排查工具箱](diagnostics.md)；本篇 unit 示例在 WSL Ubuntu 22.04 用 `systemd-analyze verify` 验证过语法。
