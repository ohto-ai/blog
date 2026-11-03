---
comments: true
---
# PyTorch 中的 CUDA 实践

> 从"会写 CUDA"到"会喂 GPU"：PyTorch 把 CUDA 包在了张量 API 后面，但底层就是[入门篇](cuda-basics.md)讲的那套——显存拷贝、异步 kernel、流。懂原理的人排查训练慢、显存爆，出手就是准的。代码按 PyTorch 2.x 编写。

## 设备与张量搬运

```python
import torch

torch.cuda.is_available()                     # True 才有得玩
device = torch.device("cuda:0")
torch.cuda.get_device_name(0)                 # 'NVIDIA GeForce RTX 4070'

x = torch.randn(1024, 1024)                   # 默认在 CPU
y = x.to(device)                              # H2D 拷贝（显式、可感知）
z = torch.randn(1024, 1024, device=device)    # 直接在显存创建，省一次拷贝

# 训练脚本的标准写法：模型和数据都 .to(device)
model = MyModel().to(device)
for data, label in loader:
    data, label = data.to(device), label.to(device)
```

**规则：参与同一次运算的所有张量必须在同一设备上**，否则：

```text
RuntimeError: Expected all tensors to be on the same device,
but found at least two devices, cuda:0 and cpu!
```

报错定位就看堆栈里第一个混设备 op——90% 是忘了 `.to(device)` 某个中间量或 label。

## 异步执行与"隐式同步点"

PyTorch 的 CUDA op（类似 kernel 启动）是**异步**的：Python 侧把任务排进流就返回，真正的同步只发生在需要结果的地方：

```python
a = torch.randn(4096, 4096, device="cuda")
b = a @ a                     # 排队，立即返回（Python 计时器测到的时间≈0）
c = b.sum()
v = c.item()                  # ← 隐式同步：GPU 算完才返回 Python 标量
```

由此两个日常结论：

1. **逐层 `.item()` / `print(loss)` 会打断流水线**——训练循环里每步同步一次，GPU 排队等 CPU。日志降频（每 N 步一次）或用 `detach()` 存张量最后统一取；
2. **准确计时必须先同步**：

```python
starter = torch.cuda.Event(enable_timing=True)
ender = torch.cuda.Event(enable_timing=True)
starter.record()
heavy_op()
ender.record()
torch.cuda.synchronize()               # 等流里全部完成
print(starter.elapsed_time(ender), "ms")   # GPU 时间线耗时
```

## 显存管理

```python
torch.cuda.memory_allocated()      # 张量实际占用
torch.cuda.max_memory_allocated()  # 峰值（排查 OOM 先看它）
torch.cuda.empty_cache()           # 释放缓存（PyTorch 的显存池不主动还给驱动）
```

- 报 **CUDA out of memory**：先看峰值在哪一步（`max_memory_allocated`），常见元凶是验证循环没 `torch.no_grad()` / 梯度没清、batch 里混进了大样本；
- 显存碎片：训练中段突然 OOM 而峰值不高 → `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`；
- 删掉的变量还在：`del big_tensor; torch.cuda.empty_cache()`——引用没清干净，`del` 只是删名字。

## pinned memory 与异步拷贝

```python
# 页锁定内存：真正的异步 H2D（对应 CUDA 的 cudaMallocHost，见优化篇）
cpu_data = torch.randn(1000, 1000, pin_memory=True)
gpu_data = cpu_data.to("cuda", non_blocking=True)   # 拷贝与计算重叠
# DataLoader 里对应 pin_memory=True 参数 + non_blocking=True 的 .to()
```

普通内存的 `non_blocking=True` 只是"不报错地退化成同步"——**没有 pinned 就没有真异步**。

## 多流：与 CUDA Stream 一一对应

```python
s = torch.cuda.Stream()
with torch.cuda.stream(s):                 # 这块里的 op 排进流 s
    big = torch.randn(8192, 8192, device="cuda")
    result = big @ big
torch.cuda.current_stream().wait_stream(s)  # 主流等待 s 完成（事件同步）
```

