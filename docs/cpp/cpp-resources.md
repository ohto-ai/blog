---
comments: true
---
# C++ 学习资源与文档整理

> 整理日常开发中最常用、最权威的 C++ 文档与学习资源，按「教程 → 参考 → 最佳实践 → 工具 → 书籍」的学习路径排序。最后更新：2026-10。

## 标准演进速览

| 标准 | 发布年份 | 关键特性 |
| :--- | :--- | :--- |
| C++98/03 | 1998/2003 | STL、模板、异常 |
| C++11 | 2011 | auto、lambda、智能指针、move 语义、constexpr、线程库 |
| C++14/17 | 2014/2017 | 泛型 lambda、结构化绑定、if constexpr、std::optional/variant/string_view、并行算法 |
| C++20 | 2020 | concepts、coroutines、ranges、modules、std::format、jthread |
| C++23 | 2023 | std::expected、std::print、std::flat_map、deducing this、std::mdspan |
| C++26 | 2026 | 静态反射（`^` / `[: :]`）、Contracts（`contract_assert`）、`std::execution`（Senders/Receivers）、Pack Indexing、占位符 `_`、Hazard Pointers |

!!! note "C++26 进展"
    ISO C++ 委员会已于 **2026 年 3 月**完成 C++26 的全部技术工作，正式 ISO 出版物随后发布。详见 [Herb Sutter 的会议报告](https://herbsutter.com/2026/03/29/c26-is-done-trip-report-march-2026-iso-c-standards-meeting-london-croydon-uk)与 [isocpp.org 官方状态页](https://isocpp.org/std/status)。

## 入门教程

- **[Learn C++](https://www.learncpp.com/)** — 公认最好的免费 C++ 教程，从零基础一路讲到现代 C++，章节后带小练习，持续更新跟进新标准。**首选入门材料**。
- **[cppreference 的 C++ 语言入门](https://en.cppreference.com/w/cpp/language)** — 严格按标准措辞描述语言规则，适合当作「字典」配合教程使用。
- **[OI Wiki](https://oi-wiki.org/)** — 中文，面向信息学竞赛，但其中语言基础、STL、算法部分对普通开发者也很有参考价值。

## 权威参考

- **[cppreference.com](https://en.cppreference.com/)** — 事实上的标准参考站，覆盖语言与标准库全部细节，示例丰富。中文翻译版可用（部分页面滞后于英文版）。
    - [编译器支持表](https://en.cppreference.com/w/cpp/compiler_support)：查各编译器对 C++11~26 特性的支持情况，写跨平台代码前必看。
    - [Useful Resources](https://en.cppreference.com/w/cpp/links)：官方维护的外部资源清单。
- **[isocpp.org](https://isocpp.org/)** — ISO C++ 官方站点，[标准状态页](https://isocpp.org/std/status)跟踪各特性进入哪个标准，[FAQ](https://isocpp.org/faq) 值得通读。
- **[C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)** — Bjarne Stroustrup 与 Herb Sutter 维护的编码准则，「怎么写才是好的现代 C++」的标准答案。

## 最佳实践与惯用法

- **[C++ Patterns](https://cpppatterns.com/)** — 现代 C++ 惯用法小例子集合。
- **[More C++ Idioms](https://en.wikibooks.org/wiki/More_C%2B%2B_Idioms)** — Wikibooks 上的惯用法大全（EBO、CRTP、Pimpl 等都有覆盖）。
- **[C++ Best Practices](https://github.com/cpp-best-practices/cppbestpractices)** — Jason Turner 维护的工程实践清单，配套 [CppBestPractices 会议](https://github.com/cpp-best-practices/toolchain)工具链脚本。

## 在线工具

- **[Compiler Explorer (godbolt.org)](https://godbolt.org/)** — 在线多编译器对比，看汇编、对比优化等级、分享代码片段，C++ 开发者瑞士军刀。
- **[Quick C++ Benchmark](https://quick-bench.com/)** — 在线微基准测试，写性能敏感代码前先量一量。
- **[C++ Insights](https://cppinsights.io/)** — 看「编译器视角」的代码：lambda 如何展开、auto 推导成什么、协程如何变换。
- **[Wandbox](https://wandbox.org/) / [Coliru](http://coliru.stacked-crooked.com/)** — 在线编译运行，支持较新的编译器版本和命令行参数。

## 构建与依赖管理

- **[CMake 官方文档](https://cmake.org/documentation/)** + [Modern CMake 中文指南](https://modern-cmake-cn.github.io/Modern-CMake-zh_CN/)（[英文版](https://cliutils.gitlab.io/modern-cmake/)）— 现代 CMake 写法入门。
- **[vcpkg](https://vcpkg.io/)** / **[Conan](https://conan.io/)** — 主流 C++ 包管理器，Windows 上 vcpkg 与 MSVC/Visual Studio 集成最好。
- **[cppget](https://cppget.org/) / build2** — 另一套生态，了解即可。

## 库索引

- **[awesome-cpp](https://github.com/fffaraz/awesome-cpp)** — GitHub 上最全的 C++ 库/工具/资源清单，找轮子先来这里。
- 常用单一库文档：[Boost](https://www.boost.org/doc/libs/)、[fmt](https://fmt.dev/latest/)、[spdlog](https://github.com/gabime/spdlog)、[range-v3](https://ericniebler.github.io/range-v3/)、[Qt](https://doc.qt.io/)。

## 书籍（经典推荐）

| 阶段 | 书 |
| :--- | :--- |
| 入门 | 《C++ Primer》（第 5 版，C++11）、《C++ Primer Plus》 |
| 进阶 | 《Effective C++》《Effective Modern C++》（C++11/14 必读）、《C++ Concurrency in Action》（并发必读） |
| 深入 | 《Inside the C++ Object Model》（对象模型）、《C++ Templates》（模板）、《The Design and Evolution of C++》（语言设计史） |
| STL | 《STL 源码剖析》（侯捷，中文） |

## 会议视频与社区

- **CppCon / Meeting C++ / C++Now** — 演讲视频都在 YouTube 免费观看，[CppCon 频道](https://www.youtube.com/user/CppCon)尤为推荐。
- [r/cpp](https://www.reddit.com/r/cpp/) — 标准动态、库发布的第一手消息。
- [std::proposals](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/) — WG21 论文索引，想跟踪 C++26/29 提案原文从这里找。
- 中文社区：知乎 C++ 话题、GitHub 上的 [CppGuide](https://github.com/balloonwj/CppGuide)（C++ 服务端开发知识整理）等。

## 建议的学习路径

1. **Learn C++** 过一遍基础（跳过 C 风格章节可以快些）；
2. 写小项目，遇到 API 问题查 **cppreference**；
3. 读 **Effective Modern C++** 校准习惯，对照 **Core Guidelines**；
4. 用 **Compiler Explorer / Quick-Bench** 建立对代码生成与性能的直觉；
5. 关注 **r/cpp 与 CppCon**，跟进标准演进（当前主线：C++26）。
