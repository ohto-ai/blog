---
comments: true
---
# 移动语义与完美转发

> C++11 最重要的变革。搞懂这篇，[智能指针](smart-pointers.md) 的 move-only 行为和标准库容器为什么快就都通了。

## 值类别速览

| 类别 | 例子 | 能否取地址 | 能被移动 |
| :--- | :--- | :--- | :--- |
| lvalue | 具名变量 `x`、`*p`、前置`++i` | ✅ | 可（显式 `std::move`） |
| prvalue (纯右值) | 字面量 `42`、`x+1`、`Widget()` | ❌ | ✅（天然） |
| xvalue | `std::move(x)`、`std::forward<T>(x)` | ❌ | ✅ |

日常判断：**有名字能继续用的就是 lvalue，临时的就是要被搬走的**。

## std::move 不移动任何东西

`std::move` 只是**到右值引用的类型转换**，真正的"移动"发生在被选中重载的**移动构造/移动赋值**里：

```cpp
std::string a = "hello";
std::string b = std::move(a);   // 选中 string 的移动构造：把 a 内部指针"偷"给 b
// 此后 a 处于 valid but unspecified 状态：只能赋新值、析构，别假设内容
```

对没有移动构造的类型（或 `const` 对象），`std::move` 之后静默退化为**拷贝**：

```cpp
const std::string c = "hi";
std::string d = std::move(c);   // ❌ 退化为拷贝：const T&& 绑不上 T&& 移动构造
```

## Rule of Five / Rule of Zero

一旦自定义了析构 / 拷贝构造 / 拷贝赋值 / 移动构造 / 移动赋值**中的任何一个**，大概率五个都得想清楚（"Rule of Five"）：

```cpp
class Buffer {
public:
    Buffer() = default;
    explicit Buffer(size_t n) : size_(n), data_(new char[n]) {}
    ~Buffer() { delete[] data_; }

    Buffer(const Buffer& o)                      // 拷贝构造：深拷贝
        : size_(o.size_), data_(o.size_ ? new char[o.size_] : nullptr) {
        std::copy(o.data_, o.data_ + o.size_, data_);
    }

    Buffer(Buffer&& o) noexcept                  // 移动构造：偷资源，置空对方
        : size_(o.size_), data_(o.data_) {
        o.data_ = nullptr; o.size_ = 0;
    }

    Buffer& operator=(Buffer o) noexcept {       // 拷贝/移动赋值二合一：按值传参 + swap
        std::swap(size_, o.size_);
        std::swap(data_, o.data_);
        return *this;
    }

private:
    size_t size_ = 0;
    char*  data_ = nullptr;
};
```

更好的策略是 **Rule of Zero**：成员全部用 `std::string` / `std::vector` / [智能指针](smart-pointers.md)，让编译器生成的五个函数全部正确，一个都不写。

!!! warning "移动构造必须 noexcept"
    `std::vector` 扩容时为了异常安全，只有当元素的移动构造是 `noexcept` 时才用移动，否则退回拷贝（`std::move_if_noexcept`）。**忘写 `noexcept` = 白写了移动构造**，容器扩容照样深拷贝。

## 完美转发

### 转发引用（不是右值引用！）

```cpp
template <typename T>
void f(T&& x);        // T&& 且 T 待推导 → 转发引用，lvalue 和 rvalue 都能绑

void g(Widget&& w);   // 具体类型 && → 就是普通右值引用
```

配合**引用折叠**规则：传 lvalue 时 `T` 推导为 `Widget&`，`Widget& &&` 折叠成 `Widget&`；传 rvalue 时 `T` 是 `Widget`，保持 `Widget&&`。

### std::forward：按原样转发

```cpp
template <typename T, typename... Args>
std::unique_ptr<T> make(Args&&... args) {
    // args 在函数体内是 lvalue（有名字），必须转回原来的值类别
    return std::unique_ptr<T>(new T(std::forward<Args>(args)...));
}
```

- `std::move(x)`：**无条件**转右值——确定要掏空它时用；
- `std::forward<T>(x)`：**有条件**转——参数原本是右值才是右值，转发给别人时用。

## 高频误区

```cpp
// 1. return 不要写 std::move
std::vector<int> make() {
    std::vector<int> v{1, 2, 3};
    return std::move(v);     // ❌ 禁用了 NRVO，可能多一次移动构造
}                            // ✅ 直接 return v;（编译器要么消除拷贝，要么隐式按移动处理）

// 2. move 过的别再用
std::string s = std::move(t);
std::cout << t.size();       // ❌ 未指定行为状态，只有赋新值/析构是安全的

// 3. 成员 move 后对象仍要可析构
struct Holder {
    std::string name;
    ~Holder() { log(name); } // move 走 name 后这里 log 的是空串，string 析构本身安全
};

// 4. setter 按值传 + move：简洁且只多一次廉价移动
void set_name(std::string n) { name_ = std::move(n); }   // lvalue 一次拷贝一次移动，rvalue 零拷贝

// 5. lambda 捕获：init-capture 才能移入（C++14）
auto task = [buf = std::move(big_buffer)]() { process(buf); };
```

## 一图总结

```text
T obj;             // lvalue
f(obj)             // 拷贝（若 f 取值）
f(std::move(obj))  // 移动，obj 进入掏空状态
f(T{});            // prvalue → C++17 起直接在目标构造（guaranteed copy elision）

template<class A> void g(A&& a);          // A&& 推导中 = 转发引用
void h(Widget&& w);                        // 具体类型&& = 右值引用，只收 rvalue
g 里面: std::forward<A>(a)                 // 还原调用时的值类别
任何地方: std::move(x)                      // 我确定不再用它，请掏空
```
