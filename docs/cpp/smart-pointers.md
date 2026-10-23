---
comments: true
---
# 智能指针使用指南

> RAII 思想在内存管理上的落地：[零碎知识小记](other-cpp-tips.md) 里提过 RAII 的含义，这篇展开讲 `unique_ptr` / `shared_ptr` / `weak_ptr` 的正确用法和常见坑。

## 三个指针怎么选

| 指针 | 所有权 | 开销 | 默认选择 |
| :--- | :--- | :--- | :--- |
| `std::unique_ptr<T>` | 独占，move-only | 接近裸指针（默认删除器下大小相同） | **95% 的场景** |
| `std::shared_ptr<T>` | 共享，引用计数 | 控制块 + 原子计数操作 | 确实需要共享所有权时 |
| `std::weak_ptr<T>` | 不拥有，观察者 | 同 shared_ptr 的观察版 | 打破循环引用、观察但不参与生命周期 |

**判断顺序**：能用栈对象 / 值语义就不用指针 → 需要多态或工厂返回时用 `unique_ptr` → 只有所有权真的"说不清归谁"才用 `shared_ptr`。

## unique_ptr

```cpp
#include <memory>

auto p = std::make_unique<Widget>(args...);   // C++14 起才有，优先用
std::unique_ptr<Widget> q = std::move(p);      // 只能移动，不能拷贝
if (p) p->doSomething();                       // 移动后 p 为空

auto arr = std::make_unique<int[]>(1024);      // 数组特化，自动 delete[]
```

### 自定义删除器：管理第三方资源

```cpp
// 管理 FILE*，离开作用域自动 fclose
std::unique_ptr<FILE, decltype(&fclose)> f(
    fopen("data.txt", "r"), &fclose);
if (!f) { /* 打开失败 */ }

// 写法二：无状态 lambda，不增加指针大小
auto closer = [](FILE* fp) { if (fp) fclose(fp); };
std::unique_ptr<FILE, decltype(closer)> f2{fopen("a.txt", "r"), closer};
```

!!! note "大小问题"
    默认删除器下 `sizeof(unique_ptr<T>) == sizeof(T*)`。删除器是**函数指针**时翻倍（16 字节），是**无捕获 lambda** 时不变。对性能敏感的成员变量注意这点。

## shared_ptr

```cpp
auto a = std::make_shared<Widget>();       // 推荐：一次分配同时放对象和控制块
std::shared_ptr<Widget> b = a;             // 引用计数 +1（原子操作）
auto c = std::make_shared<Widget>(*a);     // 要"复制对象"得显式解引用拷贝！
```

### 为什么优先 make_shared

```cpp
std::shared_ptr<Widget> a(new Widget);     // 两次内存分配：对象一次，控制块一次
auto b = std::make_shared<Widget>();       // 一次分配，对象和控制块放一起
```

`make_shared` 更快且异常安全。**缺点**：对象和控制块同块分配后，只要还有 `weak_ptr` 观察它，整块内存（包括对象占用的部分）都不能归还，析构函数倒是会正常执行。内存紧张或对象很大的场景要权衡。

### 线程安全性（高频误解）

- ✅ **计数操作是原子的**：不同线程同时拷贝/析构不同的 `shared_ptr` 副本（即使指向同一对象），安全；
- ❌ **指向的对象本身不保护**：多线程同时读写 `*ptr` 依然是数据竞争；
- ❌ **同一个 `shared_ptr` 实例**被一个线程写（reset/赋值）另一个线程读，需要加锁或用原子接口（C++20 `std::atomic<std::shared_ptr<T>>`）。

一句话：`shared_ptr` 只管理**生命周期**，不管理**数据竞争**。

## weak_ptr：打破循环引用

```cpp
struct Node {
    std::shared_ptr<Node> next;
    std::weak_ptr<Node> prev;      // 反向边用 weak，否则两个节点互相持有永不释放
};

// 观察对象是否还活着：lock() 拿 shared_ptr，死了返回空
std::weak_ptr<Widget> w = a;
if (auto sp = w.lock()) {          // 惯用法：lock + 判空
    sp->doSomething();             // 在这个作用域内对象保证存活
}
```

典型场景：缓存、观察者列表、父子关系（子持父用 weak）、异步回调里持对象。

## enable_shared_from_this

类内部（比如异步回调里）需要把 `this` 交出去，且希望交出去的是 `shared_ptr`：

```cpp
#include <memory>

class Session : public std::enable_shared_from_this<Session> {
public:
    void start() {
        // 异步操作完成后对象可能已析构，用 shared_from_this() 延长生命周期
        asyncRead([self = shared_from_this()](Result r) {
            self->onRead(r);
        });
    }
};

// 使用：必须由 shared_ptr 持有
auto s = std::make_shared<Session>();
s->start();
```

!!! warning "两个坑"
    1. **构造函数里不能调 `shared_from_this()`**——此时还没被 `shared_ptr` 接管，会抛 `std::bad_weak_ptr`；
    2. **栈对象或裸指针 new 出来的对象调用它是未定义行为/异常**。用了这个基类，类的实例就必须全程由 `shared_ptr` 管理。

    ❌ 错误替代：`shared_ptr<Session>(this)` 会创建**第二个控制块**，双重释放。

## 常见坑清单

```cpp
Widget* raw = new Widget;
std::shared_ptr<Widget> a(raw);
std::shared_ptr<Widget> b(raw);        // ❌ 两个独立控制块，double free
                                        //    用 a 拷贝：auto b = a;

std::shared_ptr<Widget> c = a.get();   // ❌ 编译不过（好），但反过来
std::shared_ptr<Widget> d(a.get());    // ❌ 编译能过，同样 double free

auto sp = std::make_shared<Widget>();
delete sp.get();                        // ❌ 别对 get() 出来的指针 delete
```

| 坑 | 正确做法 |
| :--- | :--- |
| 从同一个裸指针构造多个 `shared_ptr` | 从一开始就 `make_shared`，之后只拷贝智能指针 |
| `shared_ptr` 循环引用导致泄漏 | 环上选一条边改成 `weak_ptr` |
| 在构造函数里 `shared_from_this()` | 移到 `start()` 之类的初始化方法里 |
| `make_shared` + 大对象 + 长 weak 生命周期 | 改用 `shared_ptr<T>(new T)` 分离两块内存 |
| 多线程读写**同一个** `shared_ptr` 变量 | 加锁，或 C++20 `std::atomic<std::shared_ptr<T>>` |

## 与旧代码互操作

- 函数参数：**只读就用裸指针/引用**（`void f(Widget&)` / `const Widget*`），表达"不参与所有权"；
- 需要（可能）接管所有权：`std::unique_ptr<T>` 按值传；可能存储：`shared_ptr<T>` 按值传；
- 返回值：工厂函数返回 `unique_ptr<T>`，需要共享再换 `shared_ptr`（`shared_ptr` 可以从 `unique_ptr` 隐式转换，反之不行）；
- 老接口要裸指针：`ptr.get()`，**记住裸指针不持有**，出了作用域智能指针照常释放。