典型用法：数据预取流与训练流重叠（小 batch 训练提速明显）；单流写法不调流也能跑，**先确认瓶颈是拷贝再上多流**（nsys 时间线看得到空隙）。

## 混合精度：省一半显存，成倍吞吐

```python
scaler = torch.amp.GradScaler("cuda")

for data, label in loader:
    optimizer.zero_grad()
    with torch.autocast(device_type="cuda", dtype=torch.float16):
        output = model(data)               # matmul/conv 走 FP16，累加等自动保 FP32
        loss = criterion(output, label)
    scaler.scale(loss).backward()          # FP16 梯度防下溢：先放大再回传
    scaler.step(optimizer)
    scaler.update()
```

消费级卡（4070 这类）FP16/BF16 吞吐是 FP32 的数倍，**训练默认就该开**；数值不稳换 `dtype=torch.bfloat16`（无 GradScaler 时代替代，范围大精度低）。RTX 40 系还支持 FP8（Transformer Engine），那是后话。

## 性能分析：找慢在哪

```python
from torch.profiler import profile, ProfilerActivity

with profile(activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA]) as prof:
    for _ in range(5):
        model(data); loss.backward()
print(prof.key_averages().table(sort_by="cuda_time_total", row_limit=10))
prof.export_chrome_trace("trace.json")     # chrome://tracing 打开看时间线
```

再往深用 NVIDIA 的 nsys / ncu 包住 python 进程（用法见[CUDA 优化篇](cuda-optimization.md)），能看 kernel 级瓶颈与显存带宽。常见结论排序：数据加载是瓶颈（GPU 空闲等待）→ num_workers/pin_memory；小 kernel 太碎 → 合并 op / `torch.compile`；单 kernel 慢 → 混精度/手写扩展。

## 自定义 CUDA 扩展：把 C++ kernel 接进 PyTorch

标准库没有的 op，用 C++/CUDA 写、Python 直接调：

```python
from torch.utils.cpp_extension import load_inline

cuda_src = r"""
__global__ void scale_kernel(const float* in, float* out, float k, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;   // 熟悉的索引公式
    if (i < n) out[i] = in[i] * k;
}
"""
cpp_src = "torch::Tensor scale(torch::Tensor t, float k);"

mod = load_inline(
    name="scale_ext",
    cpp_sources=cpp_src,
    cuda_sources=cuda_src,
    functions=["scale"],
    verbose=False,
)
# out = mod.scale(x, 2.0)
```

**编译这条链路需要 MSVC 与 CUDA 版本匹配**（nvcc 对宿主编译器有白名单，见[编译与链接](../cpp/compile-link.md)的 ABI 一节），装不齐就在报错 `cl.exe not found / unsupported MSVC version` 上。生态优先级：先查 PyTorch 原生 op → `torch.compile` 融合 → Triton 写 kernel → 最后才是手写 CUDA 扩展。

## 常见坑清单

| 现象 | 原因 / 处理 |
| :--- | :--- |
| `same device` RuntimeError | 混用 CPU/CUDA 张量，逐个查 `.to(device)` |
| 训练慢但 GPU 利用率低 | 数据管道供不上数据：num_workers、pin_memory、预读 |
| 每步日志导致变慢 | `.item()`/print 隐式同步，降频 |
| OOM 在验证阶段 | 忘了 `torch.no_grad()` / `model.eval()` |
| 显存峰值正常却 OOM | 碎片：expandable_segments 或减小 batch 换梯度累积 |
| `non_blocking` 没提速 | 源内存没 pin_memory |
| 多卡每步 `.to('cuda:0')` 搬大张量 | DistributedDataParallel 本地化处理，别手动搬 |

相关：纯 CUDA 层的异步与流原理见[优化篇](cuda-optimization.md)；Python 并发（CPU 侧多进程读数据）见[并发笔记](../python/concurrency.md)。
