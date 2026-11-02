---
comments: true
---
# C/C++ 实现daemon

> From: @Ohto-Ai | ChatGPT

## daemon 例子
在UNIX-like系统中，daemon是一种在后台运行的长期服务进程，它通常在启动时从终端分离并运行。要使用fork()函数创建一个daemon，程序需要遵循以下步骤：

1. 创建一个父进程，并使用fork()创建一个子进程。父进程用于启动daemon，子进程用于执行daemon的任务。

2. 在子进程中使用setsid()函数创建一个新的会话，并成为该会话组的领导进程。这个步骤是为了确保daemon不接收终端的控制并且独立于其他进程运行。

3. 关闭父进程并继续在子进程中运行。这一步是为了避免daemon与原来的终端关联并确保daemon能够在后台运行。

4. 修改文件权限，关闭文件描述符以及其他需要的初始化工作。

下面是一个示例程序，展示如何使用fork()实现daemon：

```cpp
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <fcntl.h>

int main()
{
    pid_t pid;
    
    // Fork the parent process
    pid = fork();
    
    // If fork() returns a negative value, the creation of a child process was unsuccessful
    if (pid < 0)
    {
        exit(EXIT_FAILURE);
    }
    
    // If fork() returns a positive value, the parent process was successful
    if (pid > 0)
    {
        exit(EXIT_SUCCESS);
    }
    
    // Create a new session
    if (setsid() < 0)
    {
        exit(EXIT_FAILURE);
    }
    
    // Close standard file descriptors
    close(STDIN_FILENO);
    close(STDOUT_FILENO);
    close(STDERR_FILENO);
    
    // Change the current working directory to root
    chdir("/");
    
    // Change file mode mask
    umask(0);
    
    // Perform other initialization tasks
    
    // Daemon loop
    while (1)
    {
        // Perform daemon's work here
    }
    
    return EXIT_SUCCESS;
}
```
在这个示例程序中，如果fork()的返回值小于0，则父进程终止并退出程序。如果大于0，则正常退出。如果等于0，则子进程继续执行。在子进程中，使用setsid()函数创建了一个新的会话，并将当前进程设为会话组的领导进程。接下来，关闭了标准文件描述符，改变了工作目录，权限掩码，并一直在一个死循环中执行daemon的任务。

需要注意的是，以上只是一个基本的示例程序，并非完整的daemon实现，具体实现和任务需要根据实际需求进行编写。

## 关于 fork

### Linux 上 fork 创建进程
```cpp
#include <stdio.h>
#include <unistd.h>

int main()
{
    // fork执行后返回两次，分别在父进程和子进程中执行
    pid_t process_id = fork();
    
    if (process_id == 0) // 子进程
    {
        printf("Hello from child process!\n");
    }
    else if (process_id > 0) // 父进程
    {
        printf("Hello from parent process! Child has pid %d.\n", process_id);
    }
    else // fork()执行失败
    {
        printf("Failed to create child process.\n");
    }
    
    return 0;
}
```

### Windows 上进程的创建
```cpp
#include <Windows.h>
#include <stdio.h>

int main()
{
    PROCESS_INFORMATION process_info;
    STARTUPINFO startup_info;
    ZeroMemory(&process_info, sizeof(process_info));
    ZeroMemory(&startup_info, sizeof(startup_info));
    startup_info.cb = sizeof(startup_info);
    
    // CreateProcess执行后会创建一个新的进程，可以与父进程分离运行
    if (CreateProcess(NULL, "notepad.exe", NULL, NULL, FALSE, 0, NULL, NULL, &startup_info, &process_info))
    {
        printf("Child process created with PID: %d\n", process_info.dwProcessId);
        CloseHandle(process_info.hProcess);
        CloseHandle(process_info.hThread);
    }
    else // CreateProcess执行失败
    {
        printf("Failed to create child process.\n");
    }
    
    return 0;
}
```

## 关于 systemd

> unit 文件的完整写法、安全加固、timer 与调试见[systemd 服务实战](../linux/systemd.md)。

### 标准输入输出

在daemon中通常需要关闭标准输入(stdin)、标准输出(stdout)和标准错误(stderr)，因为它们会与终端关联，并且可能会影响后台运行。如果需要输出日志，可以使用系统日志（syslog）或者自定义日志等方式。

当标准输出和标准错误被关闭时，使用printf输出的内容将不会显示在终端中。如果想要在后台输出日志，可以使用syslog库函数来实现，它可以直接将日志输出到指定的日志文件或者系统日志中。

systemd对于systemd unit file定义的服务，包括Type=simple、Type=forking等，都会将StandardOutput和StandardError参数设置为journal，这意味着输出的信息会被传递到systemd的日志系统中，并可以在使用systemctl status <service-name>命令时查看日志。如果需要输出到日志文件中，可以设置StandardOutput和StandardError参数为指定的日志文件名。例如，可以在systemd unit file中添加如下配置：

