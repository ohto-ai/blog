---
comments: true
---
# Python 装饰器、闭包与描述符

> 这三样是同一个主题的三层深度：**闭包**是原理，**装饰器**是应用，**描述符**是实现 `property` 等魔法的地基。常用语法见[惯用法速查](python-idioms.md)。

## 闭包：内层函数记住外层变量

```python
def make_adder(n):
    def add(x):
        return x + n          # 捕获外层的 n——即使 make_adder 已返回
    return add

add10 = make_adder(10)
add10(5)                      # 15
add10.__closure__             # 函数对象上能看到被捕获的变量
```

**经典坑：循环变量的 late binding**——闭包捕获的是**变量本身**，不是当时的值：

```python
funcs = [lambda: i for i in range(3)]
[f() for f in funcs]                    # [2, 2, 2]！三个函数共享同一个 i

funcs = [lambda i=i: i for i in range(3)]   # ✅ 默认参数在定义时求值
[f() for f in funcs]                    # [0, 1, 2]
```

## 装饰器：@ 只是语法糖

```python
import functools
import time

def timer(func):
    @functools.wraps(func)              # 保留原函数的 __name__/__doc__
    def wrapper(*args, **kwargs):
        t0 = time.perf_counter()
        result = func(*args, **kwargs)
        print(f"{func.__name__}: {time.perf_counter() - t0:.4f}s")
        return result
    return wrapper

@timer                                   # 等价于 slow = timer(slow)
def slow(n):
    return sum(range(n))
```

**不带 `functools.wraps` 的代价**：`slow.__name__` 变成 `"wrapper"`，文档、调试、序列化全乱。写装饰器的第一行永远是它。

### 带参数的装饰器：再多包一层

```python
def retry(times=3, delay=0.5):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return func(*args, **kwargs)
                except Exception:
                    if attempt == times:
                        raise
                    time.sleep(delay)
        return wrapper
    return decorator

@retry(times=5, delay=1.0)               # 先调用 retry(...) 返回真正的装饰器
def flaky_request(url):
    ...
```

三层结构记法：**外层收参数 → 中层收函数 → 内层收调用参数**。

### 类实现装饰器：需要状态的时候

```python
class CountCalls:
    def __init__(self, func):
        functools.update_wrapper(self, func)
        self.func = func
        self.calls = 0

    def __call__(self, *args, **kwargs):     # 实例可调用
        self.calls += 1
        return self.func(*args, **kwargs)

@CountCalls
def ping():
    return "pong"

ping() ; ping()
ping.calls                   # 2 —— 状态就存在实例上
```

## 标准库里最常用的装饰器

| 装饰器 | 用途 |
| :--- | :--- |
| `@property` | 方法伪装成属性（读）；配套 `.setter` 写入校验 |
| `@staticmethod` / `@classmethod` | 无 self / 收 cls 的方法 |
| `@functools.lru_cache` / `@cache` | 记忆化（见惯用法）；`cache` 是无限版 |
| `@functools.cached_property` | 第一次访问后缓存成实例属性 |
| `@functools.total_ordering` | 只定义 `__eq__` + 一个比较，补齐其余 |
| `@contextlib.contextmanager` | 用生成器写上下文管理器（见下） |
| `@dataclasses.dataclass` | 自动生成 `__init__` 等（惯用法篇已示） |

```python
from contextlib import contextmanager
import time

@contextmanager
def timed(label: str):
    t0 = time.perf_counter()
    yield                                 # with 块的内容在这里执行
    print(f"{label}: {time.perf_counter() - t0:.3f}s")

with timed("bulk"):
    do_bulk_work()
```

## 描述符：property 的真相

`@property` 之所以能拦截属性访问，是因为它实现了**描述符协议**。自己写一个就是几行：

```python
class Positive:
    """可复用的校验型描述符"""
    def __set_name__(self, owner, name):
        self.name = "_" + name            # 数据存到私有名下

    def __get__(self, obj, objtype=None):
        return getattr(obj, self.name)

    def __set__(self, obj, value):
        if value <= 0:
            raise ValueError(f"{self.name[1:]} must be > 0")
        setattr(obj, self.name, value)

class Order:
    price = Positive()
    qty = Positive()                      # 同一个描述符复用两处

    def __init__(self, price, qty):
        self.price = price                # 触发 Positive.__set__ 校验
        self.qty = qty

Order(10, 2)        # ok
Order(-1, 2)        # ValueError: price must be > 0
```

要点：

- **数据描述符**（有 `__set__`）优先级高于实例字典——这就是 `property` 能"挡住"赋值的原因；只有 `__get__` 的是非数据描述符（如函数本身，这也是方法绑定的原理）；
- `__set_name__`（3.6+）让一个描述符类可以复用到多个属性，不用再手工传名字；
- Pydantic、SQLAlchemy、Django ORM 的字段全是这个套路。

## 常见坑

| 坑 | 说明 |
| :--- | :--- |
| 忘 `functools.wraps` | 函数元数据丢失，调试和文档全乱 |
| 装饰器在 import 时执行 | `@register` 的副作用在 import 就发生，小心循环导入 |
| 装饰器顺序 | 自下而上包裹：`@a @b def f` = `a(b(f))` |
| 装饰实例方法 | wrapper 里正常收 `self`（它只是第一个参数），`functools.wraps` 照用 |
| 循环变量 late binding | 见上文，默认参数固化 |
| `lru_cache` 缓存方法 | 实例和参数都被强引用（内存泄漏 + 需可哈希）；实例方法用 `cached_property` 或按字段缓存 |

## 验证与练习

本篇示例在本机 Python 3.13 全部跑通。自测两题：给 `retry` 加"只对特定异常重试"参数；写一个 `@deprecated` 装饰器，首次调用打 `DeprecationWarning`（`warnings.warn(..., stacklevel=2)`）。
