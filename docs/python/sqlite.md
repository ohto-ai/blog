---
comments: true
---
# SQLite 入门（Python sqlite3）

> SQLite 是**零配置、单文件**的嵌入式数据库：没有独立的服务进程，整个数据库就是磁盘上的一个文件，Python 标准库 `sqlite3` 直接可用。它是世界上部署最广泛的数据库（所有手机、浏览器里都有）。环境见[Python 环境与包管理](python-env.md)，示例在 Python 3.13 全量验证。

## 什么时候选 SQLite

| 场景 | 选择 |
| :--- | :--- |
| 本地应用数据（桌面软件、CLI 工具） | **SQLite** |
| 移动端/嵌入式存储、网站原型、缓存文件 | **SQLite** |
| 多台服务器并发写入、高并发 Web 服务 | 客户端-服务器型（PostgreSQL、MySQL） |

SQLite 的写入是**整库锁**（同一线程只有一个写事务），读可以并发。读多写少、单机场景用它能省掉整套数据库部署。

## 连接与游标

```python
import sqlite3

conn = sqlite3.connect("app.db")     # 文件不存在会自动创建；":memory:" 表示内存库
cur = conn.cursor()
cur.execute("SELECT sqlite_version()")
cur.fetchone()                       # ('3.45.1',) 之类
conn.close()                         # 用完关闭
```

`cursor` 是执行语句的工作对象；一次连接可创建多个游标。

## 建表与数据类型

SQLite 只有五种存储类型：`NULL`、`INTEGER`、`REAL`、`TEXT`、`BLOB`（类型是"建议"而非强制，但请按规矩声明）：

```python
cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id      INTEGER PRIMARY KEY,       -- INTEGER PRIMARY KEY 等价于自增 rowid
        name    TEXT NOT NULL UNIQUE,
        email   TEXT,
        score   REAL DEFAULT 0,
        created TEXT DEFAULT (datetime('now'))
    )
""")
```

## 增删改查与参数绑定

```python
# 插入：一律用 ? 占位符，参数以元组传入
cur.execute("INSERT INTO users (name, email, score) VALUES (?, ?, ?)",
            ("ada", "ada@example.com", 90.0))

# 批量插入用 executemany
cur.executemany("INSERT INTO users (name, email) VALUES (?, ?)",
                [("bob", "bob@example.com"), ("eve", "eve@example.com")])
conn.commit()                        # 写操作必须提交，否则丢失

# 查询
cur.execute("SELECT id, name, score FROM users WHERE score > ?", (0,))
rows = cur.fetchall()                # [(1, 'ada', 90.0), (2, 'bob', 0.0), (3, 'eve', 0.0)]
row = cur.fetchone()                 # 逐行取
for r in cur.execute("SELECT name FROM users ORDER BY score DESC"):
    print(r[0])                      # 游标本身可迭代

# 更新与删除（同样必须绑定参数并提交）
cur.execute("UPDATE users SET score = ? WHERE name = ?", (95.0, "ada"))
cur.execute("DELETE FROM users WHERE name = ?", ("eve",))
conn.commit()
print(cur.lastrowid)                 # 最近一次 INSERT 的自增主键
```

!!! warning "第一戒律：绝不拼接 SQL 字符串"
    ```python
    cur.execute(f"SELECT * FROM users WHERE name = '{name}'")   # ❌ SQL 注入
    # name = "x'; DROP TABLE users; --" 时这条语句就是灾难
    cur.execute("SELECT * FROM users WHERE name = ?", (name,))  # ✅ 参数绑定
    ```
    占位符让驱动负责转义与类型处理，注入与转义问题一并消失。

## 事务

```python
try:
    with conn:                        # 进入时开启事务，块内成功则自动 commit
        cur.execute("UPDATE accounts SET balance = balance - 100 WHERE id = 1")
        cur.execute("UPDATE accounts SET balance = balance + 100 WHERE id = 2")
        # 中间任何异常 → 自动 rollback，两条都不会生效
except sqlite3.Error as e:
    print("transfer failed:", e)

# 手动控制：conn.commit() / conn.rollback()
```

转账这类多步写操作必须包在事务里，保证"要么全成、要么全不动"。

## 按列名取值：sqlite3.Row

默认返回元组，按下标取列容易错位；把 `row_factory` 换成 `sqlite3.Row` 即可按名访问：

```python
conn.row_factory = sqlite3.Row
row = conn.execute("SELECT id, name FROM users WHERE name = ?", ("ada",)).fetchone()
row["name"]                          # 'ada'；row.keys() 列出列名
```

## 常用查询速记

```sql
SELECT * FROM users WHERE score >= 80 ORDER BY score DESC LIMIT 10;
SELECT dept, COUNT(*), AVG(score) FROM users GROUP BY dept;
SELECT u.name, d.title FROM users u JOIN depts d ON u.dept_id = d.id;
SELECT name FROM users WHERE name LIKE 'a%';          -- 通配：'%' 任意串 '_' 单字符
```

聚合函数 `COUNT/SUM/AVG/MIN/MAX`、`JOIN`、`LIKE`、`LIMIT` 都是标准 SQL 子集，语义与 PostgreSQL/MySQL 一致。

## 与 pandas 互通

```python
import pandas as pd
df = pd.read_sql("SELECT * FROM users", conn)          # 查询结果直接变 DataFrame
df.to_sql("users", conn, if_exists="append", index=False)   # DataFrame 入库
```

处理流程可以组合成"SQLite 存数据 → pandas 分析"（pandas 用法见 [NumPy 与 Pandas 速查](numpy-pandas.md)）。

## 常见错误

| 错误 | 说明 |
| :--- | :--- |
| 写入后"消失" | 忘了 `commit()`；连接关闭时未提交的事务被回滚 |
| `sqlite3.ProgrammingError: Incorrect bind` | 参数必须是元组：单个值写 `(value,)` 而不是 `(value)` |
| 字符串拼接 SQL | 注入风险，见上文第一戒律 |
| 多线程共用一个连接 | 默认 `check_same_thread=True` 只允许创建线程使用；改为每线程各自建连接，或传 `check_same_thread=False` 并自行加锁 |
| 拼写错误的表名列名 | 默认**运行时才报错**（`OperationalError: no such table`）；开发期写几条查询当冒烟测试 |
| 数据库文件被锁 | 另一进程持写锁（`database is locked`）；缩短写事务、或设置 `timeout=` 参数 |

延伸：多进程并发写、主从备份属于 SQLite 的进阶话题；一旦超出单机单写模型的范围，就该迁移到 PostgreSQL 这类服务器型数据库。
