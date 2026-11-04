---
comments: true
---
# Python 生成器与迭代器

> 这篇解释 `for` 循环背后发生了什么，以及 `yield` 为什么能处理放不进内存的数据。它们是 [asyncio](asyncio.md) 协程的地基，也是 Python 惰性处理的核心机制。示例在 Python 3.13 全量验证。

## 迭代协议：for 循环的底层

任何能被 `for` 遍历的对象都是**可迭代对象**（实现 `__iter__`）；`for` 循环的实际执行过程是：

```python
it = iter(iterable)          # 1. 调用 __iter__ 取得迭代器
while True:
    try:
        item = next(it)      # 2. 反复调用 __next__
    except StopIteration:    # 3. 迭代器耗尽时抛 StopIteration，for 捕获后结束
        break
    ...
```

迭代器是"一次性"的——耗尽后再 `next()` 只会得到 `StopIteration`：

```python
nums = [1, 2, 3]
it = iter(nums)              # list 是可迭代对象，iter() 返回它的迭代器
next(it)                     # 1
next(it)                     # 2
list(it)                     # [3]（只剩最后一个）
next(it)                     # StopIteration
```

自己写一个迭代器要实现 `__iter__` 和 `__next__` 两个方法——而生成器用一次 `yield` 就全部代替。

## 生成器：yield 挂起函数

函数体内出现 `yield`，这个函数就变成了**生成器函数**。调用它不会执行函数体，而是返回生成器对象；每次 `next()` 执行到下一个 `yield` 处暂停，把值交出去，状态原地保留：

```python
def countdown(n: int):
    while n > 0:
        yield n              # 暂停点：交出 n，等下次 next()
        n -= 1

gen = countdown(3)
next(gen)                    # 3（执行到第一个 yield）
next(gen)                    # 2（从暂停处继续）
list(gen)                    # [1]（剩余部分一次取完）

for i in countdown(3):       # 生成器天然可迭代
    print(i)
```

**生成器表达式**是列表推导式的惰性版本——把方括号换成圆括号：

```python
squares = [x * x for x in range(5)]        # 列表：立即全部计算，占内存
lazy = (x * x for x in range(5))           # 生成器：一个元素都不曾计算
next(lazy)                                 # 0，此时才计算第一个
sum(x * x for x in range(10))              # 传给函数时括号可省略一层
```

## 为什么惰性有价值

```python
# 逐行处理 10GB 的日志，内存占用恒定：
def error_lines(path: str):
    with open(path, encoding="utf-8") as f:
        for line in f:                      # 文件对象本身就是惰性迭代器
            if "ERROR" in line:
                yield line.strip()

n = sum(1 for _ in error_lines("big.log"))   # 全程不把文件读进内存

# 无限序列：只有惰性才能表达"无穷"
def naturals():
    i = 0
    while True:
        yield i
        i += 1

g = naturals()                                   # 只创建一次，反复推进同一个生成器
first = [next(g) for _ in range(5)]              # [0, 1, 2, 3, 4]
```

## yield from：委托给另一个可迭代对象

```python
def flatten(nested):
    for item in nested:
        if isinstance(item, list):
            yield from flatten(item)     # 委托给子生成器，逐项转交
        else:
            yield item

list(flatten([1, [2, [3, 4]], 5]))       # [1, 2, 3, 4, 5]
```

`yield from iterable` 等价于"把它逐项 yield 出来"，但还建立了双向通道（子生成器的返回值、异常都会传递），因此也是协程的前身。

## 进阶：send 与双向通道

`yield` 不只可以交出值，也能接收值——调用方用 `send()` 恢复生成器，同时传入数据：

```python
def running_average():
    total, count = 0.0, 0
    avg = None
    while True:
        value = yield avg                  # yield 的值交给调用方；send 的值赋给 value
        total += value
        count += 1
        avg = total / count

avg = running_average()
next(avg)              # 预激活：推进到第一个 yield（不能用 send(None) 之外的东西启动）
avg.send(10)           # 10.0
avg.send(20)           # 15.0
```

生成器协程（`asyncio` 的前身）就建立在这条双向通道上；日常数据处理用不到 `send`，但读旧代码会遇到。

## itertools 精选

```python
from itertools import count, cycle, chain, islice, groupby, product

count(10, 2)                     # 无限计数：10 12 14 ...（配 islice 取前几个）
list(islice(count(10, 2), 4))    # [10, 12, 14, 16]
list(chain([1, 2], "ab"))        # [1, 2, 'a', 'b']：串联多个可迭代对象
list(islice(cycle("AB"), 5))     # ['A','B','A','B','A']：无限循环

for key, group in groupby(["aa", "ab", "bb", "cc"], key=lambda s: s[0]):
    print(key, list(group))      # a ['aa','ab']  b ['bb']  c ['cc']（相邻分组，需先排序）

list(product("AB", "12"))        # [('A','1'),('A','2'),('B','1'),('B','2')]：笛卡尔积
```

## 常见错误

| 错误 | 说明 |
| :--- | :--- |
| 生成器只能遍历一次 | 耗尽后再遍历得到空结果；要多次使用先 `list()` 物化 |
| `len(gen)` 不存在 | 生成器没有长度；需要长度就说明该用列表 |
| 创建时不执行任何代码 | 忘记迭代时函数体一行都不会跑；返回值也拿不到（要用 `yield from` 或 `StopIteration.value`） |
| `groupby` 忘记先排序 | 它只对**相邻**的相同键分组 |
| 在生成器里持有资源忘了关闭 | 用 `with` 包裹（生成器被 `close()`/GC 时会正常执行清理），或显式 `.close()` |
| 迭代中修改被遍历的容器 | `dict`/`list` 迭代期间增删键会抛 `RuntimeError` 或行为异常 |

相关：[asyncio](asyncio.md) 把"暂停点"从 `yield` 升级为 `await`；[Python 并发](concurrency.md)讨论什么时候需要它们。
