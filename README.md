# OhtoAi Blog

[![Page Deploy](https://github.com/Ohto-Ai/blog/actions/workflows/pages.yml/badge.svg?branch=master)](https://github.com/Ohto-Ai/blog/actions/workflows/pages.yml)

个人博客 / 笔记站点，使用 [MkDocs](https://www.mkdocs.org/) + [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) 构建。

- 站点：<https://blog.ohtoai.top/>
- 源码：<https://github.com/Ohto-Ai/blog>
- 内容全部免费阅读

## 内容

`docs/` 下包含 C++（资源整理、语言核心、STL、并发、工程实践、调试、算法）、Linux（命令行、文本处理、Shell 脚本、系统编程）、UE4、Minecraft（GuildPlugin、OpShop、KD 计分板等）、工具、分享、相册、Git 使用、运行状态等笔记与文章。

## 本地开发

```bash
make dependence     # 安装 mkdocs、mkdocs-material 及插件
mkdocs serve
```

然后打开 <http://127.0.0.1:8000/>。修改 `docs/` 或 `mkdocs.yml` 后页面会自动重建。

## 构建

```bash
make site
# 等价于
mkdocs build --clean
```

静态站点输出到 `site/`。

## 部署

推送到 `master` 分支后，[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 会自动构建并部署到 GitHub Pages。

## 项目结构

```text
docs/            Markdown 文章与资源
overrides/       Material 主题覆盖
mkdocs.yml       站点配置
makefile         安装依赖与构建命令
```

## 说明

仓库中的文章为个人笔记，欢迎阅读；引用或转载请注明来源。
