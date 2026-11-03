---
comments: true
---
# NumPy 与 Pandas 速查

> Python 数据处理的两块地基：**NumPy** 是 C 速度的多维数组（PyTorch 张量的直系亲戚，见[PyTorch 实践](../cuda/pytorch-cuda.md)），**Pandas** 是带标签的表格层。核心理念一句话：**把循环换成向量化操作**。环境见[Python 环境与包管理](python-env.md)。

## NumPy：ndarray 基础

```python
import numpy as np

a = np.array([1, 2, 3, 4])            # dtype=int64
f = np.zeros((3, 4))                  # 全 0 矩阵；ones/empty/full 类似
r = np.arange(0, 10, 2)               # [0 2 4 6 8]；linspace(0, 1, 11) 等分
rng = np.random.default_rng(42)       # 新版随机 API（别再用 np.random.seed 那套）
x = rng.normal(size=(1000, 3))

a * 2 + 1                             # 整个数组运算——没有循环
f.shape, f.dtype, f.ndim              # (3, 4), float64, 2
m = f.reshape(4, 3)                   # 改形状（不拷贝，视图）
t = f.T                               # 转置；f.T @ f 即线性代数
```

**广播规则**：从末尾维度向前对齐，两边维度相等或有一方为 1 即可：

```python
A = np.ones((4, 3))
b = np.array([1, 2, 3])        # shape (3,)
A + b                          # (4,3) + (3,) → b 广播到每行 ✅
A + np.array([[1],[2],[3],[4]])   # (4,3) + (4,1) → 按列广播 ✅
A + np.array([1, 2])           # ❌ (3,) 与 (4,) 末维对不上 → ValueError
```

## 索引与聚合：axis 心智

```python
x = np.array([[1, 2, 3],
              [4, 5, 6]])

x[1, 2]                        # 6（行, 列）
x[:, 0]                        # 第一列
x[x > 3]                       # 布尔掩码：[4 5 6]——过滤标配
x[(x > 2) & (x < 6)]           # 条件组合用 & | ~，【不要】用 and/or

x.sum(axis=0)                  # 沿行方向压 → 每列的和 [5 7 9]
x.sum(axis=1)                  # 沿列方向压 → 每行的和 [6 15]
x.argmax(axis=1)               # 每行最大值的位置
np.where(x > 3, 1, -1)         # 向量化的 if-else
np.clip(x, 2, 4)               # 截断
```

**axis 记法**：`axis=0` 是"把这个维度压扁"。三维数组 `x.sum(axis=0)` 后第 0 维消失。

## 向量化：为什么快

```python
n = 1_000_000
py_list = list(range(n))
arr = np.arange(n)

%timeit [v * 2 + 1 for v in py_list]      # ~50ms（Python 循环 + 对象开销）
%timeit arr * 2 + 1                       # ~1ms（连续内存 + SIMD，无对象）
```

规则：**循环里能写成数组运算就别写 for**；实在要循环的分支逻辑用 `np.where`/掩码表达。C++ 心智对应：ndarray ≈ `std::vector<T>` 的连续内存 + 整块运算，元素是裸标量而不是 PyObject——这就是 50 倍差距的来源。

## Pandas：DataFrame 常用操作

```python
import pandas as pd

df = pd.read_csv("data.csv", parse_dates=["ts"])     # 读表
df = pd.DataFrame({
    "user": ["ada", "bob", "ada", "eve"],
    "score": [90, 75, 85, 92],
    "dept": ["sec", "dev", "sec", "ops"],
})

df.head() / df.shape / df.dtypes / df.describe()     # 先看四件套
df["score"]                       # 选一列 → Series
df[["user", "score"]]             # 选多列 → DataFrame
df.loc[df["score"] >= 85]         # 条件过滤行
df.loc[df["score"] >= 85, "user"] # 行 + 列组合
df.iloc[0, 1]                     # 按位置：第 0 行第 1 列
df.sort_values("score", ascending=False)
df.assign(bonus=df["score"] * 0.1)                   # 生成新列（不改原表）
```

### 分组聚合（groupby 是核心操作）

```python
df.groupby("dept")["score"].mean()                    # 每部门平均分
df.groupby("dept").agg(
    avg=("score", "mean"),
    best=("score", "max"),
    n=("user", "count"),
)                                                     # 命名聚合，输出即新表
df.value_counts("dept")                               # 频次统计
```

### 表连接与缺失值

```python
dept_info = pd.DataFrame({"dept": ["dev", "ops"], "floor": [3, 5]})
df.merge(dept_info, on="dept", how="left")            # SQL 风格 join

df.isna().sum()                   # 每列缺失数
df.fillna({"score": 0})           # 填充
df.dropna(subset=["user"])        # 丢缺失行
df.drop_duplicates()              # 去重
```

## 常见坑

| 坑 | 说明 |
| :--- | :--- |
| 链式赋值不生效 | `df[df.a>1]["b"] = 0` 改的是副本！用 `df.loc[mask, "b"] = 0` |
| `iterrows()` 慢一个量级 | 行循环是 Python 级——改向量化，或 `itertuples()` 折衷 |
| dtype=object 列 | 字符串列其实是 Python 对象指针，运算不享受向量化 |
| `SettingWithCopyWarning` | 视图 vs 副本模糊；先 `.copy()` 再改，或一步 `loc` |
| 广播对不上 | shape 末尾对齐规则；`reshape(-1, 1)` 手动补维度 |
| 大表 merge 后行数暴涨 | join 键有重复 → 笛卡尔积；merge 后先 `len` 对账 |
| `inplace=True` | 多数场景是伪就地，链式里更危险——新式写法基本不用它 |

## 与本站其他文章的关系

- ndarray ↔ PyTorch 张量：`torch.from_numpy(arr)` 零拷贝互转，操作语义几乎一致，上 GPU 才是分水岭（见[PyTorch 实践](../cuda/pytorch-cuda.md)）；
- 本篇示例在 numpy 2.3 / pandas 2.3 上全量跑通；写完的处理脚本配[测试与调试](testing-debugging.md)的 pytest 覆盖边界数据。
