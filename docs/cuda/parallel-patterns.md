---
comments: true
---
# CUDA 经典并行模式

> [优化篇](cuda-optimization.md)讲清了"怎么快"，[Warp 篇](warp-primitives.md)讲清了"怎么协作"——这篇把它们用起来：**scan（前缀和）、histogram（直方图）、transpose（转置）**三个最常用的并行模式。手写前记得先查 CUB/Thrust，这里的价值是看懂原理。示例按 CUDA 12.x 编写（未在本机编译验证，原因见[入门篇](cuda-basics.md)环境说明）。

## Scan（前缀和）：并行的"累加器"

串行 `out[i] = out[i-1] + in[i]` 天生有依赖链，并行化是经典考题。**Hillis-Steele**（步长倍增）最直观：

```cpp
// inclusive scan：每个线程块内，输出包含自身
__global__ void scanBlock(const float* in, float* out, int n) {
    extern __shared__ float tmp[];
    int tid = threadIdx.x;
    int gid = blockIdx.x * blockDim.x + threadIdx.x;
    tmp[tid] = (gid < n) ? in[gid] : 0.f;
    __syncthreads();

    for (int offset = 1; offset < blockDim.x; offset <<= 1) {
        float v = 0.f;
        if (tid >= offset) v = tmp[tid - offset];   // 读上一轮的邻居
        __syncthreads();                            // 全块读完后才能写
        tmp[tid] += v;
        __syncthreads();                            // 写完才能进下一轮
    }
    if (gid < n) out[gid] = tmp[tid];
}
```

两个 `__syncthreads()` 缺一不可（正是[优化篇](cuda-optimization.md)强调的"栅栏必须全块一致到达"）。变体：

- **exclusive scan**（不含自身）：最后统一 `out[i] = (i==0) ? 0 : out[i-1]`；
- **Blelloch**（work-efficient）：先向上归约再向下扫描，总操作数 O(n)，适合大数组；Hillis-Steele 是 O(n·log n) 但步数少，块内更快；
- **跨块 scan**：先各块算出自己的和，对"块和数组"再 scan 一遍，再加偏移（三段法，CUB 里叫 multi-pass）。

**用途**：流压缩（配合[Warp 篇](warp-primitives.md)的 `ballot+popc` 得到每个元素的目标下标）、计数排序、稀疏矩阵行指针、并行分配任务区间。

## Histogram：原子加的两级写法

```cpp
// 朴素版：全局内存原子加，冲突多
__global__ void histNaive(const int* in, int* hist, int n, int bins) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) atomicAdd(&hist[in[i]], 1);        // 所有线程挤同几个计数器
}

// 进阶版：shared memory 私有直方图，最后合并
__global__ void histTiled(const int* in, int* hist, int n, int bins) {
    extern __shared__ int local[];                // blockDim.x = bins（一 bins 一线程）
    for (int i = threadIdx.x; i < bins; i += blockDim.x)
        local[i] = 0;
    __syncthreads();

    for (int i = blockIdx.x * blockDim.x + threadIdx.x;
         i < n;
         i += gridDim.x * blockDim.x) {           // grid-stride 循环遍历全量
        atomicAdd(&local[in[i]], 1);              // 冲突只在块内（快一个量级）
    }
    __syncthreads();
    for (int i = threadIdx.x; i < bins; i += blockDim.x)
        atomicAdd(&hist[i], local[i]);            // 每 block 只回写一次
}
```

要点：**冲突域越小原子越便宜**。数据分布极偏（全落一个桶）时，可用 warp 投票先做"块内紧凑 + 去重计数"再原子，或干脆每 warp 一份私有表。

## Transpose：一次合并访存的完整案例

朴素转置读写必有一边是跨步（[优化篇](cuda-optimization.md)的教训）——用 shared memory 让两边都合并：

```cpp
#define TILE 32

__global__ void transpose(const float* in, float* out, int N) {
    __shared__ float tile[TILE][TILE + 1];        // +1 = padding，防 bank conflict（见 Warp 篇）

    int x = blockIdx.x * TILE + threadIdx.x;
    int y = blockIdx.y * TILE + threadIdx.y;

    if (x < N && y < N)
        tile[threadIdx.y][threadIdx.x] = in[y * N + x];   // 读：沿 x 合并 ✅
    __syncthreads();

    // 转置后本块的输出坐标：(y, x) 交换
    x = blockIdx.y * TILE + threadIdx.x;
    y = blockIdx.x * TILE + threadIdx.y;
    if (x < N && y < N)
        out[y * N + x] = tile[threadIdx.x][threadIdx.y];  // 写：也沿 x 合并 ✅
}
```

逐条对照优化篇的检查单：合并读写 ✅、shared memory 中转 ✅、padding 消 bank conflict ✅、栅栏配对 ✅——这就是"标准优化流程"长什么样。

## 模式选择与延伸

| 需求 | 模式 | 库现成方案 |
| :--- | :--- | :--- |
| 紧凑化 / 下标重排 | scan + ballot | `cub::DeviceSelect` |
| 分桶统计 | histogram（两级原子） | `cub::DeviceHistogram` |
| 前缀和 / 分段和 | scan | `cub::DeviceScan` |
| 矩阵转置 | tiled transpose | cuBLAS `geam` |
| 排序 | radix（内部就是 scan+histogram） | `cub::DeviceRadixSort` |
| 全表归约 | reduction（见优化篇） | `cub::DeviceReduce` / `thrust::reduce` |

优先级重申：**CUB/Thrust → cuBLAS/cuDNN → torch/框架 → 最后才是手写**。手写的意义在于读懂 profiler 报告、看懂库做不到的特殊访问模式。
