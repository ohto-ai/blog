---
comments: true
---
# STL 容器与算法速查

> 怎么选容器、哪些算法天天用、迭代器什么时候失效。配合[现代 C++ 特性速查](modern-cpp-features.md)与[移动语义](move-semantics.md)食用。

## 容器怎么选

| 需求 | 首选 | 备注 |
| :--- | :--- | :--- |
| 顺序存储、随机访问 | `vector` | **90% 场景的默认答案**，缓存最友好 |
| 固定大小 | `array` | 栈上分配，零开销 |
| 头部也频繁插删 | `deque` | 分段连续，头尾 O(1) |
| 中间频繁插删 + 无需随机访问 | `list` | 真正需要时才用，缓存不友好 |
| 键值查找（有序遍历/范围查询） | `map`（红黑树） | O(log n)，前中后序遍历 |
| 键值查找（只要快） | `unordered_map`（哈希） | 平均 O(1)，最坏 O(n) |
| 去重 / 集合运算 | `set` / `unordered_set` | |
| 优先队列 | `priority_queue` | 默认大顶堆，`greater<>` 变小顶 |
| 栈 / 队列 | `stack` / `queue` | 底层默认 deque |

```cpp
// 选择顺序：vector → 查找多再换 unordered_map/set → 有序需求才用 map/set → 其他
std::unordered_map<int, std::string> cache;   // 大多数"字典"场景
std::map<std::string, int> ranking;           // 需要按 key 排序遍历时
```

!!! tip "vector 为什么默认首选"
    CPU 按缓存行（64 字节）读内存，连续内存的遍历比链表快一个数量级以上。`list` 的 O(1) 插入赢不回每次寻址的缓存 miss。先 `reserve` 预留容量，扩容次数几乎为零。

## 复杂度速查

| 容器 | 随机访问 | 头部插删 | 尾部插删 | 中间插删 | 查找 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `vector` | O(1) | O(n) | O(1) 均摊 | O(n) | O(n) / O(log n)（有序二分） |
| `deque` | O(1) | O(1) | O(1) | O(n) | O(n) |
| `list` | O(n) | O(1) | O(1) | O(1)（已有迭代器） | O(n) |
| `map` / `set` | — | — | — | O(log n) | O(log n) |
| `unordered_map` / `unordered_set` | — | — | — | O(1) 均摊 | O(1) 均摊 |

## 迭代器失效规则（面试 + 排错高频）

| 操作 | `vector` / `string` | `list` | `map` / `set` | `unordered_*` |
| :--- | :--- | :--- | :--- | :--- |
| 插入 | 扩容时**全部失效**；否则插入点之后失效 | 不失效 | 不失效 | **rehash 全部失效**（引用不失效） |
| 删除 | 被删元素及其之后失效 | 仅被删元素失效 | 仅被删元素失效 | 仅被删元素失效 |

```cpp
// 边遍历边删的正确姿势：erase 返回下一个有效迭代器
for (auto it = v.begin(); it != v.end(); ) {
    if (shouldRemove(*it)) it = v.erase(it);
    else ++it;
}
```

## 高频算法

### 排序与去重

```cpp
std::sort(v.begin(), v.end());                          // introsort, O(n log n)
std::sort(v.begin(), v.end(), std::greater<int>());     // 降序
std::stable_sort(...);                                  // 保持相等元素相对顺序
std::partial_sort(v.begin(), v.begin()+10, v.end());    // 只要前 10 名

v.erase(std::unique(v.begin(), v.end()), v.end());      // 去重（须先 sort）
```

!!! warning "remove 系列不删除任何东西"
    `std::remove` 只是**把要保留的元素前移**，返回新逻辑终点，容器大小不变。必须配合 erase——这是经典惯用法：

    ```cpp
    v.erase(std::remove_if(v.begin(), v.end(), pred), v.end());  // C++20 前
    std::erase_if(v, pred);                                      // C++20 起一行搞定
    ```

### 查找

```cpp
auto it = std::find(v.begin(), v.end(), x);          // 无序，O(n)
auto it2 = std::find_if(v.begin(), v.end(), pred);

// 二分族（必须已有序！返回迭代器）
auto lo = std::lower_bound(v.begin(), v.end(), x);   // 第一个 >= x
auto hi = std::upper_bound(v.begin(), v.end(), x);   // 第一个 >  x
bool hit = std::binary_search(v.begin(), v.end(), x);
auto count = hi - lo;                                 // x 的个数

// 在 map 里：
if (auto it = m.find(k); it != m.end()) use(it->second);   // C++17
if (m.contains(k)) { /* ... */ }                            // C++20
m.try_emplace(k, args...);                                  // 不存在才构造
```

### 数值与变换

```cpp
#include <numeric>
#include <execution>                                     // 并行算法需要
int sum  = std::accumulate(v.begin(), v.end(), 0);        // 注意初始值类型决定累加类型
int sum2 = std::reduce(std::execution::par, v.begin(), v.end());  // C++17 并行版
std::iota(v.begin(), v.end(), 0);                          // 填 0,1,2,...

std::transform(v.begin(), v.end(), out.begin(), [](int x){ return x * x; });
auto [mn, mx] = std::minmax_element(v.begin(), v.end());
int c = std::clamp(x, lo, hi);
```

### ranges 版本（C++20，可读性大增）

```cpp
#include <ranges>
namespace rv = std::views;
auto result = v | rv::filter([](int x){ return x % 2 == 0; })
                | rv::transform([](int x){ return x * x; })
                | std::ranges::to<std::vector>();   // C++23 才有 to；C++20 用循环收尾
std::ranges::sort(v);                               // 无需 begin/end
auto it = std::ranges::find(v, 42);
```

## 常见坑

| 坑 | 说明 |
| :--- | :--- |
| `map[key]` | key 不存在会**默认构造并插入**！只查不插用 `find` / `contains` / `at` |
| `vector<bool>` | 不是容器（位压缩代理），要 bool 数组用 `vector<char>` 或 `bitset` |
| `at()` vs `[]` | `at()` 越界抛异常，`[]` 是未定义行为（release 下多半静默错） |
| `reserve` vs `resize` | reserve 只分配不构造、size 不变；resize 会真实构造元素 |
| 无序容器自定义 key | 需要同时提供 hash 函数和 `operator==`；浮点数做 key 慎用 |
| `sort` 自定义比较器 | 必须严格弱序（`a<a` 为 false），否则可能崩溃 |
| string SSO | 短字符串（约 15 字节内）存在对象内部，无堆分配——小字符串传值并不慢 |

## 性能检查清单

1. `vector` 有没有 `reserve`？循环里 `push_back` 前预留容量；
2. 大对象存的是值还是[智能指针](smart-pointers.md)？`vector<std::unique_ptr<T>>` 省搬移；
3. 循环里有没有对 `map`/`unordered_map` 重复 `find`？可以缓存迭代器；
4. 能不能把 `O(n)` 的 `find` 换成有序容器的二分，或哈希的 O(1)？
5. 拷贝大的 `vector<string>` 时考虑 move / `std::move`（见[移动语义](move-semantics.md)）。
