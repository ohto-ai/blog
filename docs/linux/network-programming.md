---
comments: true
---
# Linux 网络编程基础

> socket API 全景 + 一个能跑的 epoll 回显服务器。[系统编程基础](system-programming.md) 的续篇：fd 概念、进程、信号那套直接沿用。

## TCP socket 流程全景

```text
        服务端                              客户端
   socket()  创建 fd                  socket()
      │                                  │
   bind()    绑定 IP:端口                 │
      │                                  │
   listen()   开始监听                     │
      │                                  │
   accept()   阻塞等连接  ◄──── 建立连接 ──── connect()
      │                                  │
   read() ◄────────── 数据流 ──────────► write()
      │                                  │
   close() ──── 四次挥手（双方各自 close）──── close()
```

## 服务端 + 客户端最小代码

```c
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstdio>
#include <cstring>

int main() {
    // 1. 创建 socket：AF_INET=IPv4, SOCK_STREAM=TCP
    int lfd = socket(AF_INET, SOCK_STREAM, 0);

    // 2. SO_REUSEADDR：重启服务时跳过 TIME_WAIT 占用，服务必设
    int one = 1;
    setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));

    // 3. 绑定地址。注意字节序：端口和 IP 都要用 htons/htonl 转网络序
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);   // 监听所有网卡
    addr.sin_port = htons(9000);
    bind(lfd, (sockaddr*)&addr, sizeof(addr));

    // 4. listen：第二个参数是半连接队列长度（backlog）
    listen(lfd, 128);

    // 5. accept：阻塞直到有客户端连进来，返回【新的】fd 与该连接通信
    int cfd = accept(lfd, nullptr, nullptr);

    // 6. 读写。read/write 返回值：>0 实际字节数，0 对端关闭，-1 出错
    char buf[4096];
    ssize_t n = read(cfd, buf, sizeof(buf));
    write(cfd, buf, n);          // 原样回显（生产代码要处理部分写，见下）

    close(cfd);
    close(lfd);
}
```

```c
// ---- 客户端：不需要 bind/listen/accept，connect 即发起 ----
int cfd = socket(AF_INET, SOCK_STREAM, 0);
sockaddr_in addr{};
addr.sin_family = AF_INET;
addr.sin_port = htons(9000);
inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);   // 点分 IP → 二进制
connect(cfd, (sockaddr*)&addr, sizeof(addr));
write(cfd, "ping", 4);
char buf[16];
ssize_t n = read(cfd, buf, sizeof(buf));            // 收到 "ping"
```

!!! warning "read 返回 0 ≠ 出错，-1 才是"
    `read() == 0` 是**对端正常关闭**（EOF），该收尾收尾；`-1` 看 `errno`：`EAGAIN`（非阻塞下没数据，继续）、`EINTR`（被信号打断，重试）、`ECONNRESET`（对端异常断开）。把 0 和 -1 混着处理是新手服务最容易崩的地方。

## 一个能跑的 epoll 回显服务器

单线程支撑上万连接的关键：把 fd 交给内核监视，**就绪的才处理**。select → poll → epoll 的演进就是"每次全量传 fd 数组"到"内核维护红黑树 + 就绪链表"：

```c
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstdlib>
#include <cstring>

#define MAX_EVENTS 64

int main(int argc, char* argv[]) {
    int port = argc > 1 ? atoi(argv[1]) : 9000;

    int lfd = socket(AF_INET, SOCK_STREAM, 0);
    int one = 1;
    setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(port);
    bind(lfd, (sockaddr*)&addr, sizeof(addr));
    listen(lfd, 128);

    // 1. 创建 epoll 实例（内核数据结构句柄）
    int ep = epoll_create1(0);

    // 2. 把监听 fd 挂上 epoll，关注"可读"事件
    epoll_event ev{.events = EPOLLIN, .data.fd = lfd};
    epoll_ctl(ep, EPOLL_CTL_ADD, lfd, &ev);

    epoll_event events[MAX_EVENTS];
    for (;;) {
        // 3. 阻塞等待，只返回就绪的 fd（-1 = 一直等）
        int n = epoll_wait(ep, events, MAX_EVENTS, -1);
        for (int i = 0; i < n; i++) {
            int fd = events[i].data.fd;
            if (fd == lfd) {
                // 监听 fd 可读 = 有新连接，accept 后同样挂进 epoll
                int cfd = accept(lfd, nullptr, nullptr);
                ev.events = EPOLLIN;
                ev.data.fd = cfd;
                epoll_ctl(ep, EPOLL_CTL_ADD, cfd, &ev);
            } else {
                // 连接 fd 可读 = 有数据（或对端关闭）
                char buf[4096];
                ssize_t nread = read(fd, buf, sizeof(buf));
                if (nread <= 0) {
                    close(fd);                 // 0=EOF，-1=错误：两种都关掉清理
                } else {
                    write(fd, buf, nread);     // 回显（生产代码要处理部分写）
                }
            }
        }
    }
}
```

### LT 与 ET

| 模式 | 行为 | 注意 |
| :--- | :--- | :--- |
| LT（默认） | 只要还有数据没读完，**每次** `epoll_wait` 都会通知 | 容错好，一次读不完没事 |
| `EPOLLET` | 只在**状态变化**时通知一次 | 必须循环读到 `EAGAIN`，漏读就"卡死" |

新项目用 LT 起步最稳；ET + 非阻塞 + 循环读写是高性能服务（nginx 风格）的写法。

## 应用层协议：read 不保消息边界

TCP 是**字节流**——两次 `write` 对端可能一次收到，一次长的可能分三次到。必须自己定义消息边界，两种基本做法：

```text
1. 定界符：每条消息以 '\n' 结尾（简单，但内容需转义）
2. 长度前缀：先 4 字节长度，再消息体（二进制协议标准做法）
   [len:4B][payload:len B][len:4B][payload]...
```

黏包/半包处理是所有 TCP 应用的第一课；UDP 则天然保留消息边界（但可能丢、乱序，需要应用层自己兜）。

## 常用 socket 选项与模式

| 需求 | 做法 |
| :--- | :--- |
| 重启免 TIME_WAIT 等待 | `SO_REUSEADDR`（服务端必设） |
| 心跳探测死连接 | `SO_KEEPALIVE` + TCP_KEEPIDLE/INTVL/CNT |
| 关闭 Nagle（要低延迟） | `TCP_NODELAY` |
| 读超时 | `SO_RCVTIMEO` 或 `poll(fd, POLLIN, timeout)` |
| 非阻塞模式 | `fcntl(fd, F_SETFL, O_NONBLOCK)`（ET 必备） |
| 传递凭据/大文件 | `sendfile()` 零拷贝、`recvmsg` 传 fd |

## 排错路标

- `netstat -s` / `ss -ti`：重传、拥塞窗口、RTT；
- 抓包：`tcpdump -i any port 9000 -nn -A`（见[排查工具箱](diagnostics.md)网络一节）；
- `ss -lnt` 看 backlog 是否打满（`Recv-Q` 接近 `Send-Q`）；
- 本机端口被占：`lsof -i:9000`，SO_REUSEADDR 不是让你绑定已占用端口的。

完整的生产服务器还需要：优雅退出（信号处理见[系统编程](system-programming.md)）、连接对象的生命周期管理（C++ 侧见[智能指针](../cpp/smart-pointers.md)的 `enable_shared_from_this`）、多线程 + epoll 的任务分发（Reactor 模式）——逐步展开。
