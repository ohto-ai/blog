---
comments: true
---
# Python 惯用法速查

> "Pythonic"不是风格洁癖，是更短、更快、更少 bug。这篇按场景整理日常最高频的写法，环境与工具链见[Python 环境与包管理](python-env.md)。

## 字符串与打印

```python
name, score = "Ada", 92.457
f"{name}: {score:.2f}"          # 格式化：'Ada: 92.46'
f"{score=}"                     # 调试神器：'score=92.457'（变量名+值一起打）
f"{1234567:,}"                  # '1,234,567'（千分位）
f"{0.256:.1%}"                  # '25.6%'

s = "a,b,,c"
parts = s.split(",")            # ['a', 'b', '', 'c']
s.strip()                       # 去两端空白；lstrip/rstrip 单边
" ".join(words)                 # 拼接（别用 + 循环拼，O(n²)）
s.removeprefix("un")            # 3.9+：有则去前缀，没有不动
"key=value".partition("=")      # ('key', '=', 'value')，split 只切一次的场景
```

## 解包与交换

```python
a, b = b, a                        # 交换
first, *rest = [1, 2, 3, 4]        # first=1, rest=[2, 3, 4]
*init, last = range(5)             # init=[0,1,2,3], last=4
a, b = {"x": 1, "y": 2}            # 字典默认迭代 key → a='x'
for k, v in d.items(): ...         # 键值对解包

x, y, z = point                    # 任何可迭代都能解包
(x, y), z = (1, 2), 3              # 嵌套解包
```

## 推导式

```python
squares = [x * x for x in range(10) if x % 2 == 0]       # 列表
lookup = {u.id: u for u in users}                        # 字典（按 id 建索引）
names = {u.name for u in users}                          # 集合（去重）
lazy = (line.strip() for line in f)                      # 生成器：大文件用这个，不占内存

# 带分支：
labels = ["even" if x % 2 == 0 else "odd" for x in nums]

# 超过两个 for 或两层 if 就改普通循环——可读性优先
```

## 循环的正确姿势

```python
for i, item in enumerate(items, start=1): ...        # 要下标时（别 range(len())）
for a, b in zip(xs, ys): ...                         # 平行遍历两序列
from itertools import zip_longest                    # 短序列补 None

for k, v in sorted(d.items(), key=lambda kv: -kv[1]): ...   # 按值排序遍历

while (chunk := f.read(8192)):                       # 海象运算符：赋值并判断
    process(chunk)

# 字典安全访问
d.get(key, default)              # 不存在给默认，不抛错
d.setdefault(key, []).append(v)  # 分组惯用法
from collections import defaultdict
groups = defaultdict(list)       # 上面的更显式版本
```

## 文件与路径：pathlib

```python
from pathlib import Path

p = Path("data") / "raw" / "train.csv"     # 用 / 拼路径，跨平台
p.exists(); p.is_dir(); p.suffix           # '.csv'; p.stem='train'
p.read_text(encoding="utf-8")              # 小文件一步读
p.write_text("hello")                      # 一步写
for f in Path(".").glob("**/*.py"): ...    # 递归找文件
p.mkdir(parents=True, exist_ok=True)       # 递归建目录（不抛已存在）

# 大文件逐行
with open("big.log", encoding="utf-8", errors="replace") as f:
    for line in f:                         # 迭代器，内存 O(1)
        ...
```

## 数据类与类型注解

```python
from dataclasses import dataclass, field

@dataclass
class Point:
    x: float = 0.0
    tags: list[str] = field(default_factory=list)   # 可变默认值必须这样给
    # 自动生成 __init__/__repr__/__eq__；frozen=True 变不可变；order=True 可比较

# 类型注解：运行时不强制，但 IDE/静态检查全靠它
def parse(raw: str) -> dict[str, int] | None: ...    # 3.10+ 的 | 语法
def find(key: str, default: int | None = None) -> int: ...
```

## 错误处理：EAFP 风格

```python
# Python 崇尚 EAFP（先干，出错再处理），比先检查再干更快也更无竞态
try:
    v = d[key]                       # 直接访问
except KeyError:
    v = default

try:
    n = int(s)
except ValueError:
    return None                      # 只捕获具体异常类型，别裸 except

raise RuntimeError(f"bad input: {s}") from e     # 保留原始异常链
```

## 常用标准库速查

| 模块 | 干什么 | 代表用法 |
| :--- | :--- | :--- |
| `collections` | 容器增强 | `Counter(x for x in xs)`, `defaultdict(list)`, `deque(maxlen=100)` |
| `itertools` | 迭代器算子 | `chain`, `product`, `groupby`, `islice` |
| `functools` | 函数工具 | `lru_cache`, `partial`, `reduce` |
| `json` / `re` / `datetime` | 数据三件套 | `json.loads/dumps`、正则、`datetime.fromisoformat` |
| `subprocess` | 调外部命令 | `subprocess.run(["ls", "-la"], capture_output=True, text=True, check=True)` |
| `argparse` | 命令行参数 | 标准库自带，够用 |
| `logging` | 日志 | 别用 print 打服务日志 |
| `pathlib` / `shutil` | 文件 | 高层文件操作 |

```python
# 两个最值钱的装饰器
from functools import lru_cache

@lru_cache(maxsize=None)          # 记忆化：递归/重复查询直接提速
def fib(n): ...

if __name__ == "__main__":        # 模块可导入也可直接跑
    main()
```

## 风格底线

- 命名：`snake_case` 变量函数、`PascalCase` 类、`UPPER_CASE` 常量；`_var` 内部使用；
- 工具代替争论：**ruff**（lint+format，一条命令）+ **mypy/pyright**（类型检查），进 pre-commit；
- 过两三个版本的新语法可以放心用（3.10+ 的 match、`|`），过老的（`%` 格式化、os.path 拼接）就别再写了。
