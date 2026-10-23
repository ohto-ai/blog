---
comments: true
---
# 文本三剑客：grep / sed / awk

> Linux 文本处理绕不开的三个工具。这篇按「能干什么」整理高频用法，配合[常用命令速查](linux-commands.md)使用。

## grep — 找内容

```bash
grep "ERROR" app.log                # 基本查找
grep -i "error" app.log             # 忽略大小写
grep -n "ERROR" app.log             # 显示行号
grep -r "TODO" .                    # 递归找目录
grep -rn "TODO" --include="*.cpp" . # 递归 + 只搜 .cpp
grep -v "^#" config                 # 反选：排除注释行
grep -c "ERROR" app.log             # 只输出匹配行数
grep -o "[0-9]\{3\}" file           # 只输出匹配到的部分
grep -E "regex" file                # 扩展正则（+ ? | {n} 不用转义）
grep -A 3 -B 1 "ERROR" app.log      # 显示匹配行的后 3 行 / 前 1 行
grep -w "error" file                # 全词匹配（不匹配 errors）
grep -F "a.b" file                  # 按字面量匹配（. 不当正则）
```

!!! tip "egrep / fgrep"
    `egrep` = `grep -E`，`fgrep` = `grep -F`。新脚本里建议直接写 `grep -E/-F`。

## sed — 改内容

```bash
# 替换：s/旧/新/标志，每行默认只换第一个
sed 's/foo/bar/' file               # 输出到终端，不改文件
sed 's/foo/bar/g' file              # g = 替换行内所有
sed 's/foo/bar/2' file              # 只替换每行第 2 个
sed -i 's/foo/bar/g' file           # 直接修改文件（危险，先备份可加 -i.bak）
sed -i '/^#/d' config               # 删除所有注释行
sed -i '/^$/d' config               # 删除空行
sed -n '10,20p' file                # 只打印 10-20 行
sed -n '/START/,/END/p' file        # 打印两个标记之间的区域
sed '1d' file                       # 删除第一行（去表头）
sed '$a\new line' file              # 末尾追加一行；a=后加 i=前插
sed -E 's/[0-9]+/N/g' file          # -E 扩展正则（同 grep -E）
```

!!! warning "sed -i 的坑"
    macOS（BSD sed）的 `-i` 必须带备份后缀参数（`sed -i '' 's/a/b/'`），GNU/Linux 不用。跨平台脚本推荐统一用 `sed -i.bak` 再删备份，或改用 perl。

## awk — 切字段、做统计

```bash
# 基本模型：awk '模式 { 动作}' file，默认按空白切字段，$1 $2 ... $NF 是各字段
awk '{print $1}' file                       # 打印第一列
awk '{print $1, $3}' file                   # 打印第 1、3 列
awk -F: '{print $1}' /etc/passwd            # -F 指定分隔符
awk -F, '{print $2}' data.csv               # CSV（简单场景；含引号转义请用专业工具）
awk 'NR==3' file                            # 只打印第 3 行（NR = 当前行号）
awk 'NR>1' file                             # 跳过表头
awk 'END{print NR}' file                    # 总行数
awk '{sum += $1} END{print sum}' file       # 第 1 列求和
awk '{sum += $3; n++} END{print sum/n}' f   # 第 3 列平均值
awk 'length($0) > 80' file                  # 打印超过 80 列的行
awk '$3 > 100' file                         # 条件过滤：第 3 列大于 100
awk '$NF' file                              # 最后一列（NF = 字段数）
awk '/ERROR/{print $1, $NF}' app.log        # 模式 + 动作组合
```

!!! note "内置变量"
    `NR` 当前行号、`NF` 当前行字段数、`FS` 分隔符（可用 `-F` 或 `BEGIN{FS=":"}` 设置）、`OFS` 输出分隔符。

## 配角：cut / sort / uniq / tr / xargs

```bash
cut -d: -f1 /etc/passwd             # 按分隔符取列（比 awk 轻，但只支持单字符分隔）
cut -c1-8 file                      # 按字符位置截取

sort -n / -r / -h                   # 数值 / 倒序 / 人性化大小(1K 2M) 排序
sort -k2 -n file                    # 按第 2 列数值排序
uniq -c                             # 去重并计数（**先 sort 再 uniq**）
tr 'a-z' 'A-Z' < file               # 大小写转换
tr -d '\r' < win.txt > unix.txt     # 去掉 \r（Windows 换行转 Unix）

xargs -n1 -I{} cmd {}               # 把输入变成参数逐个执行
find . -name "*.log" | xargs rm     # 找到的文件批量删除
grep -rl "old" . | xargs sed -i 's/old/new/g'   # 批量替换（经典组合）
```

## 实战组合

```bash
# 1. 统计日志里出现次数最多的 10 个 IP（nginx access.log 第 1 列）
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head

# 2. 提取 nginx 日志中所有 404 的请求路径
awk '$9 == 404 {print $7}' access.log | sort | uniq -c | sort -rn

# 3. 找出当前目录占用最大的 10 个文件
du -ah . | sort -rh | head -n 10

# 4. 批量把 .txt 改成 .bak
ls *.txt | sed 's/\.txt$//' | xargs -I{} mv {}.txt {}.bak

# 5. 看 docker 容器里 java 进程的启动参数（jps + tr 组合思路）
ps -ef | grep java | tr ' ' '\n' | grep -E '^-X'

# 6. 快速看 csv 某列非空的行数
awk -F, '$2 != "" {n++} END{print n+0}' data.csv
```

## 什么时候换更专业的工具

- **JSON** → `jq`：`curl -s api | jq '.data[0].name'`
- **多层结构 / 跨行匹配** → `perl` 或 `python`
- **超大文件反复查** → 考虑先 `grep` 缩小范围，或 `ripgrep (rg)`（更快的 grep 替代）
- **CSV 含引号 / 转义** → `csvkit`、`mlr` 或 Python pandas
