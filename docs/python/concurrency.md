---
comments: true
---
# Python 并发：GIL、线程与进程

> Python 的并发选型比 C++（见[C++ 并发笔记](../cpp/concurrency.md)）简单得多——因为 **GIL** 替你砍掉了一半选项。核心是搞清楚什么时候用线程、什么时候用进程、什么时候上[异步](asyncio.md)。

## GIL：全局解释器锁

CPython 里**同一时刻只有一个线程在执行 Python 字节码**。这意味着：

- 多线程**无法**让 CPU 密集代码变快（甚至更慢，因为抢锁）；
- 但**IO 等待时会释放 GIL**（socket/read/sleep 等）——所以多线程对 IO 密集任务依然有效；
- C 扩展（numpy、hashlib、zlib）可以在计算时主动释放 GIL，所以"调库算"也常常吃得到多核。

```python
import sys
print(sys.version)        # 3.13+ 可选 free-threading 构建（见文末）
```

## 选型决策表

| 任务类型 | 首选 | 原因 |
| :--- | :--- | :--- |
| IO 密集，量大（几百上千连接） | **asyncio** | 单线程万级并发，切换开销最小 |
| IO 密集，量小 / 依赖同步库 | **threading**（线程池） | 简单，同步库直接用 |
| CPU 密集 | **multiprocessing**（进程池） | 每进程独立 GIL，真并行 |
| CPU 密集但是纯数组计算 | **numpy / C 扩展** | 底层释放 GIL + 向量化，比进程池更值 |

## threading：线程与线程池

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch(url: str) -> int:
    ...  # requests.get(url).status_code

urls = [f"https://example.com/{i}" for i in range(50)]

# 线程池：IO 任务的默认答案
with ThreadPoolExecutor(max_workers=10) as pool:
    futures = {pool.submit(fetch, u): u for u in urls}
    for fut in as_completed(futures):        # 谁先完成先处理谁
        print(futures[fut], fut.result())

# 一行版：
with ThreadPoolExecutor(10) as pool:
    results = list(pool.map(fetch, urls))    # 顺序对应输入
```

需要锁的场景（共享可变状态）与 C++ 相同的套路：

```python
import threading

counter = 0
lock = threading.Lock()

def bump() -> None:
    global counter
    for _ in range(100_000):
        with lock:                # += 不是原子操作
            counter += 1

threads = [threading.Thread(target=bump) for _ in range(4)]
for t in threads: t.start()
for t in threads: t.join()
print(counter)                    # 400000（没锁就是随机值）
```

!!! tip "先想想能不能不加锁"
    用 `queue.Queue` 传递数据（生产者-消费者）、或每线程独立数据最后合并，比共享+加锁可靠得多。Python 里锁的开销也大——GIL 本身就是一把大锁。

## multiprocessing：真并行

```python
from concurrent.futures import ProcessPoolExecutor
import time

def cpu_heavy(n: int) -> int:
    return sum(i * i for i in range(n))

if __name__ == "__main__":        # ← Windows/spawn 模式下【必须】有这行！
    nums = [10_000_000] * 4

    t0 = time.perf_counter()
    with ProcessPoolExecutor() as pool:
        results = list(pool.map(cpu_heavy, nums))
    print(f"4 进程: {time.perf_counter() - t0:.2f}s")   # 理想 ≈ 串行/核数，实际含启动开销

    t0 = time.perf_counter()
    serial = [cpu_heavy(n) for n in nums]
    print(f"串行:   {time.perf_counter() - t0:.2f}s")   # ≈ 4 倍
```

!!! warning "Windows 用户的头号坑：`if __name__ == '__main__'`"
    Windows 创建进程用 **spawn**（不是 fork）：子进程会**重新 import 主模块**。没有 main 守卫，import 时又创建进程 → 无限递归启动，直接报错：

    ```text
    RuntimeError: An attempt has been made to start a new process before the
    current process has finished its bootstrapping phase.
    ```

    规则：**进程相关代码全部包进 main 守卫**；传给子进程的函数/数据必须可 pickle（lambda、嵌套函数、打开的文件句柄都不行）。

### 进程间通信

```python
import multiprocessing as mp

