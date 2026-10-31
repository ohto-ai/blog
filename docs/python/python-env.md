---
comments: true
---
# Python 环境与包管理

> Python 的"环境地狱"——装错地方、版本冲突、依赖打架——根源只有一个：**所有项目共用一个全局解释器**。解法是每个项目一个虚拟环境。本文覆盖 venv / pip / uv 全流程。

## 虚拟环境 venv：标准答案

```bash
# ---- 创建与激活 ----
python -m venv .venv                 # 在项目根目录建 .venv（约定俗成的名字）

source .venv/bin/activate            # Linux/macOS 激活
.venv\Scripts\activate               # Windows（PowerShell: activate.ps1）

# 激活后提示符带 (.venv)，python/pip 都指向虚拟环境内
which python                         # .../.venv/bin/python
python --version
deactivate                           # 退出虚拟环境
```

!!! tip "不激活也能用"
    直接用绝对路径的 python/pip 就是虚拟环境内的：`.venv/bin/pip install requests`。CI 和脚本里常这么写，省得管激活状态。

## pip 常用操作

```bash
pip install requests                 # 装
pip install "requests>=2.31,<3"      # 版本约束
pip install -r requirements.txt      # 按清单装
pip install -e .                     # 以可编辑模式装当前项目（改代码即时生效）

pip list / pip show requests         # 已装清单 / 某包详情
pip freeze > requirements.txt        # 导出当前环境（精确版本==）

pip install --upgrade requests
pip uninstall requests
```

### requirements 的两个版本

```text
# requirements.txt —— 应用级：锁死版本，可复现部署
requests==2.32.3
numpy==2.1.0

# requirements.in —— 库开发/自己用：只写直接依赖和宽松约束
requests>=2.31
numpy
```

国内加速（清华源）：

```bash
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple requests
# 永久配置：
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

## uv：2026 年的新默认

[uvc](https://github.com/astral-sh/uv)（Rust 写的 pip/venv 替代品）快 10~100 倍，一条工具链管到底，新项目值得直接上：

```bash
# 安装 uv（Windows: powershell 脚本；或 pip install uv）
curl -LsSf https://astral.sh/uv/install.sh | sh

uv venv                              # 创建 .venv（比 python -m venv 快得多）
uv pip install requests              # 兼容 pip 接口
uv pip install -r requirements.txt

# ---- 项目模式（pyproject.toml 驱动，推荐）----
uv init myproject && cd myproject
uv add requests                      # 添加依赖并写入 pyproject.toml + uv.lock
uv add --dev pytest                  # 开发依赖分组
uv run python main.py                # 自动确保环境就绪后运行
uv sync                              # 按 lockfile 精确还原环境（CI/同事接手）
uv python install 3.12               # 连 Python 解释器都能帮你装
```

| 任务 | 老办法 | uv |
| :--- | :--- | :--- |
| 建环境 | `python -m venv .venv` + activate | `uv venv` / `uv sync` |
| 装包 | `pip install` | `uv add` / `uv pip install` |
| 锁版本 | `pip freeze`（手维护） | `uv.lock` 自动生成与校验 |
| 多版本 Python | pyenv（要编译） | `uv python install 3.12` |
| 跑一次性脚本 | 手动装依赖 | `uv run --with requests script.py` |

## 版本管理速览

```bash
python --version                     # 当前的
python3.12 -m venv .venv             # 用指定版本建环境（多版本共存时）

# Windows 官方 launcher：py 列表切换
py -0                                # 列出已装版本
py -3.12 -m venv .venv

# pyproject.toml 里声明要求（uv / pip 均识别）
# requires-python = ">=3.11"
```

## pyproject.toml：现代项目的标准入口

```toml
[project]
name = "myproject"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "requests>=2.31",
]

[project.optional-dependencies]      # 额外分组
dev = ["pytest", "ruff"]
```

它取代了 `setup.py` + `requirements.txt` + 各种配置文件：**构建配置、依赖声明、工具配置（ruff/pytest）统一在一个 TOML 里**。库发布用 `uv build` / `python -m build` 产 wheel。

## 常见坑

| 坑 | 说明 |
| :--- | :--- |
| 装到了全局 | 没激活/用错 pip。排查：`pip -V` 看路径里有没有 `.venv` |
| `python` 指向错版本 | Windows 用 `py -3.12` 精确指定；Linux 用 `python3` |
| 直接 `pip install` 到系统 Python | 新版 Ubuntu 会直接拒绝（PEP 668，externally-managed）——本来就该用 venv |
| 忘记导出依赖 | 项目能跑但别人装不出来；`uv add` 的项目模式天然解决 |
| git 提交了 .venv | `.gitignore` 加 `.venv/`（虚拟环境不可迁移，靠 requirements/lock 还原） |

相关：写代码的惯用法见[Python 惯用法速查](python-idioms.md)；在容器里固化环境见[Docker 基础](../linux/docker-basics.md)。
