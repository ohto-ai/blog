---
comments: true
---
# CUDA 调试与排错实战

> CUDA 的错误有个讨厌的特点：**异步执行让真实出错点与报错点相距甚远**——Illegal address 可能在几百个 kernel 之后才浮出来。这篇讲定位方法论与工具链。本篇无法在本机编译运行（环境限制，见[入门篇](cuda-basics.md)），工具用法以官方文档为基准。

## 第一原则：让错误当场现形

Debug 构建里把检查织进每一层（宏见[入门篇](cuda-basics.md)）：

```cpp
CUDA_CHECK(cudaMalloc(&d_x, bytes));        // API 调用当场查
vecAdd<<<grid, block>>>(d_a, d_b, d_c, n);  // kernel 启动只查启动错误
KERNEL_CHECK();                              // cudaGetLastError()
CUDA_CHECK(cudaDeviceSynchronize());         // 执行期错误在这里浮出
```

没有检查的 kernel 出错，错误状态会**一路潜伏**到很久之后的某个无关调用才返回——那才是最吓人的形态。排查顺序因此固定：

1. `cudaGetLastError()` 报什么错误码；
2. `cudaDeviceSynchronize()` 在哪一步开始报错（二分注释法）；
3. 交给 compute-sanitizer 精确定位。

## compute-sanitizer：CUDA 世界的 ASan

```bash
compute-sanitizer ./app                        # 默认 = memcheck
compute-sanitizer --tool memcheck ./app        # 越界/非法地址（最常用）
compute-sanitizer --tool racecheck ./app       # shared memory 数据竞争
compute-sanitizer --tool synccheck ./app       # __syncthreads() 不当使用
compute-sanitizer --tool initcheck ./app       # 未初始化显存读取
compute-sanitizer --tool memcheck --track-host-memory-issues yes ./app
```

典型输出直指案发现场：

```text
Invalid __global__ read of size 4 bytes
    Access 0x7f... is out of bounds
    vec_add.cu:12  in vecAdd            ← 就是这一行
    Read from block (3,0,0), thread (130,0,0)  ← 连哪个线程都告诉你
```

说明：sanitizer 会把运行拖慢 10~50 倍——**小数据 + Debug 版**跑它；`racecheck` 主要管 shared memory，全局内存的竞争要用 `--tool racecheck` 配合 `initcheck` 排除干扰，跨线程的全局竞争它覆盖有限（这正是[并发篇](../cpp/concurrency.md)里 TSan 的对应物，但能力弱于 TSan）。

## kernel 里 printf

```cpp
__global__ void kernel(int* data, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i == 42)                       // 限定输出量！32 线程同时打印会淹没你
        printf("i=%d val=%d\n", i, data[i]);
}
```

注意：输出**有缓冲且无序**，程序结束（或 `cudaDeviceSynchronize`）才冲刷；异常退出的 kernel 可能连 printf 都丢了——先 `CUDA_CHECK` 再说。二分定位策略：`if (blockIdx.x == X && threadIdx.x == Y) printf(...)` 逐步缩小怀疑范围。

## cuda-gdb：断点打在 GPU 上（Linux）

```bash
nvcc -G -g vec_add.cu -o app        # -G 关闭 kernel 优化（对应 host 的 -O0）
cuda-gdb ./app
    (cuda-gdb) break vec_add.cu:12
    (cuda-gdb) run
    (cuda-gdb) cuda thread (3,0,0)  # 切到指定线程视角
    (cuda-gdb) print i@blockIdx.x   # 查看该线程的局部状态
```

Windows 侧对应 Nsight 系列 GUI：**Nsight Systems** 看时间线（kernel/拷贝/空洞，定位"谁在等谁"），**Nsight Compute** 深挖单 kernel（指标与瓶颈类型，见[优化篇](cuda-optimization.md)）。调试逻辑用 cuda-gdb/Nsight，调试性能用后者，别混。

## 常见 bug 模式速查

| 症状 | 典型原因 | 修复 |
| :--- | :--- | :--- |
| `cudaErrorIllegalAddress` | 索引越界；用了 host 指针 | 检查 `i < n` 保护与索引公式；sanitizer 看行号 |
| `cudaErrorInvalidConfiguration` | block 尺寸 > 1024 / 0 维 grid | 核对 `<<<>>>` 参数与设备属性 |
| 结果随机性地错 | 竞态：缺 `__syncthreads()` | racecheck；核对栅栏成对性（见[优化篇](cuda-optimization.md)） |
| 读到的全是 0 或旧值 | 忘拷回/忘同步就读 | D2H 前 synchronize（或用会同步的 cudaMemcpy） |
| 程序偶发崩溃在无关行 | 更早的 kernel 已经非法访问 | 全程 KERNEL_CHECK + sanitizer 定位真正的出错点 |
| 精度异常 | float 累加顺序改变 | 分块归约/双精度/`__fadd_rn`（见[优化篇](cuda-optimization.md)坑表） |
| shared memory 死锁 | 栅栏在 if 分支里 | 移出分支，保证全块一致到达（[Warp 篇](warp-primitives.md)） |

## 排错工作流总结

```text
报错但不知道哪来的
  → 每个 API + KERNEL_CHECK 补全（多数问题此步现形）
  → 还不行：二分注释 kernel，锁定首个出错的启动
  → compute-sanitizer memcheck 精确到行/线程
  → 数值不对但无报错：racecheck/initcheck + 缩数据集对比 CPU 参考实现
  → 性能问题 ≠ bug，去 nsys/ncu（优化篇）
```

配套阅读：[C++ 并发](../cpp/concurrency.md)的 TSan 排查思路同源；Linux 侧通用排查见[诊断工具箱](../linux/diagnostics.md)。
