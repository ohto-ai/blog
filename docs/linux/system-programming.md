---
comments: true
---
# Linux 系统编程基础

> 进程、信号、管道——用户态程序和内核打交道的方式。C/C++ 视角，与[Daemon 编写](../cpp/daemon.md)、[C++ 并发](../cpp/concurrency.md)互补。

## 文件与文件描述符

Linux 一切皆文件：普通文件、管道、socket、终端都是一串字节流 + 一个整型 **fd**。POSIX API（`open/read/write/close`）是最底层接口，stdio（`fopen/fread`）是它的缓冲封装：

```c
#include <fcntl.h>
#include <unistd.h>

int fd = open("data.bin", O_RDONLY);
char buf[4096];
ssize_t n = read(fd, buf, sizeof(buf));    // 返回实际读到的字节数，0 表示 EOF，-1 出错
write(STDOUT_FILENO, buf, n);              // 0/1/2 = stdin/stdout/stderr，进程生来就有
close(fd);
```

`ls /proc/self/fd` 能看到当前进程打开的所有 fd——排查"too many open files"时先看这里。

## 进程

### fork / exec / wait 三件套

```c
#include <sys/wait.h>
#include <unistd.h>

pid_t pid = fork();                 // 复制进程：返回两次
if (pid == 0) {                     // 子进程
    execlp("ls", "ls", "-la", NULL);// exec 族：替换当前进程映像，成功则不再返回
    _exit(127);                     // exec 失败才会走到这
}
// 父进程
int status;
waitpid(pid, &status, 0);           // 回收子进程，否则变僵尸
if (WIFEXITED(status))
    printf("exit code: %d\n", WEXITSTATUS(status));
```

**exec 族速记**：`l`=list 逐个传参，`v`=vector 传数组；带 `p` 才会搜 PATH；带 `e` 自定义环境变量。日常 `execvp` / `execlp` 最常用。

### 僵尸进程与孤儿进程

| | 是什么 | 谁负责 |
| :--- | :--- | :--- |
| 僵尸（Z 状态） | 已退出但父进程还没 `wait`，残留 PID 和退出码占着进程表 | 父进程 `wait`/`waitpid`，或父进程退出后由 init 接管收尸 |
| 孤儿 | 父进程先退出，孩子还活着 | 被 init/systemd 收养，继续运行 |

```c
// 长期跑的服务里避免积僵尸：SIGCHLD 处理器里循环 wait
#include <signal.h>
void reaper(int sig) {
    while (waitpid(-1, NULL, WNOHANG) > 0) { /* 回收完为止 */ }
}
signal(SIGCHLD, reaper);            // 或 sigaction（推荐，见下）
```

`ps aux | grep defunct` 看到 `<defunct>` 就是僵尸。

## 信号

信号是内核向进程投递的异步通知，默认动作大多是终止进程。

| 信号 | 触发 | 默认动作 | 常见用途 |
| :--- | :--- | :--- | :--- |
| SIGINT | `Ctrl+C` | 终止 | 优雅退出（清理后 exit） |
| SIGTERM | `kill <pid>` | 终止 | 优雅退出的标准信号，服务 stop 命令发它 |
| SIGKILL | `kill -9` | 终止 | **不可捕获不可忽略**，最后手段 |
| SIGSEGV | 非法内存访问 | 终止 + core | 转去[打印调用堆栈](../cpp/dump-traceback.md) |
| SIGPIPE | 向已关闭的 socket 写 | 终止 | 网络服务必须忽略/处理 |
| SIGCHLD | 子进程退出 | 忽略 | 回收子进程 |
| SIGHUP | 终端断开 / 配置重载约定 | 终止 | daemon 重载配置的约定信号 |

```c
#include <signal.h>

// 推荐用 sigaction 而不是老 signal()
struct sigaction sa = {0};
sa.sa_handler = handle_term;               // 或 SIG_IGN 忽略 / SIG_DFL 默认
sigemptyset(&sa.sa_mask);
sigaddset(&sa.sa_mask, SIGINT);            // 处理期间屏蔽 SIGINT
sa.sa_flags = SA_RESTART;                  // 自动重启被中断的系统调用
sigaction(SIGTERM, &sa, NULL);
signal(SIGPIPE, SIG_IGN);                  // 网络服务保命一行
```

!!! warning "信号处理器里不是什么都能干"
    处理器可能打断主流程中任意一行，只允许调用**异步信号安全**的函数（`write`、`_exit` 可以；`printf`、`malloc`、加锁都不行）。复杂逻辑的惯用法：处理器里只置一个 `volatile sig_atomic_t` 标志，主循环里检查它。

## 管道与 IPC 方式选择

```c
#include <unistd.h>

int fds[2];
pipe(fds);                         // fds[0] 读端，fds[1] 写端

pid_t pid = fork();
if (pid == 0) {                    // 子进程读
    close(fds[1]);                 // 不用的端要关掉，才能收到 EOF
    char buf[128];
    ssize_t n = read(fds[0], buf, sizeof(buf) - 1);
    buf[n] = '\0';
    printf("child got: %s\n", buf);
    _exit(0);
}
close(fds[0]);                     // 父进程写
write(fds[1], "hello", 5);
close(fds[1]);                     // 关写端 → 子进程 read 返回 0
waitpid(pid, NULL, 0);
```

| IPC 方式 | 单向/双向 | 数据形态 | 适用 |
| :--- | :--- | :--- | :--- |
| pipe / `|` | 单向 | 字节流 | 父子进程，shell 管道 |
| FIFO (mkfifo) | 单向 | 字节流 | 无亲缘进程的"命名管道" |
| Unix domain socket | 双向 | 字节流/报文 | **本机进程通信首选**，还能传 fd |
| 共享内存 shm | 双向 | 裸内存 | 大数据量、极低延迟，自己加同步 |
| 消息队列 | 单向/双向 | 离散消息 | 系统级，新项目少用 |
| 信号 | — | 位 | 事件通知，不传数据 |

## 环境变量

```c
#include <stdlib.h>
const char* home = getenv("HOME");        // 不存在返回 NULL，记得判空
setenv("MODE", "prod", 1);                // 1 = 覆盖
unsetenv("MODE");
extern char** environ;                    // 遍历所有环境变量
```

子进程继承父进程环境——这就是为什么 `systemd` 服务里可以用 `Environment=` 传配置。

## 再往下的路标

- **I/O 多路复用与 socket**：[网络编程基础](network-programming.md)——socket API、select/poll/epoll 与回显服务器示例；
- **线程**：`pthread_create`，C++ 侧直接用 `std::thread`/`std::jthread`（见[并发笔记](../cpp/concurrency.md)）；
- **后台服务化**：见 [Daemon 编写](../cpp/daemon.md)（fork + setsid + systemd）；
- **系统级书籍**：《The Linux Programming Interface》，链接见 [Linux 资源整理](index.md)。
