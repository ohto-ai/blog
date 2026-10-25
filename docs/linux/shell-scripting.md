---
comments: true
---
# Shell 脚本笔记

> bash 脚本的高频用法与经典陷阱。命令速查见[常用命令](linux-commands.md)，文本处理见[三剑客](text-processing.md)。

## 第一个脚本

```bash
#!/usr/bin/env bash          # shebang：声明解释器；env 写法不依赖 bash 具体路径
set -euo pipefail            # 脚本标配，见下文

echo "hello, $(whoami)"
```

```bash
chmod +x first.sh
./first.sh                   # 直接执行（需要 shebang 和 +x）
bash first.sh                # 显式用 bash 跑（shebang 可省）
source first.sh              # 在当前 shell 里执行（变量会留下来，≠ 子进程）
```

## 变量与引号（90% 的坑在这里）

```bash
name="world"                 # 赋值：等号两边【不能有空格】
echo "hello $name"           # 双引号：允许变量展开，保留空格 —— 默认用它
echo 'hello $name'           # 单引号：原样输出（打印 $name 字面量）
echo hello $name             # 无引号：会做词分割和通配展开，坑多，别用

greeting="hello, $name"      # 组合用双引号
echo "${name}s"              # 变量名和后续字符粘连时必须加花括号
echo "$(date +%F).log"       # 命令替换：$() 优于反引号
echo $((1 + 2 * 3))          # 算术：$(( ))

# 默认值与判空
echo "${config:-/etc/app.conf}"    # config 未设置/为空时用默认值
echo "${config:?config is empty}"  # 为空时报错退出（脚本开头校验参数利器）
```

!!! tip "一句话原则"
    **凡是引用变量都加双引号**：`"$var"`、`"$@"`、`"${arr[@]}"`。不加引号的空格和通配符会要了你的脚本。

## 特殊变量

| 变量 | 含义 |
| :--- | :--- |
| `$0` / `$1`..`$9` / `${10}` | 脚本名 / 位置参数（两位数要花括号） |
| `$#` | 参数个数 |
| `$@` / `$*` | 所有参数（`"$@"` 逐个保留，**一律用它**） |
| `$?` | 上一条命令退出码（0 = 成功） |
| `$$` / `$!` | 当前脚本 PID / 最近后台任务 PID |
| `$_` | 上一条命令的最后一个参数 |

## 条件测试：`[ ]` vs `[[ ]]`

```bash
[ -f "$path" ]               # POSIX 测试：必须空格分隔，变量必须加引号
[[ -f $path ]]               # bash 加强版：变量可不加引号、支持 && || 和 =~ 正则

if [[ -f "$conf" && "$ver" -ge 2 ]]; then
    echo "ok"
elif [[ -z "$name" ]]; then
    echo "empty"
else
    echo "other"
fi
```

常用测试：`-f` 文件存在 / `-d` 目录 / `-e` 存在 / `-r/-w/-x` 可读写执行 / `-z` 空串 / `-n` 非空 / `=` `!=` `>` `<` 字符串比较 / `-eq -ne -lt -gt` 数字比较。

## 循环与分支

```bash
for f in *.log; do           # 通配遍历
    gzip "$f"
done

for i in {1..10}; do echo "$i"; done        # 序列
for ((i=0; i<10; i++)); do echo "$i"; done  # C 风格

while read -r line; do       # 逐行读文件（-r 防反斜杠转义）
    echo "-> $line"
done < input.txt

case "$1" in
    start)   echo starting ;;
    stop)    echo stopping ;;
    status*) echo "?" ;;                     # 通配
    *)       echo "usage: $0 {start|stop|status}"; exit 1 ;;
esac
```

!!! warning "管道里的 while 是子 shell"
    `cat file | while read line; do ... done` 里对变量的修改在循环结束后**会丢失**（管道右侧是子进程）。改用重定向 `while read; done < file`，或进程替换：

    ```bash
    while read -r line; do count=$((count+1)); done < <(grep ERROR app.log)
    echo "$count"    # 能拿到
    ```

## 函数

```bash
log() {                      # 定义：function 关键字可省略
    local level=$1 msg=$2    # local：函数内局部变量，必须写
    echo "[$(date +%T)] [$level] $msg" >&2   # >&2 日志走 stderr
}

get_port() {
    echo 8080                # 函数"返回值"：stdout，用 $() 接
    return 0                 # return 只能返回 0-255 的退出码，用于成功/失败
}

port=$(get_port)             # 接 stdout
if get_port; then echo ok; fi  # 用退出码判断成败
```

## set -euo pipefail 逐字解释

```bash
set -e           # 任何命令失败（非零退出码）立刻终止脚本，不再往下错
set -u           # 引用未定义变量报错退出（抓住 $VAR 打错字的 bug）
set -o pipefail  # 管道中任何一环失败，整个管道算失败（默认只看最后一个）
```

例外写法：`cmd || true`（允许失败）、`if cmd; then` / `cmd || exit 1`（显式判断）。

```bash
count=$(grep -c ERROR app.log) || true    # 文件里没有 ERROR 时 grep 返回 1，别让它杀掉脚本
```

## 参数解析

```bash
while getopts "vo:" opt; do     # v 无参开关，o: 带参数
    case $opt in
        v) verbose=1 ;;
        o) out=$OPTARG ;;
        *) echo "usage: $0 [-v] [-o file]"; exit 1 ;;
    esac
done
shift $((OPTIND - 1))           # 剥掉已解析参数，$1 起是剩余位置参数
```

复杂参数直接用 `getopt --long` 或干脆用 `argparse` 的 Python。

## 实战：滚动备份脚本

```bash
#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${1:?usage: backup.sh <src-dir> [keep-n]}"
KEEP="${2:-5}"                          # 默认保留 5 份
DEST=/var/backups/myapp
STAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$DEST"
tar -czf "$DEST/backup_${STAMP}.tar.gz" -C "$(dirname "$SRC_DIR")" "$(basename "$SRC_DIR")"

# 只保留最新 KEEP 份
ls -1t "$DEST"/backup_*.tar.gz | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f -- "$old"
    echo "removed: $old"
done
echo "done: backup_${STAMP}.tar.gz"
```

配 cron：`crontab -e` 加一行 `0 3 * * * /opt/scripts/backup.sh /data 7`（每天 3 点，保留 7 份）。

## 调试

```bash
bash -n script.sh           # 只做语法检查，不执行
bash -x script.sh           # 打印每条命令再执行（调试神器）
bash -x script.sh 2>log     # 调试输出单独落盘

# 脚本内局部开启：
set -x
some_mysterious_part
set +x

shellcheck script.sh        # 静态检查工具（apt install shellcheck），写完必跑
```
