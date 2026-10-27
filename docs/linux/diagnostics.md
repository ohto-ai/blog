---
comments: true
---
# Linux 性能排查工具箱

> 换个视角看命令：不讲命令本身（见[常用命令速查](linux-commands.md)），讲**现象 → 该看什么 → 用什么看**。服务器变慢、CPU 飙高、内存吃紧时按图索骥。

## 先建立整体画面

```bash
uptime                # 负载：经验上 load 超过 CPU 核数 = 排队了
nproc                 # 核数，load 除以它才有意义
top -bn1 | head -20   # 单次快照：谁在吃 CPU，wa 高不高
dmesg -T | tail -50   # 内核最近有没有报 OOM / 硬件错误
```

**load 平均值高 ≠ CPU 忙**：load 统计的是"可运行 + 不可中断睡眠"的进程数。CPU 密集、I/O 等待、大量 D 状态进程都能拉高它。区分方法见下。

## CPU 高：先看是谁、在干什么

```bash
top                   # 按 P 按 CPU 排序，M 按内存；1 展开每核
htop                  # 更直观（需安装）

top 里关键看 %wa：    # wa = 等待 I/O 的 CPU 时间占比
#   us 高 → 用户代码忙，p 进程后接着看下面
#   sy 高 → 系统调用/内核忙（锁竞争、上下文切换）
#   wa 高 → 瓶颈在磁盘，转去磁盘一节
```

```bash
# 定位到进程后：看它在调用什么
pidstat -p <pid> 1            # 每秒：%usr/%system（需 sysstat 包）
strace -cp <pid>              # 统计系统调用分布（10 秒后 Ctrl+C）
strace -p <pid> -f -T         # 实时看：-T 显示每次调用耗时

# 栓点分析（火焰图前置步骤，perf 需安装）
perf top -p <pid>             # 实时热点函数
perf record -F 99 -p <pid> -g -- sleep 30 && perf report
```

!!! tip "上下文切换异常"
    `vmstat 1` 里 `cs` 列持续几十万 = 上下文切换风暴，通常是线程数过多或锁竞争；`pidstat -w 1` 可按进程看。

## 内存紧：available 才是真话

```bash
free -h
#  别被 buff/cache 吓到：那部分可回收。
#  看 available < 10% 才是真紧张
```

```bash
ps aux --sort=-%mem | head           # 谁吃内存
vmstat 1                             # si/so 持续非零 = 在换页，性能会显著劣化
cat /proc/meminfo | grep -E "MemAvail|SwapFree|Cached"

# 已经发生过的 OOM 击杀记录（谁被内核杀了）
dmesg -T | grep -iE "oom|killed process"
journalctl -k | grep -i oom
```

!!! note "OOM killer 逻辑"
    内存耗尽时内核按 oom_score 挑分最高的杀。给关键进程降分（保命）：`echo -1000 > /proc/<pid>/oom_score_adj` 或 systemd unit 里 `OOMScoreAdjust=-1000`。

## 磁盘：满了看谁占，慢了看 I/O

```bash
df -h                          # 容量；注意 inode 也可能耗尽：df -i
du -h --max-depth=1 /var 2>/dev/null | sort -rh | head   # 逐层找大头
ncdu /                         # 交互式找文件（需安装）

iostat -x 1                    # 每秒块设备详情（sysstat 包）
#  %util 接近 100% → 设备打满
#  await 远大于 svctm → 请求在排队，磁盘响应变慢

iotop -o                       # 只显示有 I/O 的进程（需安装）

lsof +D /var/log               # 目录下被哪些进程打开（删了文件不释放就靠它：见下）
```

!!! tip "文件删了空间不释放"
    进程还持有已删除文件的 fd。`lsof | grep deleted` 找到持有者，重启或 `truncate` 对应 `/proc/<pid>/fd/N` 才真正释放。日志被删但服务还在写是经典场景。

## 网络：分层缩小范围

```bash
ping 8.8.8.8                    # 通 → 基础链路没问题；不通 → 路由/防火墙
mtr baidu.com                   # 每跳丢包率（比 traceroute 强，需安装）

# 端口与连接
ss -tlnp                        # 本机监听（time-wait/close-wait 多不多看这里）
ss -s                           # 连接状态汇总

# 单个请求的时延分解：DNS / 建连 / TLS / 首字节
curl -w 'dns:%{time_namelookup} conn:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total}\n' -o /dev/null -s https://example.com

# 抓包（看协议细节的最后手段）
tcpdump -i any -nn port 443 -c 100
tcpdump -i any -nn host 10.0.0.5 and port 80 -w dump.pcap
```

常见症状速判：`close_wait` 堆积 = 本端应用没调 `close()`（代码 bug）；`time_wait` 大量 = 正常的主动关闭方状态，可调 `tcp_tw_reuse`；丢包重传看 `ss -ti` 或 `netstat -s | grep -i retrans`。

## 进程行为异常

```bash
strace -p <pid> -e trace=read,write,openat    # 精确追踪某类系统调用
strace -f ./app 2>&1 | grep ENOENT            # 启动失败：看它在找什么文件失败
lsof -p <pid>                                 # 打开的文件/socket/库
ls /proc/<pid>/fd | wc -l                     # fd 数量（跟 ulimit -n 对比）
cat /proc/<pid>/status | grep -E "Threads|VmRSS|voluntary"
cat /proc/<pid>/stack                         # 内核栈（D 状态进程卡在哪）
```

D 状态（不可中断睡眠，通常是存储 I/O）进程 kill -9 也杀不掉，只能解决底层 I/O 问题。

## 日志与历史

```bash
journalctl -xe                   # 最近错误 + 上下文
journalctl -u nginx -f           # 跟踪某服务
journalctl --since "1 hour ago" -p err
dmesg -T | grep -iE "error|fail|usb|sata"
last / lastb                     # 登录历史 / 失败登录
history | tail -30               # 服务器上"谁干了什么"的线索
```

## 一页速查

| 现象 | 第一眼 | 深入 |
| :--- | :--- | :--- |
| CPU 100% | `top`（us/sy/wa） | `strace -cp`、`perf top` |
| load 高但 CPU 空闲 | `vmstat 1` 看 `b` 列 | `ps aux` 找 D 状态进程 |
| 内存吃紧 | `free -h` 看 available | `ps --sort=-%mem`、OOM 记录 |
| 磁盘慢 | `iostat -x 1` 看 await/%util | `iotop -o`、`lsof +D` |
| 磁盘满 | `df -h` / `df -i` | `du --max-depth`、deleted 文件 |
| 网络卡 | `ping` → `mtr` | `curl -w` 分解、`tcpdump` |
| 端口连不上 | `ss -tlnp` 看监听 | 防火墙 `iptables -L -n`、`SELinux` |
| 进程悄悄死了 | `dmesg -T` / `journalctl -xe` | OOM 记录、exit code |

!!! tip "工具从哪来"
    sysstat（iostat/pidstat/mpstat）、iotop、htop、mtr、perf 都是独立包，`apt install sysstat iotop htop mtr linux-tools-generic` 一次装齐。容器环境里注意宿主机 vs 容器内视角的差异。
