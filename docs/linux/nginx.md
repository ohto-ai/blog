---
comments: true
---
# Nginx 反向代理入门

> Nginx 是最常用的高性能 Web 服务器与反向代理：把 80/443 端口上的请求转给机器内部真正的应用（Node、Python、Go 等），同时承担静态文件、HTTPS 证书、负载均衡。本篇配置在 WSL Ubuntu 22.04 的 Nginx 1.18 上安装并实测反向代理转发。服务的启动与管理方式见 [systemd 实战](systemd.md)。

## 安装与目录结构

```bash
sudo apt install nginx
nginx -v                      # nginx version: nginx/1.18.0 (Ubuntu)
```

| 路径 | 内容 |
| :--- | :--- |
| `/etc/nginx/nginx.conf` | 主配置（通常只包含下面两类的引用） |
| `/etc/nginx/sites-available/` | 每个站点的配置文件（存放处） |
| `/etc/nginx/sites-enabled/` | 启用中的站点（指向前者的软链接） |
| `/var/log/nginx/access.log` | 访问日志（分析思路见[排查工具箱](diagnostics.md)） |
| `/var/log/nginx/error.log` | 错误日志（排错第一现场） |

约定做法：把站点配置写到 `sites-available/mysite`，再 `ln -s` 软链接进 `sites-enabled` 启用，不用的站点删链接即可下线。

## 配置语法：块与指令

Nginx 配置是嵌套的块结构：`events`、`http` → `server`（一个虚拟主机）→ `location`（URL 前缀/规则）。每条指令以分号结束：

```nginx
server {
    listen 80;
    server_name example.com;        # 匹配哪个域名/主机名

    location /static/ {             # 以 /static/ 开头的请求
        root /var/www/mysite;       # 从文件系统取（root 拼接完整路径）
    }

    location / {                    # 其余请求
        proxy_pass http://127.0.0.1:3000;
    }
}
```

`location` 匹配规则：前缀匹配按**最长优先**，`location = /path` 精确匹配，`location ~ \.php$` 正则匹配。不确定时用最普通的前缀即可。

## 反向代理：标准三件套

把请求转给内部应用，同时把真实的客户端信息传过去（不加这三行，应用看到的来源全是 127.0.0.1）：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;              # 保留原始域名
    proxy_set_header X-Real-IP         $remote_addr;       # 客户端真实 IP
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;   # 代理链
    proxy_set_header X-Forwarded-Proto $scheme;            # http 还是 https
}
```

应用的日志、限流、访问控制都依赖这些头——**反向代理的默认配置不会自动带上它们**，这是最常见的遗漏。

## 实际可用的最小示例

```nginx
# /etc/nginx/sites-available/myapp
server {
    listen 8080;
    server_name _;

    location /api/ {
        proxy_pass http://127.0.0.1:9001/;      # 结尾的 / 会剥掉 /api 前缀
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        return 200 "nginx is alive\n";          # 简单的健康检查页
        add_header Content-Type text/plain;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo nginx -t                        # 语法检查：the configuration file ... syntax is ok
sudo systemctl reload nginx          # 平滑重载（不断连接）
curl http://127.0.0.1:8080/api/      # 转发给 9001 端口的应用
```

`proxy_pass` 结尾**带不带 `/`** 语义不同：`http://127.0.0.1:9001/` 会剥掉 location 前缀（`/api/x` → `/x`），不带则原样拼接（`/api/x` → `/api/x`）。

## HTTPS：certbot 一条命令

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

certbot 自动改写 server 块（80 跳转 443、配置证书路径）并注册续期定时任务。证书要求域名已解析到服务器且 80 端口可达。

## 常用命令与故障排查

| 命令 | 作用 |
| :--- | :--- |
| `nginx -t` | 检查配置语法（**每次改动后、reload 前必做**） |
| `systemctl reload nginx` | 平滑加载新配置 |
| `systemctl restart nginx` | 完全重启（会断开现有连接，一般用 reload 就够） |
| `tail -f /var/log/nginx/error.log` | 排错第一现场 |

| 症状 | 原因 |
| :--- | :--- |
| 502 Bad Gateway | 后端应用没起来、端口写错，或应用只监听了 `127.0.0.1` 而代理指向其他地址 |
| 504 Gateway Timeout | 后端处理太慢；调 `proxy_read_timeout` |
| 404 但应用正常 | `proxy_pass` 末尾斜杠语义弄反，前缀拼接不对 |
| 改了配置没变化 | 忘记 `nginx -t && systemctl reload`，或改的是 sites-available 但没建软链接 |
| 上传大文件 413 | `client_max_body_size 100m;`（默认 1MB） |

## 负载均衡（简述）

```nginx
upstream backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
server {
    location / {
        proxy_pass http://backend;    # 默认轮询；ip_hash 保持会话
    }
}
```

相关：应用进程的托管与自启见 [systemd 实战](systemd.md)；服务器整体排查见[性能排查工具箱](diagnostics.md)。
