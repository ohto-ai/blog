---
comments: true
---
# C++ 编译与链接笔记

> `undefined reference` 到底是谁的锅。搞懂翻译单元、符号和库，一半的"玄学编译问题"会变成看报错就行。

## 从源文件到可执行文件：四个阶段

```bash
g++ -E main.cpp -o main.i    # 1. 预处理：展开 #include / 宏 → .i 纯文本
g++ -S main.i  -o main.s     # 2. 编译：生成汇编 → .s
g++ -c main.s  -o main.o     # 3. 汇编：生成目标文件（机器码 + 符号表）→ .o
g++ main.o -o app            # 4. 链接：合并所有 .o 和库 → 可执行文件

# g++ main.cpp 一条命令 = 全部四步
```

排查编译问题时把阶段拆开：`.i` 里还能看到源码说明头文件展开正确；`.s`/`.o` 阶段的错误就是真·编译错误。

## 翻译单元与 ODR

- **翻译单元（TU）**= 一个 `.cpp` 文件 + 递归展开的所有头文件。编译器一次只看一个 TU。
- **ODR（单一定义规则）**：类、函数、模板、inline 变量可以有**多处相同定义**（每个 TU 一份）；普通函数与全局变量全程序只能有一处定义。

```cpp
// 声明 vs 定义
extern int g_count;             // 声明（不定义）：告诉编译器"别处有这个符号"
int g_count;                    // 定义（分配存储）
int g_count = 0;                // 定义 + 初始化

void f(int);                    // 声明
inline void f(int x) { }        // inline 定义：允许多 TU 重复出现（须一致）
static int counter = 0;         // static：仅本 TU 可见，不产生外部符号
namespace { int hidden = 0; }   // 匿名 namespace：C++ 版的 static，推荐写法
```

### 头文件的正确姿势

```cpp
// widget.h —— 头文件里只放声明
#pragma once                    // 或 include guard（#ifndef/#define/#endif），二选一
#include <string>               // 只 include 真正需要的

class Widget {
public:
    void run();                 // 声明
private:
    std::string name_;
    struct Impl;                // 前置声明（Pimpl 惯用法，见设计模式）
    Impl* impl_ = nullptr;
};

// widget.cpp —— 定义都留在这里
#include "widget.h"
void Widget::run() { /* ... */ }
```

**能前置声明就不要 include**（减少依赖、加快编译），但完整类型出现在成员/参数按值传递时必须 include。

## 符号与 name mangling

C++ 会把函数签名编码进符号名（重载的代价）：

```bash
nm main.o | grep run         # 查看 .o 里的符号表
#   0000000000000000 T _ZN6Widget3runEv
c++filt _ZN6Widget3runEv     # 还原：Widget::run()
```

```cpp
extern "C" {                  // 关闭 mangling，C/C++ 混编、写插件接口必备
    int plugin_init(void);    // 符号就是简单的 plugin_init
}

// 头文件惯用写法：
#ifdef __cplusplus
extern "C" {
#endif
int plugin_init(void);
#ifdef __cplusplus
}
#endif
```

## 静态库与动态库

| | 静态库 `.a` / `.lib` | 动态库 `.so` / `.dll` |
| :--- | :--- | :--- |
| 链接时机 | 编译期拷贝进可执行文件 | 运行期加载 |
| 产物体积 | 大 | 小，多个程序共享一份 |
| 更新 | 改库必须重链接 | 替换 `.so` 即生效（ABI 兼容时） |
| 部署 | 单文件拷走即可 | 要处理查找路径 |

```bash
# ---- 生成静态库 ----
g++ -c util.cpp -o util.o
ar rcs libutil.a util.o
g++ main.cpp -L. -lutil -o app       # -L 库目录 -l 库名（去掉 lib 前缀和后缀）

# ---- 生成动态库 ----
g++ -fPIC -shared util.cpp -o libutil.so
g++ main.cpp -L. -lutil -Wl,-rpath,'$ORIGIN' -o app   # rpath 让程序在自身目录找 .so

ldd app                              # 查看动态库依赖解析结果
```

!!! warning "链接顺序坑"
    命令行上**库必须放在使用它的目标文件之后**：`g++ main.o -lutil` ✓，`g++ -lutil main.o` ✗（链接器从左到右扫，扫库时还没见到 main.o 引用的符号，直接丢弃）。循环依赖时 `--start-group ... --end-group`。

### undefined reference 排查清单

1. 函数**声明了但没定义**（.cpp 没编译进来、没加进 CMake 源列表）；
2. **链接顺序**反了（见上）；
3. 忘写 `-l` 或 `-L`，或库版本不对；
4. 声明与定义**签名不一致**（参数类型/常量性/namespace 不同，mangled name 对不上）；
5. 只在 Windows 上：`__declspec(dllexport)` 没导出，或没定义 `WIN32` 相关宏；
6. 模板**实现写在了 .cpp** 里，使用点看不到定义（模板需放头文件或显式实例化）；
7. C/C++ 混编忘了 `extern "C"`。

## ABI：二进制兼容的隐形契约

不同编译器（gcc vs msvc）、不同大版本标准库、不同构建配置（Debug/Release、`_GLIBCXX_USE_CXX11_ABI`）生成的代码**不能随便混链**。症状往往是运行时才炸（未定义行为）而不是链接报错。原则：

- 跨模块接口尽量 `extern "C"` 或纯虚接口类；
- 跨界传 `std::string`/`std::vector` 前确认两端 ABI 一致；
- 发布动态库时注明编译器版本和构建配置。

## 常用编译选项速查

| 选项 | 作用 |
| :--- | :--- |
| `-I<dir>` / `-L<dir>` / `-l<name>` | 头文件 / 库目录 / 链接库 |
| `-std=c++20` | 语言标准 |
| `-Wall -Wextra -Wpedantic` | 警告全家桶，**默认开** |
| `-O0 / -O2 / -O3` | 优化等级（调试用 O0，发布用 O2） |
| `-g` | 调试符号（配合 [dump 调用堆栈](dump-traceback.md)） |
| `-fsanitize=address,undefined` | 内存/UB 检测，开发期常开 |
| `-fsanitize=thread` | 数据竞争检测（见[并发笔记](concurrency.md)） |
| `-fPIC -shared` | 生成动态库 |
| `-MMD -MP` | 自动生成头文件依赖（make 增量编译用） |
| `-j$(nproc)` | make 并行构建 |

## CMake 最小可用

```cmake
cmake_minimum_required(VERSION 3.16)
project(demo CXX)
set(CMAKE_CXX_STANDARD 20)

add_library(util STATIC src/util.cpp)
target_include_directories(util PUBLIC include)

add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE util)
```

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

更多资料（Modern CMake 指南、vcpkg/Conan）见[学习资源整理](cpp-resources.md)。