if __name__ == "__main__":
    q = mp.Queue()

    def producer():
        for i in range(5):
            q.put(f"item-{i}")
        q.put(None)                       # 结束哨兵

    p = mp.Process(target=producer)
    p.start()
    while (item := q.get()) is not None:
        print(item)
    p.join()
    # 共享内存：mp.Value('i', 0)、mp.Array('d', 100)；大数据量先想想 pickle 开销
```

进程间所有数据都走 **pickle 序列化**——传 1GB 的 DataFrame 来回搬，省下的计算时间可能全赔进去。方案：让每个子进程自己读数据、或用共享内存、或干脆 numpy。

## concurrent.futures：统一接口

线程池和进程池 API 完全一致，切换只换一个类名——先用线程池写，测出 CPU 瓶颈换进程池：

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

def run(pool_cls):
    with pool_cls(max_workers=8) as pool:
        return list(pool.map(task, items))

run(ThreadPoolExecutor)     # IO 密集
run(ProcessPoolExecutor)    # CPU 密集
```

## 亲手量一次：线程 ≠ 并行

```python
# 同一份 CPU 任务，4 线程几乎不比串行快，4 进程 ≈ 4 倍
import time, threading
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

def burn(_):
    return sum(i * i for i in range(2_000_000))

if __name__ == "__main__":
    t0 = time.perf_counter(); [burn(i) for i in range(4)]
    print(f"串行:   {time.perf_counter()-t0:.2f}s")
    t0 = time.perf_counter()
    with ThreadPoolExecutor(4) as p: list(p.map(burn, range(4)))
    print(f"4 线程: {time.perf_counter()-t0:.2f}s")     # ≈ 串行（GIL）
    t0 = time.perf_counter()
    with ProcessPoolExecutor(4) as p: list(p.map(burn, range(4)))
    print(f"4 进程: {time.perf_counter()-t0:.2f}s")     # ≈ 串行 / 4
```

（这段在本机 Python 3.13 实测：串行 1.63s、4 线程 1.67s、4 进程 0.81s——**线程与串行几乎一样慢，GIL 实锤**；进程约 2 倍而不是理论的 4 倍，差距是 spawn 启动开销与整机负载。）

!!! tip "任务要够大才配用进程池"
    Windows 的 spawn 启动一个进程要重导入模块（实测约 0.1–0.3s/个）。任务太小（毫秒级）时启动开销会**吃光并行收益甚至倒赔**——本篇 benchmark 初版用 150 万元素/任务，进程版反而比串行慢，放大到 800 万才体现优势。细碎任务留在单进程里批处理，或改用线程/异步。

## 常见坑清单

| 坑 | 说明 |
| :--- | :--- |
| Windows 下没写 main 守卫 | spawn 重新 import → 递归起进程，见上文 |
| 进程池传 lambda/闭包 | 不可 pickle，`PicklingError`；改成模块级函数 |
| 多线程改共享变量不加锁 | `+=` 等复合操作不是原子的 |
| 子进程异常被吞 | `future.result()` 会重新抛出——记得取结果 |
| daemon 线程写文件 | 主进程退出 daemon 线程被硬杀，写到一半 |
| 进程池里再开进程池 | 嵌套 spawn 容易死锁/爆炸，避免 |
| 用多线程跑 CPU 任务求提速 | GIL：没用，换进程或 numpy |

## 3.13+：free-threading 展望

PEP 703 的**免 GIL 构建**（`python3.13t`）已可实验性使用——多线程终于能真并行，代价是单线程性能折损和生态兼容期。2026 年的现实建议：**现有项目照旧按 GIL 心智模型写**，等主流发行版与 C 扩展生态跟进再考虑切换。

延伸：IO 量大到线程池都不够时，上[asyncio](asyncio.md)；写完记得配[测试与调试](testing-debugging.md)里的 pytest 把并发代码钉住。
