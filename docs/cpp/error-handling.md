---
comments: true
---
# C++ 错误处理：异常、错误码与 expected

> 错误处理的三个流派各有地盘。[错误码封装](error-code.md)讲过工程化的错误码，这篇补全全景：**异常**、**错误码**、**`std::expected`**（C++23）怎么选、怎么写对。异常与 RAII 部分在本机 g++ 11 验证，`std::expected` 基础接口在 g++ 12 验证（monadic 链式需 GCC 13+，本机如实标注未验证）。

## 三种方案对比

| | 异常 | 错误码 / `std::error_code` | `std::expected<T, E>` |
| :--- | :--- | :--- | :--- |
| 错误路径开销 | 栈展开（贵） | 一次 if 判断 | 一次 if 判断 |
| 正常路径开销 | 近乎零（zero-cost 模型） | 每次调用都要检查 | 每次调用都要检查 |
| 可忽略性 | **无法忽略**（不接就飞出去） | 容易被无视 | 无法忽略（有值必有状态） |
| 携带信息 | 任意对象 + 嵌套 | int / 自定义类 | 自定义 E 类型 |
| 构造函数报错 | 唯一手段 | 做不到（无返回值） | 静态工厂可绕开 |
| 生态约束 | 不能用于关闭异常的构建 | 处处可用 | C++23 + 编译器支持 |

## 异常：栈展开与 RAII 是一对

```cpp
#include <stdexcept>

Widget load(const std::string& path) {
    FileHandle file(path);                 // RAII：无论后面从哪退出都会关闭
    if (!file.open())
        throw std::runtime_error("cannot open: " + path);   // 抛出 → 栈展开
    Widget w = parse(file);
    if (!w.valid())
        throw std::invalid_argument("bad content in " + path);
    return w;
}

try {
    Widget w = load("data.bin");
} catch (const std::invalid_argument& e) {          // 先接具体类型
    log(e.what());
} catch (const std::exception& e) {                 // 再接基类兜底
    log(e.what());
} catch (...) {                                     // 转发/翻译成自己的错误模型
    throw;
}
```

要点：

- **栈展开时沿途所有栈上对象的析构函数都会执行**——这是异常安全和 RAII 能配合的根基（[智能指针](smart-pointers.md)、`lock_guard` 全靠它）。析构函数里抛异常会直接 `std::terminate`，析构函数永远 `noexcept`；
- **按 const 引用接**：按值接会切掉派生类信息并多一次拷贝；
- `throw;`（空 throw）原样重抛当前异常，保留原始对象；包装新错误时用嵌套异常保留链：

```cpp
try {
    parseConfig(path);
} catch (const std::exception& e) {
    std::throw_with_nested(AppError("config load failed"));   // 链上原异常
}
// 取链：dynamic_cast<const std::nested_exception&>(e).rethrow_nested();
```

### noexcept 不只是"不抛"的声明

它是**契约与优化**的双重语义：移动构造标 `noexcept` 才会被 `vector` 扩容采用（[移动语义篇](move-semantics.md)的教训）；运行中真的抛出会直接 terminate。规则：**移动构造、swap、析构 noexcept；普通函数确定了不抛再标**。

### 异常的真实成本与"禁异常"生态

正常路径近乎零成本（异常表静态生成），**抛出路径**是百倍于返回值检查的开销——所以只在真异常时抛，别拿异常做流程控制。更重要的事实：**游戏引擎和嵌入式普遍禁用异常**——**UE4/UE5 就编译在 `-fno-exceptions` 下**，代码里用 `check()`/错误码。在这些生态里写库必须提供错误码/返回值接口。

## 错误码：从裸 enum 到 std::error_code

裸 enum 的工程化封装见[错误码封装](error-code.md)。标准库给的升级版是 `std::error_code` + 自定义 category——错误可以带上下文、跨层传递、与 `errno`/系统错误互通：

```cpp
#include <system_error>

enum class app_errc { ok = 0, not_found = 1, timeout = 2 };

// 声明 category（样板代码一次性）
namespace std {
template <> struct is_error_code_enum<app_errc> : true_type {};
}
// std::make_error_code(app_errc) 的重载 + app_category 实现（略，见 error-code.md）

std::error_code try_open(const std::string& path) {
    FILE* f = fopen(path.c_str(), "r");
    if (!f)
        return {errno, std::generic_category()};   // 直接包装系统错误
    fclose(f);
    return {};
}

if (auto ec = try_open("a.txt"))
    std::fprintf(stderr, "open failed: %s\n", ec.message().c_str());
```

## std::expected：返回值方案的天花板（C++23）

`expected<T, E>` 是"要么有值，要么有错误"的代数类型——**接口签名即文档**，调用方不可能无视错误还拿到值：

```cpp
#include <expected>

enum class ParseErr { empty, not_a_number, out_of_range };

std::expected<int, ParseErr> parse_int(std::string_view s) {
    if (s.empty())   return std::unexpected(ParseErr::empty);
    int v{};
    try { v = std::stoi(std::string(s)); }
    catch (...) { return std::unexpected(ParseErr::not_a_number); }
    if (v > 1000)    return std::unexpected(ParseErr::out_of_range);
    return v;                       // 隐式构造成功值
}

if (auto result = parse_int("42"))
    use(*result);                   // * 解引用成功值
else
    use(result.error());            // .error() 取错误
```

monadic 链式（**GCC 13+ / MSVC 19.37+**，GCC 12 只有基础接口——本机实测 `and_then` 报 no member）让错误自动短路，像 Rust 的 Result：

```cpp
auto result = parse_int("42")
    .and_then([](int v) { return validate(v); })     // 失败直接跳过后续
    .transform([](int v) { return v * 2; })
    .or_else([](ParseErr e) { log(e); return std::expected<int, ParseErr>(0); });
```

对比错误码：**不可能忘记检查**（忘了检查时 `*result` 语义清晰且状态可查）；对比异常：开销即普通返回值，能进禁异常的构建。代价：函数签名变啰嗦、C++23 编译器要求（GCC 12+ / MSVC 19.33+，查[编译器支持表](cpp-resources.md)）。

## 决策表

| 场景 | 推荐 |
| :--- | :--- |
| UE4/UE5、嵌入式、禁异常构建 | 错误码或 `expected` |
| 常规应用/服务的可恢复错误 | `expected`（C++23）或错误码 |
| 构造函数失败、真正的"不可能"状态（编程 bug） | 异常 / `assert`+abort |
| 跨动态库边界的 C ABI | **错误码**（异常穿越 .so/.dll 边界是 UB 重灾区，见[编译与链接](compile-link.md)） |
| 原型/工具脚本 | 异常最省事 |
| 高频失败路径（如缓存 miss） | 返回值表达（`optional`/`expected`），异常当流程控制是性能毒药 |

一句话总结：**新代码接口层用 `expected` 表达可预期失败，异常留给不变量被破坏，错误码留给禁异常生态与 C 边界**——三者的地盘几乎不重叠。
