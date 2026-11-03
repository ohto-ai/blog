---
comments: true
---
# CMake 工程实战

> [编译与链接](compile-link.md)里只给了最小示例；这篇讲**多人真项目**里的 CMake：target 思维、依赖传播、找库、拉依赖、调试。本篇工程在 WSL cmake 3.27 + g++ 11 全量构建运行验证过。

## 心法：一切挂在 target 上

老式 CMake 全局函数（`include_directories`、`add_definitions`、`link_directories`）污染整个目录之后的所有 target。现代写法只用 **target 命令**——属性跟着目标走，谁链接谁受益：

```cmake
# ❌ 老写法（兼容旧代码时认识即可）
include_directories(include)
add_definitions(-DAPP_VERSION=2)
add_executable(app main.cpp)

# ✅ 现代写法
add_executable(app src/main.cpp)
target_include_directories(app PRIVATE include)
target_compile_definitions(app PRIVATE APP_VERSION=2)
target_compile_features(app cxx_std_20)          # 替代全局 set(CMAKE_CXX_STANDARD)
```

## PUBLIC / PRIVATE / INTERFACE：依赖传播语义

`target_link_libraries` 的三档关键字决定了"我用了某库"这件事**会不会传染给链接我的人**：

| 关键字 | 我自己用 | 链接我的人也用 | 典型场景 |
| :--- | :--- | :--- | :--- |
| `PRIVATE` | ✅ | ❌ | 只在 .cpp 里用的库（实现细节） |
| `PUBLIC` | ✅ | ✅ | 头文件里暴露了该库的类型 |
| `INTERFACE` | ❌（纯头文件库） | ✅ | header-only 库、接口要求 |

```cmake
add_library(util STATIC src/util.cpp)
target_include_directories(util PUBLIC include)     # 别人要用我的头 → PUBLIC
target_link_libraries(util PRIVATE spdlog::spdlog)  # 日志只在实现里 → PRIVATE

add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE util)             # app 自动获得 util 的头文件路径
```

**判断口诀**：出现在**公开头文件**里的依赖 → PUBLIC；只在 .cpp → PRIVATE。传播错了的典型症状：下游编译时找不到头文件，或者被迫链接一堆自己根本没用的库。

## 找库：find_package 与导入目标

```cmake
find_package(Threads REQUIRED)
target_link_libraries(app PRIVATE Threads::Threads)   # 注意 :: 命名空间的目标

find_package(Boost 1.74 COMPONENTS system)            # 版本与组件
find_package(OpenCV QUIET)                            # 可选：找不到不报错
if(NOT OpenCV_FOUND)
    message(STATUS "OpenCV not found, building without it")
endif()
```

- `REQUIRED`：找不到直接配置失败；
- 库以 `Pkg::Target` 形式提供（CMake 内置的 Threads/ZLIB 等、vcpkg/Conan 安装的也遵守）；`::` 目标自带 include 路径和依赖传播；
- 找不到时先查 `CMAKE_PREFIX_PATH`：`cmake -B build -DCMAKE_PREFIX_PATH=/path/to/install`（vcpkg 的 toolchain 文件也是干这个的，见[资源整理](cpp-resources.md)）。

## 拉源码：FetchContent

不想让用户手动装第三方库时，配置阶段直接下载源码一起编：

```cmake
include(FetchContent)
FetchContent_Declare(fmt
    GIT_REPOSITORY https://github.com/fmtlib/fmt.git
    GIT_TAG        11.1.4
)
FetchContent_MakeAvailable(fmt)          # 之后像本地 target 一样用 fmt::fmt

target_link_libraries(app PRIVATE fmt::fmt)
```

代价：首次 configure 要联网（可配镜像），构建时间变长。更大的项目用 vcpkg/Conan 管依赖，FetchContent 适合少量轻依赖。

## 生成器表达式：条件化的利器

```cmake
target_compile_options(app PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/W4>
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>>:-Wall -Wextra -Wpedantic>
)
target_compile_definitions(util PUBLIC
    $<BUILD_INTERFACE:UTIL_BUILDING>     # 只在构建 util 本身时定义
)
```

`$<条件:值>` 在生成阶段求值——"仅 MSVC 加这个选项""仅 Debug 加 -g"这类需求的标准答案。

## Presets：把配置固化进仓库

`cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=... ` 这种长命令，用 `CMakePresets.json` 收进版本库：

```json
{
    "version": 6,
    "configurePresets": [
        {
            "name": "default",
            "binaryDir": "${sourceDir}/build",
            "generator": "Ninja",
            "cacheVariables": { "CMAKE_BUILD_TYPE": "Release" }
        },
        {
            "name": "debug",
            "inherits": "default",
            "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
        }
    ]
}
```

```bash
cmake --list-presets
cmake --preset debug && cmake --build --preset debug
```

VS/CLion/VSCode 的 CMake Tools 都认 presets——**新人 clone 下来一条命令出构建**，环境差异降到最低。

## 安装与打包（简述）

```cmake
install(TARGETS app RUNTIME DESTINATION bin)
install(DIRECTORY include/ DESTINATION include)
```

`cmake --install build --prefix /tmp/pkgtree` 打包出可分发目录结构；再往上 CPack 出 tar/deb，按需查手册。

## 调试 CMake 自身

```bash
cmake -B build -LA                     # 列出全部缓存变量
cmake -B build --trace-expand 2> trace.log   # 全量展开执行轨迹（重，最后手段）
cmake --build build --verbose          # 看真实编译命令行
print(CMAKE_CXX_FLAGS)                 # 脚本里的 printf：cmake_print_variables() 更好
```

报错"找不到 xxxConfig.cmake"：先 `-LAH` 看 `xxx_DIR`，再确认 `CMAKE_PREFIX_PATH`/toolchain；报循环依赖/重复定义：大概率是老式全局命令和 target 命令混用。

## 常用命令速查

| 命令 | 作用 |
| :--- | :--- |
| `cmake -B build -S .` | 配置（源码目录 -S 可省） |
| `cmake --build build -j` | 构建（跨生成器统一入口） |
| `cmake --build build --target util` | 只构建某 target |
| `cmake --install build --prefix dir` | 安装到指定前缀 |
| `cmake -B build -G "Ninja"` | 指定生成器（Ninja 比 MSBuild/Make 快） |
| `ctest --test-dir build` | 跑 enable_testing 注册的测试 |

本篇验证工程结构：`util` 静态库（PUBLIC include + PRIVATE 内部依赖）+ `app` 可执行文件 + FetchContent 引 fmt + Threads，`cmake --preset` 两条命令出产物并运行成功——照着上面拼起来即可。
