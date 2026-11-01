---
comments: true
---
# Python 测试与调试

> pytest + breakpoint() + logging 三件套。写完代码顺手配好这些，比出事后再 print 强一个量级。环境配置见[Python 环境与包管理](python-env.md)。

## pytest：assert 就是测试

```bash
pip install pytest          # 或 uv add --dev pytest
```

```python
# test_math.py —— 文件和函数都以 test_ 开头，pytest 自动发现
def add(a, b):
    return a + b

def test_add():
    assert add(1, 2) == 3

def test_add_negative():
    assert add(-1, -1) == -2

def test_add_type_error():
    import pytest
    with pytest.raises(TypeError):
        add(1, "2")
```

```bash
pytest                    # 跑当前目录全部测试
pytest test_math.py       # 指定文件
pytest -k "add and not negative"   # 按名字过滤
pytest -x                 # 第一个失败就停
pytest -v                 # 显示每个用例
pytest --tb=short         # 精简报错回溯
pytest -s                 # 显示 print 输出
```

失败时 pytest 会把 assert 两边的**实际值**打印出来（assert 重写机制），比裸 assert 友好得多。

## fixture：测试的依赖注入

```python
import pytest

@pytest.fixture
def sample_data():
    # 每个用到它的测试函数前执行一次（setup）， yield 后是 teardown
    data = {"users": [{"id": 1, "name": "Ada"}]}
    yield data
    data.clear()                    # 清理

def test_find_user(sample_data):     # 参数名 = fixture 名，自动注入
    assert sample_data["users"][0]["name"] == "Ada"

# 作用域：@pytest.fixture(scope="module")  整个文件一份
#         scope="session"                  整场测试一份（数据库连接等）
# 共享 fixture 放 conftest.py，同目录测试自动可见，无需 import
```

## 参数化：一个用例测一组数据

```python
import pytest

@pytest.mark.parametrize("a, b, expected", [
    (1, 2, 3),
    (0, 0, 0),
    (-1, 1, 0),
    (100, 200, 300),
])
def test_add_many(a, b, expected):
    assert add(a, b) == expected
```

## monkeypatch：替换依赖

```python
import requests

def get_status(url: str) -> int:
    return requests.get(url).status_code

def test_get_status(monkeypatch):
    class FakeResp:
        status_code = 200
    monkeypatch.setattr(requests, "get", lambda url: FakeResp())  # 不发真请求
    assert get_status("http://whatever") == 200
```

更复杂的替身用 `unittest.mock.Mock`/`patch`——原则一样：**测试里永远不发真网络请求、不碰真数据库**。

## 项目结构约定

```text
myproject/
├─ src/myproject/           # 源码
├─ tests/
│  ├─ conftest.py           # 共享 fixture
│  ├─ test_core.py
│  └─ test_api.py
└─ pyproject.toml           # dev 依赖: pytest, ruff, mypy
```

测的是"行为"不是"实现"：测 `parse()` 返回正确结果，而不是测它内部调了哪个私有函数。

## 调试：breakpoint() 与 pdb

```python
def suspicious(data):
    result = transform(data)
    breakpoint()          # 3.7+，执行到这里进入调试器（PDB 1.0 自动带颜色）
    return result
```

```text
(Pdb) p result          打印变量
(Pdb) pp data           pretty-print
(Pdb) l / ll            看代码 / 长列表
(Pdb) n                 下一行（不进函数）
(Pdb) s                 步入函数
(Pdb) c                 继续运行到下一个断点
(Pdb) w                 调用栈
(Pdb) u / d             栈帧上移 / 下移
(Pdb) q                 退出
```

```bash
python -m pdb script.py        # 从头调试
pytest --pdb                    # 测试失败瞬间掉进调试器（post-mortem，现场变量都在）
pytest -x --pdb                 # 第一个失败就停
```

VS Code / PyCharm 里打断点本质也是这个，图形界面更省事；终端环境（服务器、SSH）pdb 是救命稻草。

## logging：把 print 升级掉

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)       # 每模块一个，名字自动带模块路径

logger.debug("细节 %s", value)             # 占位符惰性格式化，别用 f-string
logger.info("started")
logger.warning("deprecated call")
logger.error("failed: %s", err, exc_info=True)   # 带堆栈
```

好处：**级别可调**（生产 INFO、排查时 DEBUG）、可路由（文件/轮转/syslog）、可关停。写库代码用 `logger` 别用 print；一次性脚本 print 无妨。

```python
# 文件 + 控制台双输出（简单场景够用）
file_handler = logging.FileHandler("app.log", encoding="utf-8")
logging.basicConfig(level=logging.DEBUG,
                    handlers=[logging.StreamHandler(), file_handler])
```

## 静态检查：让机器替你 code review

```bash
ruff check .        # lint（替代 flake8+isort 等，快几百倍）
ruff format .       # 格式化（替代 black）
mypy src/           # 类型检查；pyright/Pylance 是 VS Code 默认
```

`pyproject.toml` 里统一配置工具（示例见[环境与包管理](python-env.md)），进 pre-commit 或 CI。

## 习惯清单

1. 新功能先写一个会失败的测试（红），实现让它变绿——不用教条 TDD，但回归测试必须有；
2. 修 bug 前先写一个**复现该 bug 的测试**，修完它转绿，这个 bug 永远不会再回来；
3. `breakpoint()` 用完删掉，别提交（ruff 的 TID/`debugger` 检查能拦）；
4. 测试跑得快才有人跑：慢 IO 全 mock，数据库用 scope="function" 的事务回滚。
