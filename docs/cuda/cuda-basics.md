---
comments: true
---
# CUDA 开发入门

> GPU 上跑自己的第一段代码：线程层级、显存管理、编译运行。示例按 CUDA 12.x 编写，适配 sm_86+ 显卡（RTX 30/40 系）。

## CPU 与 GPU：什么时候上 GPU

| | CPU | GPU |
| :--- | :--- | :--- |
| 核心数 | 几个~几十个强核 | 数千个精简核 |
| 擅长 | 分支多、逻辑复杂、低延迟 | 大量**同构**数据的并行计算 |
| 典型场景 | 业务逻辑、控制流 | 矩阵运算、图像处理、深度学习 |

判断标准：**任务能拆成成千上万份彼此独立的相同计算**（SIMT），且数据量够大（算得太快不如搬运快就不划算），才值得搬去 GPU。

## 编程模型：host / device 与线程层级

```text
Host(CPU+内存) ──cudaMemcpy──► Device(GPU+显存) ──结果拷回──► Host

Grid（网格）
 ├─ Block (0,0)   ← 由 blockIdx 标识
 │   ├─ Thread(0)  ← threadIdx，同一 block 内的线程可通过 shared memory 协作
 │   └─ Thread(N)
 └─ Block (M,0)
```

- **kernel**：在 GPU 上执行的函数，标 `__global__`，调用时用 `<<<blocks, threads>>>` 配置规模；
- **warp**：硬件执行单位，32 个线程为一组锁步执行——block 大小取 32 的倍数（常用 128/256）；
- 同一 block 内线程可以同步（`__syncthreads()`）和共享显存，跨 block 不能。

## 第一个程序：向量加法

```cpp
#include <cstdio>
#include <cuda_runtime.h>

// __global__ 标记：从 CPU 调用、在 GPU 上执行
__global__ void vecAdd(const float* a, const float* b, float* c, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;   // 全局线程编号
    if (i < n) {                                     // 越界保护：线程数通常比数据多
        c[i] = a[i] + b[i];
    }
}

int main() {
    const int N = 1 << 20;                          // 1048576 个元素
    size_t bytes = N * sizeof(float);

    // 1. 分配 host 内存并初始化
    float *h_a = (float*)malloc(bytes), *h_b = (float*)malloc(bytes),
          *h_c = (float*)malloc(bytes);
    for (int i = 0; i < N; i++) { h_a[i] = 1.0f; h_b[i] = 2.0f; }

    // 2. 分配 device 显存
    float *d_a, *d_b, *d_c;
    cudaMalloc(&d_a, bytes);
    cudaMalloc(&d_b, bytes);
    cudaMalloc(&d_c, bytes);

    // 3. 数据拷到显存（方向枚举：HostToDevice / DeviceToHost）
    cudaMemcpy(d_a, h_a, bytes, cudaMemcpyHostToDevice);
    cudaMemcpy(d_b, h_b, bytes, cudaMemcpyHostToDevice);

    // 4. 启动 kernel： ceil(N/256) 个 block × 256 线程
    int threads = 256;
    int blocks = (N + threads - 1) / threads;
    vecAdd<<<blocks, threads>>>(d_a, d_b, d_c, N);

    // 5. 拷回结果（Memcpy 默认隐式同步：等 kernel 跑完）
    cudaMemcpy(h_c, d_c, bytes, cudaMemcpyDeviceToHost);

    printf("c[0]=%f c[N-1]=%f\n", h_c[0], h_c[N - 1]);   // 3.000000

    cudaFree(d_a); cudaFree(d_b); cudaFree(d_c);
    free(h_a); free(h_b); free(h_c);
    return 0;
}
```

```bash
nvcc vec_add.cu -o vec_add        # .cu 文件由 nvcc 编译（不是 g++）
./vec_add
# c[0]=3.000000 c[N-1]=3.000000
```

**索引公式是 CUDA 的第一课**：`全局编号 = blockIdx.x * blockDim.x + threadIdx.x`。二维 Grid 时同理算 `x` 和 `y` 两个分量。

## 错误检查：每个 CUDA 调用都可能失败

所有 CUDA API 返回 `cudaError_t`，**kernel 启动不报错**（异步），要用 `cudaGetLastError()`：

```cpp
#define CUDA_CHECK(call)                                                    \
    do {                                                                    \
        cudaError_t err = (call);                                           \
        if (err != cudaSuccess) {                                           \
            fprintf(stderr, "CUDA error at %s:%d: %s\n", __FILE__,          \
                    __LINE__, cudaGetErrorString(err));                     \
            exit(EXIT_FAILURE);                                             \
        }                                                                   \
    } while (0)

#define KERNEL_CHECK() CUDA_CHECK(cudaGetLastError())   // 启动后立即检查

CUDA_CHECK(cudaMalloc(&d_a, bytes));
vecAdd<<<blocks, threads>>>(d_a, d_b, d_c, N);
KERNEL_CHECK();
CUDA_CHECK(cudaDeviceSynchronize());   // 等待完成并同步检查执行期错误
```

!!! tip "调试手段"
    逻辑错误用 `printf` 直接在 kernel 里打（每个线程打一份，注意量）；内存问题用 `compute-sanitizer memcheck ./app`；Windows/VS 里可用 Nsight 系列（见[性能优化篇](cuda-optimization.md)）。

## 查询设备属性

```cpp
int dev = 0;
cudaDeviceProp prop;
CUDA_CHECK(cudaGetDeviceProperties(&prop, dev));
printf("GPU: %s\nSM 数: %d\n共享内存/block: %zu KB\n",
       prop.name, prop.multiProcessorCount, prop.sharedMemPerBlock / 1024);
```

SM（Streaming Multiprocessor）数决定硬件并行度上限；`maxThreadsPerBlock`（通常 1024）限制 block 大小。

## 常用 API 速查

| API | 作用 |
| :--- | :--- |
| `cudaMalloc / cudaFree` | 显存分配 / 释放 |
| `cudaMemcpy(dst, src, bytes, kind)` | 主机↔显存拷贝 |
| `cudaMemset` | 显存置值 |
| `cudaDeviceSynchronize` | 阻塞等待所有 kernel 完成 |
| `cudaGetLastError` | 捕获最近的错误（含 kernel 启动错误） |
| `cudaMallocManaged` | 统一内存（CPU/GPU 自动迁移，原型开发方便，性能不如手动管理） |

## nvcc 编译要点

```bash
nvcc vec_add.cu -o vec_add                  # 默认针对本机 GPU 架构（12.x 默认较新架构）
nvcc -arch=sm_86 vec_add.cu -o vec_add      # 显式指定架构（RTX 30 系=86，40 系=89）
nvcc -gencode arch=compute_75,code=sm_75 \
     -gencode arch=compute_86,code=sm_86 \  # 一个二进制支持多代显卡
     vec_add.cu -o vec_add
nvcc -G vec_add.cu -o vec_add_debug         # -G 关闭优化 + 可调试（kernel 断点）
```

`.cu` 文件里可以混写 C++（host 代码部分 g++ 也能编译），`__global__`/`__device__` 函数才由 nvcc 的设备编译器处理。

## 往下走

- [CUDA 内存与性能优化](cuda-optimization.md)：合并访存、shared memory、reduction、流与异步；
- 官方文档：[CUDA C++ Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)、[API 参考](https://docs.nvidia.com/cuda/cuda-runtime-api/)；
- 实用库：cuBLAS（矩阵）、cuFFT、Thrust（STL 风格）——能不用手写 kernel 就别手写。
