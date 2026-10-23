---
comments: true
---
# 现代 C++ 实用特性速查

> 按 C++11 → C++23 逐版本整理"日常真的会用"的特性，每条配最小示例。C++26 的反射 / Contracts 等见[资源页](cpp-resources.md)的标准演进表。编译器支持情况查 [cppreference 支持表](https://en.cppreference.com/w/cpp/compiler_support)。

## C++11：现代 C++ 的地基

```cpp
auto it = m.find(key);                          // auto 推导
for (auto& e : vec) e *= 2;                     // 范围 for
int* p = nullptr;                               // nullptr 替代 NULL
enum class Color { Red, Green };                // 强类型枚举：Color::Red，不隐式转 int

using IntVec = std::vector<int>;                // using 别名替代 typedef
int add(int a, int b);                          // 声明后:
int add(int a, int b) = delete;                 // 禁用（比如禁拷贝）
class W { W(const W&) = delete; };              // 也用于禁拷贝

constexpr int sq(int x) { return x * x; }       // 编译期求值
class D : public B { void f() override; };      // override 显式检查重写 / final 禁再重写
```

```cpp
// lambda：[捕获](参数) -> 返回 { 体 }
auto twice = [](int x) { return x * 2; };
int base = 10;
auto addBase = [base](int x) { return x + base; };   // 值捕获
auto addRef  = [&base](int x) { return x + base; };  // 引用捕获（悬垂风险）

// 多线程库：std::thread / mutex / atomic / future（详见并发笔记）
// 智能指针：unique_ptr / shared_ptr / weak_ptr（详见智能指针笔记）
```

## C++14：小修小补

```cpp
auto mul = [](auto a, auto b) { return a * b; };    // 泛型 lambda
auto f() { return std::string{"x"}; }               // 返回类型推导

auto p = std::make_unique<Widget>();                // make_unique 终于有了
int mask = 0b1010'0001;                             // 二进制字面量 + 数字分隔符
[[deprecated]] void old();                          // 弃用警告
int old_val = std::exchange(x, 42);                 // 写 x 同时拿走旧值，移动惯用
```

## C++17：写法明显变短

```cpp
auto [it, ok] = m.try_emplace(key, args...);        // 结构化绑定
for (auto&& [k, v] : m) use(k, v);                  // 遍历 map 最舒服的写法

if (auto it = m.find(k); it != m.end()) use(it->second);   // if 带初始化语句

template <typename... Ts>
auto sum(Ts... xs) { return (xs + ...); }           // 折叠表达式

inline constexpr int kMax = 100;                    // inline 变量：头文件里定义全局常量

std::optional<std::string> find(int id);            // 可能为空的返回值
if (auto s = find(1)) use(*s);

std::variant<int, std::string> v = "abc";           // 类型安全的 union
std::visit([](auto&& x){ std::cout << x; }, v);

void take(std::string_view sv);                     // string_view：不拷贝的只读字符串

namespace fs = std::filesystem;                     // 标准库文件系统
for (auto& e : fs::directory_iterator(dir)) std::cout << e.path();

std::vector<int> v2(v.begin(), v.end());
std::sort(std::execution::par, v.begin(), v.end()); // 并行算法（execution::par）

std::vector xs{1, 2, 3};                            // CTAD：类模板实参推导
[[nodiscard]] int compute();                        // 忽略返回值会警告
auto [a2, b2] = std::minmax(3, 5);
int clamped = std::clamp(v, 0, 100);
```

## C++20：四巨头 + 一堆实用货

```cpp
// concepts：约束模板参数，报错信息终于能看了
template <typename T>
concept Number = std::integral<T> || std::floating_point<T>;
auto add(Number auto a, Number auto b) { return a + b; }

// ranges：管道风格的惰性视图
#include <ranges>
auto evens = std::views::iota(1, 100)
           | std::views::filter([](int x){ return x % 2 == 0; })
           | std::views::transform([](int x){ return x * x; });

// 协程 co_await / co_yield / co_return（co_yield 常用来写生成器）
// modules：import <vector>;（工具链支持仍在普及中）

auto cmp = [](auto a, auto b) { return a <=> b; };  // 三路比较 <=>，配合 =default 自动生成六种比较

#include <format>
std::string s = std::format("{} score: {:.2f}", name, score);  // 替代 sprintf

#include <span>
void take(std::span<int> buf);                      // 指针+长度的安全包装

std::jthread worker([]{ /* ... */ });               // jthread：析构自动 join + stop_token

bool hit = "hello world".starts_with("hello");      // starts_with / ends_with
if (m.contains(key)) { /* ... */ }                  // 关联容器 contains
Point p{.x = 1, .y = 2};                            // 指示符初始化
if constexpr / [[likely]] / std::bit_cast / std::source_location
```

## C++23：用起来最舒服的一版

```cpp
#include <print>
std::print("{} items\n", n);                        // 直接打印，格式化更快
std::println("x = {}, y = {}", x, y);

#include <expected>
std::expected<int, std::string> parse(std::string_view s);   // 错误处理替代异常/out参数
if (auto r = parse("42")) use(*r);
else std::println("err: {}", r.error());

// flat_map / flat_set：连续存储的关联容器，缓存友好
std::flat_map<int, std::string> fm;

// deducing this：成员函数按对象的值类别推导 this
struct Printer {
    void log() && { std::println("rvalue"); }
    void log() &  { std::println("lvalue"); }
};

std::string s2 = "hello c++23";
if (s2.contains("c++")) { /* ... */ }               // string::contains 终于有了

auto [idx, val] = std::views::enumerate(vec)[1];    // views::enumerate / zip
auto sq = vec | std::views::transform([](int x){ return x*x; })
              | std::ranges::to<std::vector>();     // ranges::to：视图落回容器

std::to_underlying(e);                              // enum → 整数
// std::mdspan（多维数组视图）/ std::stacktrace / std::generator
```

## 版本选用建议（2026 年）

| 目标 | 建议 |
| :--- | :--- |
| 新项目默认 | **C++20**（concepts + ranges + format + jthread 已全量可用） |
| 需要最新工具 | C++23（`std::print`、`std::expected`，GCC 14 / Clang 17+ / MSVC 19.3x 基本可用） |
| 遗留库 | C++17 保底，别再选低于 17 的基准 |
| 尝鲜 | C++26 反射已定稿，等编译器（GCC 15+ 逐步落地） |
