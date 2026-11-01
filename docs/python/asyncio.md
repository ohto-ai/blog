---
comments: true
---
# Python 异步编程（asyncio）

> `async/await` 的心智模型只有一句话：**单线程里跑一个事件循环，`await` 处主动让出控制权，循环去干别的活，IO 完成后再回来**。它是"并发"不是"并行"——同一时刻只有一段代码在跑。环境与工具链见[Python 环境与包管理](python-env.md)。

## 什么时候用异步

| 场景 | 选择 |
| :--- | :--- |
| 大量网络 IO（爬虫、API 网关、聊天服务） | **asyncio** |
| 少量 IO 任务、想省事 | 线程（见[并发笔记](concurrency.md)） |
| CPU 密集计算 | 多进程（异步帮不上忙） |
| 简单脚本就几个请求 | 同步代码 + `requests` |

判断标准：**等待多、计算少、连接多**——三者占齐才值得上 asyncio，否则复杂度白付。

## 基础：协程的运行

```python
import asyncio

async def fetch(name: str, delay: float) -> str:
    print(f"{name} start")
    await asyncio.sleep(delay)        # 模拟 IO；await 处让出控制权
    print(f"{name} done")
    return f"{name}-data"

async def main() -> None:
    result = await fetch("A", 1.0)    # 顺序执行，没有并发

if __name__ == "__main__":
    asyncio.run(main())               # 唯一的入口：创建事件循环并运行 main
```

**`async def` 定义协程函数，调用它返回协程对象但不执行**——必须 `await` 它或交给任务。忘掉 await 是第一大坑：

```python
async def main():
    fetch("A", 1.0)          # ❌ 什么都不会发生（还有 RuntimeWarning）
    await fetch("A", 1.0)    # ✅
```

## 并发：Task 与 gather

```python
async def main() -> None:
    # 1. create_task：立即调度，与后续代码并发
    t1 = asyncio.create_task(fetch("A", 2.0))
    t2 = asyncio.create_task(fetch("B", 1.0))
    print(await t1)               # A 先 await 但 B 在同时跑
    print(await t2)               # 总耗时 ≈ 2s 而不是 3s

    # 2. gather：一把并发，按顺序返回结果列表
    results = await asyncio.gather(
        fetch("C", 1.0),
        fetch("D", 1.5),
        return_exceptions=True,   # 某个失败不炸全局，异常作为结果返回
    )

asyncio.run(main())
```

`asyncio.TaskGroup`（3.11+）是更现代的写法——一个失败会取消其余任务，异常聚合为 `ExceptionGroup`：

```python
async with asyncio.TaskGroup() as tg:
    t1 = tg.create_task(fetch("A", 1.0))
    t2 = tg.create_task(fetch("B", 1.0))
# 全部成功后：t1.result(), t2.result()
```

## 超时与取消

```python
try:
    async with asyncio.timeout(2.0):          # 3.11+，整个块的预算
        await slow_operation()
except TimeoutError:
    print("超时了")

await asyncio.wait_for(fetch("A", 5.0), timeout=2.0)   # 老写法，等价

# 取消是协作式的：被取消的任务在 await 处收到 CancelledError
async def worker() -> None:
    try:
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        await cleanup()          # 可以做异步清理
        raise                    # 原则：清理完要 re-raise，别吞掉取消
```

## 并发限流：Semaphore

```python
sem = asyncio.Semaphore(10)                     # 最多 10 个并发请求

async def fetch_url(url: str) -> str:
    async with sem:                             # 拿不到就等
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                return await resp.text()

# 经典组合：并发抓 100 个页面，限流 10
pages = await asyncio.gather(*(fetch_url(u) for u in urls))
```

## 真实 IO：aiohttp / 异步上下文

```python
# pip install aiohttp
import aiohttp

async def main() -> None:
    async with aiohttp.ClientSession() as session:      # 会话复用连接池
        async with session.get("https://example.com") as resp:
            body = await resp.text()
```

`async with`（异步上下文管理器）和 `async for`（异步迭代器）是配套语法，socket/连接类资源几乎都支持。

## 致命坑：别阻塞事件循环

事件循环是**单线程**的——任何同步阻塞调用都会冻结所有任务：

```python
async def handler() -> None:
    time.sleep(1)                      # ❌ 全局暂停 1 秒
    requests.get(url)                  # ❌ 同上（同步 HTTP 客户端）
    total = sum(range(10_000_000))     # ❌ CPU 密集也算阻塞

    await asyncio.sleep(1)             # ✅ 异步等待
    async with aiohttp.ClientSession() as s: ...   # ✅ 异步 HTTP

# 必须用同步库时，扔进线程池：
await asyncio.to_thread(legacy_blocking_call, arg)     # 3.9+
await loop.run_in_executor(None, cpu_func, data)       # CPU 密集用进程池：
with ProcessPoolExecutor() as pool:                    # 见并发笔记
    result = await loop.run_in_executor(pool, heavy_compute, data)
```

## 常见坑清单

| 坑 | 说明 |
| :--- | :--- |
| 忘记 `await` 协程 | 什么都没发生 + RuntimeWarning |
| 在 async 里调同步阻塞库 | `requests`/`time.sleep`/重 CPU——全循环卡死 |
| fire-and-forget 任务 | `create_task` 后不持有引用：任务可能被 GC，异常无人接收。存到集合并在完成时移除 |
| `gather` 默认不隔离异常 | 一个抛异常整个 gather 抛；要隔离用 `return_exceptions=True` 或 TaskGroup |
| 在循环外调 `asyncio.run` 多次/嵌套 | 一个线程一个活动循环；库里要用 `get_running_loop()` |
| 混用同步 ORM/DB 驱动 | 数据库调用往往阻塞——选 async 驱动（如 asyncpg、SQLAlchemy 2.0 async） |

## 与线程/进程怎么选

一篇讲清三兄弟的对比与迁移：见[Python 并发笔记](concurrency.md)。速记：**IO 多选 asyncio，CPU 重选 multiprocessing，图省事选线程池**。
