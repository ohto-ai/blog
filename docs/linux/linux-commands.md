---
comments: true
---
# Linux 常用命令速查

> 按使用场景分类的日常命令清单，只收录高频用法。文本处理三剑客单独整理在[这里](text-processing.md)。持续更新。

## 文件与目录

| 命令 | 说明 / 示例 |
| :--- | :--- |
| `ls -lah` | 人性化单位显示全部文件（含隐藏文件） |
| `cd -` | 回到上一个目录 |
| `pwd` | 当前路径 |
| `cp -a src/ dst/` | 递归复制并保留属性（备份目录首选） |
| `mv a b` | 移动 / 重命名 |
| `rm -rf dir/` | 递归强制删除（**用前先 `ls` 一眼**） |
| `mkdir -p a/b/c` | 递归建目录 |
| `ln -s target link` | 创建软链接 |
| `tree -L 2 -a` | 树状查看两层目录 |

### 查找文件

```bash
# 按名字找（推荐 fd：更快的现代替代品）
find . -name "*.cpp" -not -path "*/build/*"
find / -type f -size +100M 2>/dev/null     # 找出大于 100M 的文件

# 按内容找（grep 递归）
grep -rn "TODO" --include="*.cpp" .

# 最近修改的文件
find . -mmin -30 -type f
```

## 查看文件

| 命令 | 说明 / 示例 |
| :--- | :--- |
| `cat / less / head / tail` | less 用 `q` 退出、`/xx` 搜索、`G` 到末尾 |
| `tail -f app.log` | 跟踪日志滚动输出（`tail -f` 常驻看日志首选） |
| `tail -n 100 app.log` | 看最后 100 行 |
| `wc -l file` | 统计行数 |
| `file x.bin` | 判断文件真实类型 |
| `stat file` | 看详细属性（大小/权限/时间戳） |
| `du -sh dir/` | 看目录总大小；`du -h --max-depth=1 \| sort -rh` 找大头 |

## 进程与作业

```bash
ps aux | grep nginx         # 找进程
pgrep -a nginx              # 同上，更直接

kill -TERM <pid>            # 优雅退出（默认）
kill -9 <pid>               # 强杀（先试 TERM 再用 9）
killall / pkill <name>      # 按名字杀

top / htop                  # 动态监控（htop 更好用）
uptime                      # 负载概览
lsof -i:8080                # 谁占用了 8080 端口
```

### 前后台作业

| 操作 | 效果 |
| :--- | :--- |
| `Ctrl+Z` | 挂起当前前台进程 |
| `bg` / `fg` | 让挂起的进程在后台 / 前台继续 |
| `jobs` | 列出当前会话作业 |
| `nohup cmd &` | 挂断不退出，输出进 `nohup.out` |
| `disown -h %1` | 把已运行作业从会话剥离 |

### systemd 服务管理

```bash
systemctl start / stop / restart / status nginx
systemctl enable --now nginx        # 设为开机自启并立刻启动
systemctl list-units --failed       # 挂掉的服务
journalctl -u nginx -f              # 跟踪服务日志
journalctl -u nginx --since today
```

## 网络

```bash
ip a                       # 网卡与 IP（替代 ifconfig）
ip route                   # 路由表
ss -tlnp                   # 监听端口与进程（替代 netstat）

ping -c 4 baidu.com
curl -I https://example.com          # 只看响应头
curl -o file.tar.gz -L url           # 下载（跟随重定向）
wget -c url                          # 断点续传

dig +short example.com     # DNS 解析
tracepath example.com      # 路由追踪（无特权版 traceroute）

# SSH 相关
ssh user@host -p 2222
scp file user@host:/path/
rsync -avzP src/ user@host:dst/     # 增量同步，大文件传输首选
```

!!! tip "局域网扫描"
    `nmap -sn 192.168.1.0/24` 扫活主机；`arp-scan --localnet` 也可以。nmap 需要安装。

## 磁盘

| 命令 | 说明 / 示例 |
| :--- | :--- |
| `df -h` | 各挂载点容量 |
| `lsblk` | 块设备树（看磁盘/分区一目了然） |
| `mount / umount` | 挂载 / 卸载；`mount -a` 按 fstab 重挂 |
| `blkid` | 查看 UUID（写 fstab 用） |
| `ncdu /path` | 交互式磁盘占用分析（需安装，查「磁盘去哪了」神器） |

## 用户与权限

```bash
sudo -i                        # 切到 root（比 su 更可控）
sudo -l                        # 看当前用户能执行哪些 sudo 命令

chmod 755 file                 # rwx r-x r-x
chmod +x script.sh             # 加可执行位
chmod -R a+rX dir/             # 递归：目录可进入，文件只读
chown user:group file
chown -R www-data: /var/www

useradd -m -s /bin/bash name   # 建用户并建家目录
passwd name                    # 改密码
id name                        # 查 uid/gid/组
```

!!! note "权限数字"
    `r=4, w=2, x=1`，三组依次为 **属主 / 属组 / 其他**。`755` = 属主全权，其余读 + 执行；`600` = 仅属主可读写（密钥文件必须是这个）。

## 打包与压缩

```bash
# tar：记住 c 创建 / x 解开 / t 列表，z 表示 gzip
tar -czvf archive.tar.gz dir/        # 打包 + gzip
tar -xzvf archive.tar.gz             # 解压
tar -xzvf archive.tar.gz -C /tmp     # 解压到指定目录
tar -tf  archive.tar.gz | head       # 不解压先看内容

zip -r archive.zip dir/
unzip archive.zip -d /tmp

gzip -k file                         # 压缩（-k 保留原文件）
gunzip file.gz
```

## 系统信息

```bash
uname -a                # 内核版本
hostnamectl             # 发行版 + 内核 + 主机名
lscpu                   # CPU
free -h                 # 内存
lsblk / lsusb / lspci   # 设备
dmesg -T | tail -50     # 内核日志（硬件问题排查）
cat /etc/os-release     # 发行版信息（脚本里判断发行版用它）
```

## Shell 效率技巧

| 按键 / 命令 | 效果 |
| :--- | :--- |
| `Ctrl+R` | 反向搜索历史命令（再按继续向上找） |
| `Ctrl+A` / `Ctrl+E` | 光标到行首 / 行尾 |
| `Ctrl+U` / `Ctrl+K` | 删到行首 / 删到行尾 |
| `Ctrl+W` | 删前一个单词 |
| `Ctrl+L` | 清屏 |
| `!!` | 上一条命令（`sudo !!` 补 sudo） |
| `!$` | 上一条命令的最后一个参数 |
| `Alt+.` | 插入上一条命令最后参数（可连按） |
| `command1 && command2` | 前者成功才执行后者 |
| `cmd > out.log 2>&1` | stdout + stderr 都重定向进文件 |
| `cmd 2>/dev/null` | 丢弃错误输出 |

```bash
# 常用管道组合
dmesg | grep -i usb                    # 过滤
ps aux | grep nginx | grep -v grep     # 排除 grep 自身
history | awk '{print $2}' | sort | uniq -c | sort -rn | head   # 最常用命令 Top10
```
