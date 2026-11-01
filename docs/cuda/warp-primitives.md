---
comments: true
---
# CUDA Warp 级编程

> [优化篇](cuda-optimization.md)结尾留了个尾巴：reduction 还能靠 **warp shuffle** 再快一截。这篇下探到 warp 层——GPU 里比 block 更小的执行单位，也是手写高性能 kernel 的最后一层抽象。示例按 CUDA 12.x 编写（与[入门篇](cuda-basics.md)同环境说明）。

## 回顾：warp 是什么

- **warp = 32 个线程**，GPU 真正的调度与执行单位；block 内线程按 `threadIdx.x` 连续切成 warp（256 线程 = 8 个 warp）；
- 同一 warp 内线程**锁步**执行同一条指令（SIMT）；分支会让 warp 内两条路径串行各跑一遍（divergence）；
- 每个 warp 有自己的**寄存器交换网络**——线程间传数据可以不走 shared memory，直接在寄存器层完成，这就是 shuffle。

`laneId = threadIdx.x % 32`——warp 内第几个线程（0~31）。

## Warp Shuffle：寄存器直接交换

```cpp
// 原型：T __shfl_XXX_sync(unsigned mask, T var, ... LaneIdx)
int x = laneId;                        // 0 1 2 3 ... 31
int up = __shfl_up_sync(0xffffffff, x, 1);    // 拿 lane-1 的值（lane0 得到自身）
int dn = __shfl_down_sync(0xffffffff, x, 1);  // 拿 lane+1 的值（lane31 得到自身）
int br = __shfl_xor_sync(0xffffffff, x, 1);   // 与 lane^(1) 交换（蝶式）
```

三个关键点：

1. **`mask`**：参与这条指令的 warp 内线程掩码，全 warp 齐动就写 `0xffffffff`。不齐是未定义行为（调试用 `__activemask()` 观察，别依赖）；
2. **`_sync` 后缀**：CUDA 9 后强制——保证 warp 内同步语义（volta 之后的架构 warp 不再严格锁步，必须显式声明"这条指令大家一起来"）；
3. shuffle 交换的是**寄存器值**，不碰显存、不碰 shared memory，延迟以个位数 cycle 计。

## Warp 归约：reduction 的最终形态

[优化篇](cuda-optimization.md)的树形归约用 shared memory + `__syncthreads()`；warp 内可以全程寄存器完成——**蝶式（butterfly）异或归约**：

```cpp
// warp 内 32 个线程的 sum 归约：5 步 log2(32)，结束后每个 lane 都拿到总和
__inline__ __device__ int warpReduceSum(int value) {
    for (int offset = 16; offset > 0; offset >>= 1)
        value += __shfl_down_sync(0xffffffff, value, offset);
    return value;      // 所有 lane 都持有相同结果
}
```

与 shared memory 版本拼成完整两级归约（warp 内 shuffle + warp 间 shared memory）：

```cpp
__global__ void reduceKernel(const int* in, int* out, int n) {
    __shared__ int warpSums[32];                    // 每 warp 一个部分和

    int lane = threadIdx.x % 32;
    int warp = threadIdx.x / 32;
    int gid  = blockIdx.x * blockDim.x + threadIdx.x;

    int v = (gid < n) ? in[gid] : 0;
    v = warpReduceSum(v);                           // ① warp 内：寄存器交换

    if (lane == 0) warpSums[warp] = v;              // ② lane0 写入共享内存
    __syncthreads();                                //    （block 级栅栏）

    // ③ 第一个 warp 再归约各 warp 的部分和
    if (warp == 0) {
        v = (lane < blockDim.x / 32) ? warpSums[lane] : 0;
        v = warpReduceSum(v);
        if (lane == 0) out[blockIdx.x] = v;         // 每 block 出一个结果
    }
}
```

对比[优化篇](cuda-optimization.md)的版本：shared memory 读写次数从 log2(block) 轮降到**每线程 1 写 1 读**，同步只剩 block 级一次 `__syncthreads()`。

## Warp 投票：集体判断

```cpp
bool pred = value > 0;
bool any  = __any_sync(0xffffffff, pred);    // warp 内有人满足？
bool all  = __all_sync(0xffffffff, pred);    // 全部满足？
unsigned ballot = __ballot_sync(0xffffffff, pred);  // 每位 = 对应 lane 的判断
int first = __ffs(ballot) - 1;               // 第一个满足的 lane 编号
int count = __popc(ballot);                  // 满足的线程数
```

`ballot + popc` 组合是**流压缩（stream compaction）**的原语：谁的数据有效、有效数据排到哪，一次指令全知道——手写"筛出非零元素紧凑存放"就靠它。

## Bank Conflict：shared memory 的隐藏税

shared memory 划成 **32 个 bank**（4 字节宽），warp 的 32 个线程同时访问时：

```cpp
__shared__ float tile[32][32];
tile[threadIdx.y][threadIdx.x]      // ✅ 每线程一列，各打各的 bank
float v = tile[threadIdx.x][0];     // ❌ 32 个线程打同一个 bank
                                    //    → 32 路冲突，串行化，延迟 ×32

// 二维数组按列访问的经典修复：加一列 padding，错开 bank
__shared__ float tileP[32][32 + 1];
float v2 = tileP[threadIdx.x][0];   // ✅ 相邻线程差 33 个 float，落不同 bank
```

规则速记：**同一 warp 访问的地址映射到不同 bank = 无冲突；跨步为奇数通常安全；跨步 32 的倍数必冲突**。ncu 里 `shared memory bank conflict` 指标直接量化这笔税。

## Cooperative Groups：现代写法

```cpp
#include <cooperative_groups.h>
namespace cg = cooperative_groups;

__global__ void kernel() {
    auto block = cg::this_thread_block();
    auto warp  = cg::tiled_partition<32>(block);   // 显式把线程分组成 warp

    int v = warp.shfl_down(value, 1);              // 不用记 mask 和 _sync
    v = cg::reduce(warp, value, cg::plus<int>());  // 现成的归约
}
```

CG 把 mask/sync 的心智负担收进 API，语义与手写版等价；生产代码二选一即可，读懂旧代码两者都要认识。

## 什么时候值得下到这一层

| 信号（来自 ncu） | 手段 |
| :--- | :--- |
| shared memory 指令多、归约占大头 | warp shuffle 替代 shared memory 交换 |
| bank conflict 指标 > 0 | padding / 改数据布局 |
| 分支 divergence 高 | warp 投票 + 紧凑化，消除长尾分支 |
| __syncthreads() 频繁 | 缩小同步范围：warp 内同步免栅栏 |

原则不变：**先 profiler 确认瓶颈在这，再动手**。warp 层优化的收益通常在"归约/扫描/紧凑化"这类集体操作里最大，普通 elementwise kernel 用不上。
