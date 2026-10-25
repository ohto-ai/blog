---
comments: true
---
# Linux 笔记

这里整理 Linux 相关的笔记，目前包含：

- [常用命令速查](linux-commands.md)：按场景分类的日常命令清单
- [文本三剑客 grep / sed / awk](text-processing.md)：文本处理实战
- [Shell 脚本笔记](shell-scripting.md)：语法、陷阱与实战脚本
- [系统编程基础](system-programming.md)：进程、信号与 IPC

以及一份按用途整理的**学习资源清单**（见下文）。

## 权威文档

- **[Linux man-pages (man7.org)](https://man7.org/linux/man-pages/)** — Michael Kerrisk 维护的权威 man 手册在线版，覆盖系统调用、库函数、命令与内核接口。Kerrisk 同时是《The Linux Programming Interface》作者。
- **[kernel.org 内核文档](https://www.kernel.org/doc/html/latest/)** — 内核官方文档，含用户手册、驱动开发、子系统文档与[内核开发入门 HOWTO](https://www.kernel.org/doc/html/latest/process/howto.html)。
- **[GNU 软件手册](https://www.gnu.org/manual/)** — coreutils（`ls`/`cp`/`sort` 等基本命令）、bash、grep、sed、awk（gawk）的官方手册。
- **[freedesktop.org](https://www.freedesktop.org/wiki/)** — 桌面与系统层标准（systemd、D-Bus、wayland 等）文档所在地。

## 命令速查

- **[tldr pages](https://tldr.sh/)** — 社区维护的简化 man 页，用例子说话，装个客户端（如 [tealdeer](https://github.com/tealdeer-rs/tealdeer)）配合 `--update` 使用体验极佳。
- **[cheat.sh](https://cheat.sh/)** — `curl cheat.sh/tar` 一行命令直接查速查表，无需安装。
- **[explainshell.com](https://explainshell.com/)** — 粘贴一条完整命令，逐段解释每个参数的含义，看懂网上复制的长命令神器。

## 系统性教程

- **[The Linux Command Line](https://linuxcommand.org/tlcl.php)** — William Shotts 的免费电子书（英文），从 shell 基础到 shell 脚本编写，最推荐的系统入门材料。
- **[Linux Journey (LabEx)](https://labex.io/linuxjourney)** — 交互式课程，从概念到命令分级闯关，适合零基础（原 linuxjourney.com，已并入 LabEx）。
- **[MIT The Missing Semester](https://missing.csail.mit.edu/)** — MIT 的「课堂上缺失的一学期」，讲 shell、vim、git、调试、性能工具等开发者必备技能，[中文翻译版](https://missing-semester-cn.github.io/)可用。
- **[鸟哥的 Linux 私房菜](https://linux.vbird.org/)** — 中文世界的经典教程，基础篇 + 服务器架设篇，适合打好概念地基。

## 发行版文档

- **[Arch Wiki](https://wiki.archlinux.org/)** — **公认质量最高的发行版 Wiki**，即使不用 Arch 也常常来这里查配置方法（[中文版](https://wiki.archlinux.org/title/Main_Page_(%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87))可用）。
- **[Debian 管理员手册](https://debian-handbook.info/)** — 免费在线阅读，Debian 系（含 Ubuntu）运维圣经。
- **[Ubuntu Server Documentation](https://ubuntu.com/server/docs)** 与 [Red Hat 文档](https://docs.redhat.com/) — 对应企业发行版的官方手册。

## 进阶与内核

- **[The Linux Programming Interface](https://man7.org/tlpi/)** — Kerrisk 的书，Linux/UNIX 系统编程百科全书，配套示例代码免费下载。
- **[Linux insides](https://github.com/0xAX/linux-insides)** — 逐步拆解内核内部机制的免费书。
- **[Bootlin 培训教材](https://bootlin.com/community/)** — 嵌入式 Linux 与内核开发的免费幻灯片/实验，质量极高。
- **[TLDP (The Linux Documentation Project)](https://tldp.org/)** — 历史悠久的 HOWTO 集合，部分内容偏旧但 Advanced Bash-Scripting Guide 仍是 shell 脚本宝典。

## 社区与资讯

- **[LWN.net](https://lwn.net/)** — 深度内核与开源社区报道，每周新闻免费阅读。
- **[Unix & Linux Stack Exchange](https://unix.stackexchange.com/)** — 提问前先搜，大部分命令行疑难都有高质量答案。
- [r/linux](https://www.reddit.com/r/linux/) / [r/commandline](https://www.reddit.com/r/commandline/) — 资讯与技巧流。
