---
comments: true
---
# C++20 协程入门

> 协程是**可以暂停和恢复的函数**：执行到暂停点时把局部状态保存下来，交还控制权，之后可以从暂停点继续。它是 C++20 四大特性里上手门槛最高的一个——本篇讲清心智模型，并从零实现一个可用的生成器。示例在 WSL g++ 11（`-std=c++20`）编译运行验证。

## 协程与普通函数、线程的区别

| | 普通函数 | 协程 | 线程 |
| :--- | :--- | :--- | :--- |
| 执行方式 | 调用后一口气跑完 | 可在暂停点挂起、稍后恢复 | 并行执行 |
| 状态保存 | 栈帧，返回即销毁 | 独立的**协程帧**，跨挂起保留 | 各自栈 |
| 切换成本 | — | 几条指令（用户态） | 内核态切换，成本高 |
| 谁调度 | 调用者 | 使用协程的代码（通常是事件循环） | 操作系统 |

一个函数体内只要出现 `co_await`、`co_yield`、`co_return` 之一，它就是协程函数。`co_yield` 挂起并交出一个值（生成器），`co_await` 挂起并等待一个异步操作完成，`co_return` 结束协程。

## 为什么不能直接用：promise_type

C++20 协程是"裸机制"：编译器只负责把函数体改写成状态机，**挂起时做什么、怎么传值、怎么结束，全由 `promise_type` 定制**。标准库没有提供现成的生成器或任务类型（`std::generator` 要到 C++23），所以要么自己写（本篇），要么用库（cppcoro、asio、Folly）。

`promise_type` 需要提供以下接口：

| 成员 | 何时调用 |
| :--- | :--- |
| `get_return_object()` | 协程启动时，返回给调用者的对象 |
| `initial_suspend()` | 函数体执行前（`suspend_never` 立即执行，`suspend_always` 惰性） |
| `yield_value(v)` | 每次 `co_yield v`，通常保存 v 并挂起 |
| `final_suspend()` | 函数体结束（必须 `noexcept`） |
| `return_void()` / `return_value(v)` | `co_return` 时 |
| `unhandled_exception()` | 函数体内有异常逃出时 |

## 从零实现 Generator

```cpp
#include <coroutine>
#include <cstdio>
#include <exception>
#include <utility>

template <typename T>
struct Generator {
    struct promise_type {
        T current{};
        Generator get_return_object() {
            return Generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() noexcept { return {}; }  // 惰性：创建后不立即执行
        std::suspend_always final_suspend() noexcept { return {}; }    // 结束后保留，由调用方销毁
        std::suspend_always yield_value(T v) { current = v; return {}; }
        void return_void() {}
        void unhandled_exception() { std::terminate(); }
    };

    std::coroutine_handle<promise_type> handle{};

    explicit Generator(std::coroutine_handle<promise_type> h) : handle(h) {}
    Generator(const Generator&) = delete;              // 句柄独占
    Generator(Generator&& other) noexcept : handle(std::exchange(other.handle, {})) {}
    Generator& operator=(Generator&&) = delete;
    ~Generator() { if (handle) handle.destroy(); }     // 负责释放协程帧

    bool next() {            // 恢复执行到下一个 co_yield 或结束
        handle.resume();
        return !handle.done();
    }
    T value() const { return handle.promise().current; }
};

Generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;                    // 挂起，交出当前值
        int next = a + b;
        a = b;
        b = next;
    }
}

int main() {
    Generator<int> gen = fibonacci();  // 创建协程帧，尚未执行函数体
    for (int i = 0; i < 10 && gen.next(); ++i)
        std::printf("%d ", gen.value());   // 0 1 1 2 3 5 8 13 21 34
    std::printf("\n");
}
```

```bash
g++ -std=c++20 -Wall -Wextra fib.cpp -o fib && ./fib
# 0 1 1 2 3 5 8 13 21 34
```

这份代码覆盖了协程的一半本质：**`co_yield` 把函数变成可逐次取值的惰性序列**，即使 `while (true)` 也不会死循环——每次 `next()` 只推进到下一个暂停点。

## co_await：等待一个"可等待对象"

`co_await expr` 里的表达式需要提供三个成员函数（合称 awaiter）：

| 成员 | 作用 |
| :--- | :--- |
| `await_ready()` | 快速路径：是否已经就绪、无需挂起 |
| `await_suspend(handle)` | 真正挂起时执行：注册回调、把 handle 交给事件循环等 |
| `await_resume()` | 恢复时的返回值（即 `co_await` 表达式的值） |

自己手写 awaiter 属于进阶内容；应用层通常直接使用库提供的可等待对象（asio 的 `async_read` 等）。理解要点：**`co_await` 把"回调式"异步代码变成顺序写法**——挂起点之后的代码，运行时才继续，中间不会阻塞线程。

## 容易出错的细节

| 问题 | 说明 |
| :--- | :--- |
| 协程帧在堆上 | 默认分配协程帧保存状态；高频小协程注意分配开销（HALO 等优化交给编译器） |
| **参数悬垂** | 协程函数按引用收参数，挂起期间引用的对象可能已析构。协程参数**一律按值传递**（类类型可 move） |
| 句柄生命周期 | `coroutine_handle::destroy()` 释放协程帧；挂起在 `final_suspend` 的协程必须由调用方销毁，忘记就泄漏 |
| `final_suspend()` 必须 `noexcept` | 语言规则，忘写无法编译 |
| 挂起在 `initial_suspend` | 惰性启动——创建协程与开始执行分离；`suspend_never` 则创建即执行 |
| 协程体内不能用普通 `return` | 只能 `co_return`；也不能在构造函数/析构函数/`constexpr`/`main` 里写协程 |

## 应用场景

- **惰性序列**：生成无限序列、按需计算（本篇 Generator）；
- **异步 IO**：网络库（asio、cppcoro）把回调风格接口包装为 `co_await`，业务代码恢复顺序书写（与 [Python asyncio](../python/asyncio.md) 的心智模型相同）；
- **状态机**：`co_yield` 天然适合逐步产出的逻辑（解析器、流水线）。

相关：异步的原理与线程侧对比见[并发编程笔记](concurrency.md)；[Python 生成器](../python/generators.md)是同样思路的低门槛版本。
