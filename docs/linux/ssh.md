---
comments: true
---
# SSH 速查与进阶

> 远程开发的日常底层。基础连接命令在[常用命令速查](linux-commands.md)的网络一节，这篇讲**密钥、配置文件、端口转发与安全加固**。本篇的密钥生成、配置解析在 WSL OpenSSH 8.9 验证，登录与转发链路用 WSL 起的 sshd 实测。

## 密钥登录：一次配好，处处免密

```bash
ssh-keygen -t ed25519 -C "ohtoai@laptop"    # 现代首选；-C 只是备注
# 生成 ~/.ssh/id_ed25519（私钥，打死不给）与 id_ed25519.pub（公钥，随便放）

ssh-copy-id user@server                     # 一条命令把公钥装到服务器
# 等价于手动：cat ~/.ssh/id_ed25519.pub | ssh user@server \
#   'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys'
```

**权限是 SSH 的洁癖**：`~/.ssh` 必须 700、私钥和 authorized_keys 必须 600，宽松权限直接拒绝工作：

```text
Permissions 0644 for 'id_ed25519' are too open.
This private key will be ignored.
```

密钥口令每次要输？用 agent 托管一次：

```bash
eval "$(ssh-agent)" && ssh-add ~/.ssh/id_ed25519
```

## ~/.ssh/config：给每台服务器起别名

```ssh-config
# ~/.ssh/config —— 权限 600
Host dev                          # 别名，之后 ssh dev 即可
    HostName 203.0.113.10
    User ohtoai
    Port 2222
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60        # 60s 心跳防掉线
    ServerAliveCountMax 3

Host db                           # 经跳板机才能摸到的内网机
    HostName 10.0.0.5
    User admin
    ProxyJump dev                 # 8.0+ 语法；老版本用 ProxyCommand ssh -W %h:%p dev

Host *
    AddKeysToAgent yes            # 首次使用自动进 agent
```

```bash
ssh dev                           # 等价于 ssh -p 2222 ohtoai@203.0.113.10 -i ...
ssh -G dev                        # 打印该别名最终解析出的全部配置——调试 config 神器
```

`scp`/`rsync` 同样吃这套别名：`rsync -avz src/ dev:/opt/`（见[常用命令](linux-commands.md)）。

## 端口转发：三种方向

```bash
# 本地转发 -L：把【远端能访问】的服务映射到本地端口
ssh -N -L 5432:db.internal:5432 dev
# 本机连 localhost:5432 == 在 dev 机器上连 db.internal:5432
# 场景：内网数据库、只有服务器能开的 Web 后台

# 反向转发 -R：把【本地】的服务暴露给远端（或远端所在内网）
ssh -N -R 9000:localhost:3000 dev
# dev 机器上连 localhost:9000 == 回到你本机的 3000 端口
# 场景：给同事临时看本机起的开发环境、远程调试回调

# 动态转发 -D：SOCKS5 代理
ssh -N -D 1080 dev                # 本机浏览器代理指向 localhost:1080，流量从 dev 出去
```

`-N` 表示只转发不执行远端命令；想后台挂着加 `-f`；断了自动重连可配 `autossh` 或 systemd 服务（见[systemd 实战](systemd.md)）。

## 远程执行与文件传输

```bash
ssh dev 'uptime && df -h /'               # 远端跑命令（注意引号在本地还是远端展开）
ssh dev 'bash -s' < deploy.sh             # 本地脚本灌给远端执行
scp -r dir/ dev:/opt/                     # 递归拷目录；scp file dev:~/
rsync -avzP --delete src/ dev:/opt/app/   # 增量同步（大目录/频繁同步首选）
ssh dev tar -czf - /data > backup.tgz     # 远端打包流回本地（管道思路）
```

## 服务端安全加固（sshd_config）

```ssh-config
# /etc/ssh/sshd_config，改完 systemctl reload sshd（见 systemd 实战）
PasswordAuthentication no          # 只许密钥登录（先确认密钥能登！）
PermitRootLogin no                 # root 不许直接登
MaxAuthTries 3
AllowUsers ohtoai                  # 白名单
ClientAliveInterval 60             # 服务端心跳（与客户端那条二选一即可）
```

改配置**保持现有会话别断**，开个新窗口验证能登录再退出——把自己锁外面是最经典事故。暴露公网的服务再加 fail2ban 防爆破。有 IPv6 的话公网只开 v6（扫描量少一个量级）。

## 常见坑

| 症状 | 原因 / 处理 |
| :--- | :--- |
| `Permissions too open` | 私钥 0644——`chmod 600`；Windows 上设置文件 ACL 或用 WSL 存钥 |
| `host key changed` 警告 | 服务器重装过；确认后 `ssh-keygen -R host` 清旧记录 |
| 登录要等十几秒 | 服务端 DNS 反查；sshd_config 里 `UseDNS no` |
| 密钥加了解也不生效 | 先 `ssh -v dev` 看它尝试了哪些 key；agent 里没加就 `ssh-add` |
| 转发端口被占 / bind 失败 | 换本地端口；`-R` 远端绑定需 `GatewayPorts` 配合 |
| 长时间不动就断 | 两端任意一侧配 `ServerAliveInterval 60` |
| 多台机器密钥混乱 | config 按别名指定 `IdentityFile`，别互相覆盖 |

## 一图总结连接链路

```text
ssh dev ──► 查 ~/.ssh/config (Host dev) ──► 解析 HostName/User/Port/IdentityFile
        ──► agent 里找钥 ──► TCP 连接 ──► 密钥协商 ──► 公钥认证 ──► shell / -N 转发
出问题就 ssh -v dev，逐行看卡在哪一步。
```
