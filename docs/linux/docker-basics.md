---
comments: true
---
# Linux 容器基础（Docker）

> 把"在我机器上是好的"变成"在哪都是好的"。容器不是虚拟机：共享内核、秒级启动、镜像几百 MB 起。

## 容器 vs 虚拟机

| | 容器 | 虚拟机 |
| :--- | :--- | :--- |
| 隔离层级 | 进程级（内核 namespace + cgroup） | 硬件级（Hypervisor） |
| 启动 | 秒级 | 分钟级 |
| 体积 | MB 级镜像 | GB 级系统盘 |
| 性能 | 接近原生 | 有虚拟化损耗 |
| 内核 | **共享宿主机内核** | 每台 VM 自己的内核 |

三个核心概念：**镜像**（只读模板，分层存储）、**容器**（镜像的运行实例，加一层可写层）、**仓库**（存镜像，Docker Hub / 自建 registry）。

## 命令速查

```bash
# ---- 镜像 ----
docker pull ubuntu:24.04          # 拉镜像（带 tag，别用裸 latest）
docker images                     # 本地镜像列表
docker rmi <image>                # 删镜像
docker build -t myapp:1.0 .       # 从 Dockerfile 构建

# ---- 容器 ----
docker run -d --name web -p 8080:80 nginx         # 后台起容器，端口映射 host:container
docker run -it --rm ubuntu:24.04 bash             # 交互式进去玩，退出即删（--rm 好习惯）
docker ps                                          # 运行中的容器；-a 含已退出
docker exec -it web bash                           # 进入运行中的容器
docker logs -f --tail 100 web                      # 看日志（最常用的排错命令）
docker stop / start / restart web
docker rm web                                      # 删容器（须先 stop）
docker inspect web | jq '.[0].NetworkSettings'     # 元数据（IP、挂载、配置）
docker stats                                       # 容器资源占用
docker system prune                                # 清理无用镜像/容器/网络（-a 连未用镜像）
```

**run 高频参数**：`-d` 后台、`-it` 交互、`-p host:ct` 端口、`-v path:path` 挂载、`-e KEY=val` 环境变量、`--name` 命名、`--rm` 退出即删、`--network xxx` 指定网络、`--restart=unless-stopped` 开机自启策略。

## Dockerfile：从源码到镜像

```dockerfile
# ---- 构建阶段 ----
FROM ubuntu:24.04 AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake \
    && rm -rf /var/lib/apt/lists/*          # 同层清理，不留缓存增加体积
WORKDIR /src
COPY . .                                     # 先 COPY 依赖清单再装依赖能吃到缓存
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j

# ---- 运行阶段：只带走产物，不带编译器 ----
FROM ubuntu:24.04
COPY --from=build /src/build/app /usr/local/bin/app
RUN useradd -m appuser                       # 别用 root 跑服务
USER appuser
EXPOSE 8080                                  # 声明端口（文档作用，映射仍需 -p）
ENTRYPOINT ["app"]
```

```bash
docker build -t myapp:1.0 .
docker run -d -p 8080:8080 myapp:1.0
```

### 写好 Dockerfile 的关键：层与缓存

- 每条指令一层；**不变的部分放前面**（如 apt install 依赖），常变的放后面（COPY 源码）——改一行代码不用重装依赖；
- `RUN apt-get update && apt-get install && rm -rf /var/lib/apt/lists/*` 必须**同一条 RUN**，分两行缓存里会留下大列表；
- `.dockerignore` 排除 `.git`、`build/`、大文件，构建上下文小了速度才快；
- **多阶段构建**（上面例子）是瘦身神器：编译环境几个 GB，最终镜像只带二进制。

## 数据卷：容器删了数据还在

```bash
docker run -v /host/data:/container/data ...   # bind mount：直接挂宿主机目录（开发常用）
docker run -v mydata:/var/lib/mysql ...        # named volume：Docker 托管（数据库类推荐）
docker volume ls / inspect mydata
```

容器可写层随容器删除而消失——**一切要保留的数据都走卷**。

## 网络

```bash
docker run -d -p 8080:80 nginx          # host:8080 → 容器:80
docker network create mynet             # 自建 bridge 网络
docker run -d --network mynet --name db postgres
docker run -d --network mynet --name app myapp
# 同一网络内容器【用容器名当主机名】互访：app 里直接连 db:5432
```

同网络容器互访走内部 DNS（容器名解析），这是 compose 里服务互联的基础。

## Compose：一个文件编排多个容器

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    depends_on:
      - db
    environment:
      DB_HOST: db            # 服务名即主机名
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: secret

volumes:
  pgdata:
```

```bash
docker compose up -d          # 一键起全套
docker compose logs -f app
docker compose down           # 停止并删除（-v 连卷一起删，慎用）
docker compose up -d --build  # 改了代码重新构建
```

## 排错与安全

- 起不来：`docker logs`（容器内 stdout/stderr）、`docker run --rm -it img bash` 手动复现；
- 进不去端口：确认 `-p` 映射、容器内服务监听 `0.0.0.0` 而不是 `127.0.0.1`（**经典坑**）；
- 镜像瘦身：多阶段构建 + slim/alpine 基础镜像 + `.dockerignore`；
- 别把密码写进 Dockerfile/镜像（历史层能扒出来）：用 `-e`、`--env-file` 或 secrets；
- 默认容器以 root 跑：Dockerfile 里 `USER`，或 run 时 `--user`。

相关：底层原理（namespace/cgroup）见[系统编程基础](system-programming.md)；服务编排后台跑见[常用命令速查](linux-commands.md)的 systemd 一节。
