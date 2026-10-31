---
comments: true
---
# CUDA 内存与性能优化

> [入门篇](cuda-basics.md)跑通了向量加法；这篇讲为什么你的 kernel 只跑到理论带宽的零头，以及怎么提上来。示例按 CUDA 12.x 编写。

## 先量后改：Profiling 工具

```bash
nsys profile ./app            # Nsight Systems：时间线总览（kernel 耗时、拷贝、空洞）
ncu ./app                     # Nsight Compute：单 kernel 深挖（带宽、占用率、瓶颈类型）
ncu --set full -k vecAdd ./app
```

先看两个数：**已达成带宽**（DRAM Throughput）和**SM 占用率**（Achieved Occupancy）。内存瓶颈型 kernel 的目标是接近显存带宽上限（4070 约 504 GB/s），算力瓶颈型则看 SM 忙碌度。

## 显存层级与合并访存（最重要的一节）

```text
寄存器(每线程) > shared memory(每 block, ~48KB+) > L2 > 全局显存(GB 级, 慢 10 倍以上)
```

全局显存访问以 **32/128 字节事务**为单位。**相邻线程访问相邻地址 = 一次事务合并服务 32 个线程（coalesced）**；跨步访问则一个线程一个事务，带宽瞬间掉一个数量级：

```cpp
// ✅ 合并访存：相邻线程读写相邻元素（前面 vecAdd 就是这种）
int i = blockIdx.x * blockDim.x + threadIdx.x;
c[i] = a[i] + b[i];

// ❌ 跨步访存：同一 warp 的 32 个线程跳着读，产生 32 次事务
int i = threadIdx.x * STRIDE + blockIdx.x;   // 别这样
c[i] = a[i] + b[i];

// 矩阵按列访问（跨行）也是跨步：先转置数据布局，或用 shared memory 中转
```

**一维数组按线程号线性访问天然合并；二维问题让最内层维度（x）对应内存连续维度。**

## shared memory：显存里的手写缓存

`__shared__` 内存每 block 一份，比全局显存快一个量级，用于**复用数据**和**改写访问模式**。经典例子——分块矩阵乘法：

```cpp
#define TILE 32

__global__ void matmulTiled(const float* A, const float* B, float* C, int N) {
    __shared__ float As[TILE][TILE];      // 每 block 各一份片上副本
    __shared__ float Bs[TILE][TILE];

    int row = blockIdx.y * TILE + threadIdx.y;   // C 中的全局坐标
    int col = blockIdx.x * TILE + threadIdx.x;
    float sum = 0.f;

    for (int t = 0; t < N / TILE; ++t) {
        // 协作搬运：block 内 32×32 线程各搬一个元素进共享内存（访存是合并的）
        As[threadIdx.y][threadIdx.x] = A[row * N + (t * TILE + threadIdx.x)];
        Bs[threadIdx.y][threadIdx.x] = B[(t * TILE + threadIdx.y) * N + col];
        __syncthreads();                      // 等全部搬完才能用

        for (int k = 0; k < TILE; ++k)
            sum += As[threadIdx.y][k] * Bs[k][threadIdx.x];
        __syncthreads();                      // 用完才能进入下一轮覆盖
    }
    if (row < N && col < N) C[row * N + col] = sum;
}
```

两个 `__syncthreads()` 一个都不能少：第一个保证 tile 搬运完成，第二个防止下一轮搬运覆盖还在用的数据（**竞争条件是 shared memory 的头号坑**）。

## Reduction：树形归约模板

把 N 个数求和/求最大值——并行思想从"串行累加"变成**对数级树形合并**：

```cpp
__global__ void sumReduce(const float* in, float* out, int n) {
    __shared__ float sdata[256];
    int tid = threadIdx.x;
    int i = blockIdx.x * blockDim.x + threadIdx.x;

    sdata[tid] = (i < n) ? in[i] : 0.f;
    __syncthreads();

    // 跨半树相加：每轮活跃线程减半，避免 bank conflict
    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) sdata[tid] += sdata[tid + s];
        __syncthreads();
    }

    if (tid == 0) out[blockIdx.x] = sdata[0];   // 每 block 出一个部分和，再迭代或原子加
}
```

生产代码用 CUB（`cub::DeviceReduce`）或 `thrust::reduce`，手写版本用来理解原理（warp shuffle `__shfl_down_sync` 能再快一截，见 Programming Guide）。

## block 大小与 occupancy

- block 大小取 **32 的倍数**，128~256 起步实测调整；太小喂不饱 SM，太大调度不灵活；
- 每个 SM 上能驻留的 block 数受三重限制：**寄存器 / shared memory / 最大线程数**——任何一项打满就是占用率天花板；
- kernel 里少用大数组局部变量（会溢出到慢速 local memory）：`__launch_bounds__(256)` 可提示编译器控制寄存器用量。

## 流与异步：让拷贝和计算重叠

```cpp
cudaStream_t s1, s2;
cudaStreamCreate(&s1);
cudaStreamCreate(&s2);

// 页锁定内存：异步拷贝的前提（普通 malloc 的内存 cudaMemcpyAsync 会退化成同步）
float *h_a, *d_a;
CUDA_CHECK(cudaMallocHost(&h_a, bytes));      // pinned memory
CUDA_CHECK(cudaMalloc(&d_a, bytes));

// 分块流水线：第 i 块计算时，第 i+1 块在拷贝
for (int i = 0; i < numChunks; ++i) {
    CUDA_CHECK(cudaMemcpyAsync(d_a + off, h_a + off, chunkBytes,
                               cudaMemcpyHostToDevice, s1));
    kernel<<<blocks, threads, 0, s1>>>(d_a + off, chunkLen);
    CUDA_CHECK(cudaMemcpyAsync(h_r + off, d_r + off, chunkBytes,
                               cudaMemcpyDeviceToHost, s1));
}
cudaStreamSynchronize(s1);
```

使用准则：**不同流里的任务才能重叠**；同一流内保持顺序。数据量大时流水线收益显著（拷贝引擎与 SM 是独立硬件）。

## 常见坑清单

| 坑 | 后果 / 解法 |
| :--- | :--- |
| 忘了 kernel 后同步就拷回 | 结果错（异步执行还没完成）；`cudaMemcpy` D2H 隐式同步，`cudaMemcpyAsync` 不会 |
| 越界读写 | 大多**静默**出错或延迟崩溃；`compute-sanitizer memcheck` 抓 |
| `__syncthreads()` 放在 if 分支里 | 部分线程到不了栅栏，**死锁**；栅栏必须全 block 一致到达 |
| 递归/动态分配/异常 | 设备端不支持（动态并行除外）；数据和索引逻辑在 host 侧算好传进去 |
| host 指针直接在 kernel 里用 | 崩溃；CPU 内存必须先 `cudaMemcpy` 到 device 指针 |
| 用 float 累加大数组 | 精度丢失；分块归约或 double（注意消费级卡 double 性能 1/64） |

## 基线参考

像 `vecAdd` 这种 1M 元素级的小任务，瓶颈永远在 PCIe 拷贝而非计算——这就是"数据量不够大就别上 GPU"的直观体现。改进顺序永远是：**先合并访存 → 再上 shared memory → 最后才考虑流与调度微调**。改前改后都用 `ncu` 量一下（本文开头的工具），不要凭感觉优化。