```
StandardOutput=file:/var/log/mydaemon.log
StandardError=file:/var/log/mydaemon.log
```

### 用户输入

当使用systemd启动进程后，如果进程要求用户输入，那么用户将无法直接输入，因为systemd启动的进程通常是在后台运行，并且没有控制终端。这种情况下，进程会阻塞在等待用户输入的操作上，并且可能会因为无法获取必要的数据而无法正常运行。

有两种方法可以解决这个问题：

1. 将需要用户输入的参数预先配置好并传递给进程，例如在systemd unit file中使用ExecStart=指定需要传递的参数。这样启动进程时就不需要用户输入参数了。

2. 在进程中使用其他方式获取输入，例如从文件读取、获取环境变量等方式。这种方法需要进程本身有这样的参数获取功能，并且需要进行修改，不适用于所有情况。

需要注意的是，如果不管使用哪种方法，只要进程需要用户输入参数，就需要使用systemd unit file的Type=oneshot或Type=simple，而不是Type=forking或Type=notify等需要后台运行的类型。因为这些类型的进程会在systemd启动后立即返回，无法和用户交互。

### Type 的区别

systemd的Type字段指定如何管理和监控进程。一共有7种Type类型，包括：

1. 'simple'：默认类型，表示进程运行后systemd认为它已经启动完成。

2. 'forking'：表示进程启动后会调用fork()创建新进程，然后父进程退出。使用此类型时，systemd 等待子进程成功启动并发送“READY=1”的通知消息后才会确认进程启动成功。通过PIDFile=可以指定 PID 文件路径，如果在指定时间段内PID文件被删除，systemd将终止启动失败的服务。

3. 'oneshot'：表示进程完成一次性任务后就会退出。systemd 等待进程完成并退出后才会确认启动成功。

4. 'notify'：表示进程启动后通过发送sd_notify()函数通知字串READY=1告知systemd启动完成。对于这种服务，如果在指定的时间内没有收到 READY=1 的消息，systemd 就会认为启动失败。

5. 'dbus'：表示进程启动后会监听D-Bus的接口，systemd将等待进程给dbus发送启动完成的信号来确认进程启动完成。

6. 'idle'：表示进程已经在运行，systemd只是简单地采用管理函数启动。

7. 'notify-socket'：表示进程启动后适用socket的方式通知进程已准备就绪（通过sd_notify()函数），与notify类似。

可以根据不同的服务特性来选择不同的Type类型。例如，如果服务是一个长时间运行的服务进程，则通常使用simple或forking类型。如果服务是一个完成一次性任务的脚本，则使用oneshot类型。如果需要通过dbus或者socket将服务注册到系统事件总线中，则可以使用对应的类型。

### sd_notify 函数

sd_notify()是systemd提供的一个函数，用于向systemd发送通知消息。它可以用于指示服务启动、停止、重启、状态变化等操作。当systemd收到通知消息时，它会更新服务状态，并向其他应用程序广播这些通知。

sd_notify()函数的原型如下：

Copy code
int sd_notify(int unset_environment, const char *state);
sd_notify()函数接受两个参数：

unset_environment：表示是否取消当下的SM_STATE环境变量，一般不需要设置。如果设置为非零值，表示可以将当前的SM_STATE环境变量设置为空值。

state：表示当前服务的状态，可以是以下值之一：

- READY=1：表示服务已经启动完成，可以接受客户端请求。

- STATUS=<status>：表示服务状态发生了变化，<status>是一个字符串，说明服务的当前状态。

- RELOADING=1：表示服务正在重新加载配置。

- STOPPING=1：表示服务正在停止。

- WATCHDOG=1：表示服务正在进行自我监控。

sd_notify()函数通常在服务启动时使用，在进入主循环之前添加调用，告知systemd服务已成功启动，可以接受请求。这样，systemd就知道了服务的状态，并可以监控服务的运行状态。

需要注意的是，sd_notify()函数只有在systemd的控制下启动的服务中才有效，对于其他任意进程调用sd_notify()函数是没有任何作用的。

在Type=forking的systemd服务中，通常需要使用sd_notify()函数来通知systemd服务已经启动成功，并且获取主进程的PID，以用于systemd监控该服务的状态。这是因为，使用Type=forking类型启动的服务，systemd无法直接得知服务的真正进程ID，而必须由服务本身通过sd_notify()函数通知systemd。

虽然在Type=forking的systemd服务中可以不使用sd_notify()函数，但是这样会导致systemd无法监控到服务的启动状态，如果服务意外停止，systemd无法自动重启服务，从而增加了服务管理的难度。

因此，一般建议在Type=forking的systemd服务中使用sd_notify()函数通知systemd进程已经启动完成。可以在服务启动时调用sd_notify(0, "READY=1")函数，将READY状态通知给systemd。如果服务需要重新加载配置，则可以在重新加载配置时使用sd_notify(0, "RELOADING=1")通知systemd。
