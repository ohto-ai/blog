---
comments: true
---
# 模板与泛型编程

> C++ 泛型编程的核心：模板怎么写、怎么特化、怎么用 concepts 约束，以及 CRTP / SFINAE 这些关键惯用法。concepts 的速查版见[现代 C++ 特性速查](modern-cpp-features.md)。

## 两种多态

| | 运行时多态 | 编译期多态（模板） |
| :--- | :--- | :--- |
| 机制 | 虚函数 + 虚表（见[零碎小记](other-cpp-tips.md)） | 实例化生成对应代码 |
| 绑定时机 | 运行时 | 编译期 |
| 开销 | 一次间接寻址 | 零运行时开销，但**每个实例化都生成代码** |
| 能力 | 继承体系内 | 鸭子类型：任何满足"长得像"的类型 |

## 函数模板

```cpp
template <typename T>
T maxOf(T a, T b) { return a > b ? a : b; }

maxOf(1, 2);            // T = int（自动推导）
maxOf<double>(1, 2.5);  // 显式指定（两个参数类型不同时必须）
maxOf(1, 2.5);          // ❌ 推导冲突：T 不能同时是 int 和 double
```

```cpp
// 两个独立类型参数
template <typename A, typename B>
auto add(A a, B b) -> decltype(a + b) { return a + b; }

// C++20 缩写函数模板：auto 参数就是模板参数
auto twice(auto x) { return x * 2; }          // 等价于上面的 template 写法

// 非类型模板参数：编译期常量
template <typename T, size_t N>
struct Array { T data[N]; constexpr size_t size() const { return N; } };
Array<int, 16> arr;
```

## 类模板与 CTAD

```cpp
template <typename T>
class Box {
public:
    explicit Box(T v) : value_(std::move(v)) {}
    const T& get() const { return value_; }
private:
    T value_;
};

Box b(42);            // C++17 CTAD：自动推导为 Box<int>，不用写 Box<int> b(42)
Box<int> b2(42);      // 显式写法
```

推导指引（需要引导推导规则时）：

```cpp
template <typename It>
struct Range { It first, last; };

template <typename It>
Range(It, It) -> Range<It>;          // 从两个迭代器推导元素类型

std::vector<int> v{1, 2, 3};
Range r{v.begin(), v.end()};          // Range<std::vector<int>::iterator>
```

## 特化：给特定类型"开小灶"

```cpp
// 全特化：T = bool 时用位存储
template <typename T>
struct Serializer {
    static std::string dump(const T& v) { return "generic"; }
};
template <>
struct Serializer<bool> {
    static std::string dump(bool v) { return v ? "1" : "0"; }
};

// 偏特化：只部分指定（指针类型、容器等模式）
template <typename T>
struct Serializer<T*> {
    static std::string dump(T* p) { return "pointer"; }
};
```

!!! note
    函数模板**没有偏特化**（只有全特化），需要按类型分支时用 `if constexpr`（见下）或重载。

## 变参模板

```cpp
// C++17 折叠表达式：最简洁的变参处理
template <typename... Args>
auto sum(Args... args) { return (args + ...); }              // sum(1,2,3) == 6

template <typename... Args>
void printAll(Args&&... args) {
    ((std::cout << args << ' '), ...);                       // 逗号折叠
    std::cout << '\n';
}

// 传统递归展开（C++11 风格，读旧代码需要认识）
template <typename T>
void unpack(const T& v) { std::cout << v << '\n'; }
template <typename T, typename... Rest>
void unpack(const T& v, const Rest&... rest) {
    std::cout << v << ' ';
    unpack(rest...);
}
```

## 类型萃取 `<type_traits>`

```cpp
#include <type_traits>

static_assert(std::is_integral_v<int>);
static_assert(std::is_pointer_v<int*>);
static_assert(std::is_same_v<std::remove_cv_t<const int>, int>);
static_assert(std::is_base_of_v<Base, Derived>);

// remove_reference 是 std::move 实现的关键：
static_assert(std::is_same_v<std::remove_reference_t<int&&>, int>);
```

常用一族：`is_integral / is_floating_point / is_pointer / is_reference / is_same / is_base_of / is_convertible / is_constructible`，以及 `remove_xxx / add_xxx / enable_if / conditional` 修改器，`_v` 取值、`_t` 取类型。

## 编译期分支：if constexpr

```cpp
// 替代 tag dispatch 和大部分 SFINAE：不满足的分支【不会实例化】
template <typename T>
std::string stringify(const T& v) {
    if constexpr (std::is_arithmetic_v<T>) {
        return std::to_string(v);
    } else if constexpr (requires { v.to_string(); }) {   // requires 表达式试探
        return v.to_string();
    } else {
        static_assert(dependent_false_v<T>, "no stringify for this type");
    }
}
```

## concepts：给模板加约束（C++20）

```cpp
#include <concepts>

// 内置 concepts：integral / floating_point / same_as / convertible_to /
//                derived_from / movable / copyable / default_initializable / ...
template <std::integral T>
T gcd(T a, T b) {
    while (b) { T t = a % b; a = b; b = t; }
    return a;
}

// 自定义：requires 子句描述"需要什么"
template <typename T>
concept Drawable = requires(T obj, std::ostream& os) {
    obj.draw(os);                                    // 必须能 obj.draw(os)
    { obj.area() } -> std::convertible_to<double>;   // 且 area() 可转 double
};

template <Drawable T>
void render(const T& obj) { obj.draw(std::cout); }

// 多个 concept 用 && 组合；不满足时报错信息直指约束，好读太多
```

!!! tip "concepts 替代 SFINAE"
    旧代码里 `std::enable_if_t<...>` 的所有用法，基本都能改成 concepts 或 `if constexpr`。新代码**不要再写 SFINAE**，但要认识它（老代码库铺天盖地）：

    ```cpp
    // 经典 SFINAE：替换失败不是错误，只是把这个重载移出候选集
    template <typename T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
    void f(T v) { /* 只对整数开放 */ }
    ```

## CRTP：静态多态

派生类把自己作为模板参数传给基类，基类在编译期就知道实际类型——没有虚表开销：

```cpp
template <typename Derived>
class Comparable {
public:
    bool operator!=(const Derived& other) const {
        return !static_cast<const Derived&>(*this).operator==(other);
    }   // 只写 != 的通用逻辑，== 由子类提供
};

class Version : public Comparable<Version> {
public:
    explicit Version(int n) : n_(n) {}
    bool operator==(const Version& o) const { return n_ == o.n_; }
private:
    int n_;
};

static_assert(Version(1) != Version(2));   // != 自动可用
```

典型应用：`enable_shared_from_this`（见[智能指针](smart-pointers.md)）、运算符 mixin、性能敏感的对象计数。

## 代码组织与常见坑

- **模板定义放头文件**：编译器实例化时必须看到完整定义（原因见[编译与链接](compile-link.md)的 undefined reference 清单）。放 `.cpp` 需要在那里**显式实例化**所有用到的类型；
- **代码膨胀**：`T=int` 和 `T=double` 是两份代码。用类型擦除（`std::function` 思路）或把不依赖 T 的逻辑提到基类/非模板函数可以收敛体积；
- **两阶段查找**：依赖模板参数的名称要用 `this->` 或 `template`/`typename` 消歧，嵌套依赖类型一律 `typename T::type`；
- 报错信息爆炸是模板老问题，concepts 普及后已大幅好转——约束写得好，报错就在约束那一行。
