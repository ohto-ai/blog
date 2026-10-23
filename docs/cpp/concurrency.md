---
comments: true
---
# C++ 并发编程笔记

> `std::thread` / 锁 / 条件变量 / 原子操作 / `future`。互斥量家族的类型清单见[零碎知识小记](other-cpp-tips.md)，这里讲怎么正确组合使用。

## 线程基础

```cpp
#include <thread>

void worker(int id) { /* ... */ }

std::thread t(worker, 42);
t.join();                    // 等它结束（析构前必须 join 或 detach，否则 std::terminate）
```

!!! warning "detach 的悬垂引用"
    `detach` 之后线程仍在跑，但它引用的局部变量可能已经析构。要 detach 就把资源**按值捕获**进 lambda、用 `[smart_ptr 自守卫](smart-pointers.md)` 或 `enable_shared_from_this`。能 join 就 join。

C++20 起优先用 `std::jthread`：析构时**自动 join**，配合 `std::stop_token` 支持协作式取消：

```cpp
#include <thread>

std::jthread t([](std::stop_token st) {
    while (!st.stop_requested()) {
        doChunk();
    }
});
// t 析构时自动 request_stop() + join()
```

## 数据竞争（data race）

定义：**两个线程同时访问同一内存位置、至少一个是写、且没有同步关系** → 未定义行为，不是"偶尔结果不对"，是编译器可以任意优化出鬼畜行为。

解法三件套：互斥锁、原子操作、把可变数据拆到各线程私有（thread_local / 每线程副本最后合并）。

## 锁的正确姿势

```cpp
std::mutex m;

{   // 最常用：lock_guard，作用域结束自动解锁
    std::lock_guard<std::mutex> lk(m);
    shared_data.push(x);
}

{   // 需要中途解锁/配合条件变量：unique_lock
    std::unique_lock<std::mutex> lk(m);
    cv.wait(lk, pred);              // 内部会解锁-等待-重锁
}

{   // C++20：捷足先登一个头文件搞定
    std::scoped_lock lk(m);         // 单锁
}
{   // 一次锁多个且不会死锁（内部用死锁避免算法）
    std::scoped_lock lk(m1, m2);
}
```

**经验法则**：

1. 临界区尽量小，锁内不做 I/O、不调未知回调（可能重入死锁）；
2. 同时要两把锁 → `std::scoped_lock(m1, m2)`，或全局规定固定加锁顺序；
3. 共享读多写少 → `std::shared_mutex`（C++17），读用 `std::shared_lock`，写用 `std::unique_lock`。

## 条件变量：等待 + 通知

```cpp
std::mutex m;
std::condition_variable cv;
Queue<Task> tasks;                       // 共享队列

// ---------- 消费者 ----------
Task take() {
    std::unique_lock lk(m);
    cv.wait(lk, [&] { return !tasks.empty(); });   // 谓词版：防虚假唤醒 + 防早到的通知丢失
    Task t = std::move(tasks.front());
    tasks.pop();
    return t;
}

// ---------- 生产者 ----------
void put(Task t) {
    {
        std::lock_guard lk(m);           // 修改共享状态必须持锁
        tasks.push(std::move(t));
    }                                    // 先解锁再 notify，避免被唤醒者立刻撞锁
    cv.notify_one();
}
```

三条铁律：

1. **永远用谓词版 `wait(lk, pred)`**。裸 `wait` 会被虚假唤醒坑，而"通知先于等待"的场景会永久沉睡；
2. **修改谓词涉及的共享状态必须在持锁状态下进行**，否则 wait 检查谓词与进入睡眠之间会漏通知；
3. `notify_one` 唤醒一个（队列场景够用），`notify_all` 全部叫醒（多条件变量共享一个 mutex 时用）。

## atomic：无锁计数与标志位

```cpp
#include <atomic>

std::atomic<int> counter{0};
++counter;                              // 原子自增，无锁
int v = counter.load();                 // 读

std::atomic<bool> done{false};
done.store(true, std::memory_order_release);    // 发布：之前的写对 acquire 端可见
// 另一个线程
while (!done.load(std::memory_order_acquire)) {}
// 此处能看到 release 之前的全部写入
```

| memory_order | 含义 | 场景 |
| :--- | :--- | :--- |
| `relaxed` | 只保证原子性，不保证顺序 | 纯计数器、统计 |
| `acquire` | 读端屏障：后面的读写不能提到它前 | 与 release 配对 |
| `release` | 写端屏障：之前的读写不能漏到它后 | 发布数据 |
| `acq_rel` | 读改写同时具备两者 | fetch_add 交换类 |
| `seq_cst`（默认） | 全局全序，最直观最慢 | 不确定就用默认 |

!!! tip "先锁后锁自由"
    默认 `seq_cst` 写代码，**测出锁是瓶颈**再考虑更弱的 order 和无锁结构。手写无锁链表/队列是高手坟墓，优先用 `std::shared_ptr` 的原子接口或成熟库（folly/boost::lockfree）。

    顺带：C++11 起函数内 `static` 局部变量初始化是线程安全的（magic statics），单例直接写 `static X& inst() { static X x; return x; }`。

## future / promise / async

```cpp
#include <future>

// async：最省事的异步任务
std::future<int> f = std::async(std::launch::async, []{ return heavy(); });
int r = f.get();                        // 阻塞等结果；任务抛的异常会在这里重新抛出

// promise：手动配对的一次性通道
std::promise<int> p;
auto fut = p.get_future();
std::thread producer([&]{ p.set_value(42); });
producer.join();
int val = fut.get();
```

`std::async` 的坑：

1. **不传 policy 时**实现可以选 `deferred`（惰性，`get()` 时才在当前线程执行）——想要真异步必须显式 `std::launch::async`；
2. `std::async` 返回的 future **析构会阻塞**等任务完成（独有行为），存起来忘了等于串行；
3. 它不保证线程池，每次可能真开线程，高频小任务不划算。

## false sharing（伪共享）

两个线程写**不同**变量，但变量挨在同一个 64 字节缓存行里 → 缓存行来回失效，性能雪崩：

```cpp
struct Counters {
    alignas(64) std::atomic<uint64_t> a{0};   // 各占一条 cache line
    alignas(64) std::atomic<uint64_t> b{0};
};
// 对比：不 alignas 时 a、b 同行，多线程 ++ 各自计数慢几倍
```

多线程计数器数组的经典优化就是 `alignas(64)` 或每线程独立计数最后求和。

## 排查工具

- **ThreadSanitizer (TSan)**：`g++ -fsanitize=thread`，数据竞争检测利器，开发期常开；
- **helgrind**：Valgrind 的线程错误检测（备选）；
- 死锁事后分析：gdb 全线程 `thread apply all bt`，找互相等锁的栈。
