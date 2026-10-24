# oekit.github.io

> **oekit**（Open Easy Kit）官方站点源码——部署于 <https://oekit.github.io/>（GitHub Pages，main 分支根目录）。

本站为纯静态站点（无构建系统）：改完直接推 main 即发布。

## 结构（VitePress）

- `docs/index.md` — 落地页（hero + 模块矩阵 + 快速开始）
- `docs/guide/*.md` — 9 篇指南（Markdown 书写，TOC/侧边栏/上下篇自动生成）
- `docs/about/*.md` — 架构总览、平台契约（ekit 时期）、服务模板
- `docs/public/` — 原样拷贝资产（llms.txt、versions.json、架构图 SVG、旧路径重定向）
- `docs/.vitepress/config.mjs` — 导航与侧边栏配置

## 本地开发

```bash
npm install
npm run dev      # 本地热更预览
npm run build    # 构建到 docs/.vitepress/dist
```

推 main 后由 GitHub Actions 自动构建并部署到 Pages。

## 名字由来

| 字母 | 含义 |
|---|---|
| **o** | **Open** — 开源：MIT 协议，全部公开 |
| **e** | **Easy** — 易用：一个 import 即用，微库零捆绑 |
| **kit** | **Kit** — 工具集合：微库 → 门面 → 框架生态，同一套规范 |

## 模块矩阵

oekit 是 **24 个独立发版的 Go 模块仓库**（根模块）＋ **11 个嵌套模块**，合计 **36 个发版单元**（每仓独立 SemVer + 独立 CI）。依赖严格自底向上——上层随意组合，下层永不反向依赖（完整架构见 [docs/about/architecture.md](docs/about/architecture.md)，机器可读版本矩阵见 [docs/public/versions.json](docs/public/versions.json)）：

| 能力层 | 模块 |
|---|---|
| 应用引导 · 框架生态 | [bootstrap](https://github.com/oekit/bootstrap) · [hertz](https://github.com/oekit/hertz) · [kitex](https://github.com/oekit/kitex) · [middleware](https://github.com/oekit/middleware) · [workflow](https://github.com/oekit/workflow) · [kitex-examples](https://github.com/oekit/kitex-examples) · [k8s](https://github.com/oekit/k8s) |
| 通信 · 服务治理 | [httpx](https://github.com/oekit/httpx) · [nns-endpoint](https://github.com/oekit/nns-endpoint) · [network](https://github.com/oekit/network) · [nns](https://github.com/oekit/nns) · [registry](https://github.com/oekit/registry) |
| 数据访问 | [gormx](https://github.com/oekit/gormx) · [redisx](https://github.com/oekit/redisx) · [etcdx](https://github.com/oekit/etcdx) · [data](https://github.com/oekit/data) · [timertask](https://github.com/oekit/timertask) |
| 可观测性 | [logx](https://github.com/oekit/logx) · [tracing](https://github.com/oekit/tracing) · [metrics](https://github.com/oekit/metrics) |
| 基础库 | [pkg](https://github.com/oekit/pkg)（23 合 1）· [concurrency](https://github.com/oekit/concurrency) · [core](https://github.com/oekit/core) · [kitx](https://github.com/oekit/kitx)（标识与校验 + hash）|

## 快速开始

```bash
# 微工具集（23 合 1，零第三方依赖）
go get github.com/oekit/pkg@latest

# 标识与校验
go get github.com/oekit/kitx@latest

# HTTP 服务全家
go get github.com/oekit/middleware github.com/oekit/hertz
```

## 兼容性

| 旧路径（重定向仍可用） | 新路径 |
|---|---|
| `git.enjoye.top/enjoydream/ekit/…`（ekit 单体，冻结维护） | `github.com/oekit/…` |
| `github.com/oekit/<micro>`（16 微库，已删仓） | `github.com/oekit/pkg/<micro>` |
| `github.com/oekit/pkg/uidgen`、`pkg/validator`（pkg v0.10.0 拆出） | `github.com/oekit/kitx/uidgen`、`kitx/validator` |
| `github.com/oekit/redis` / `gorm` | `github.com/oekit/redisx` / `gormx` |

## License

MIT — 见 [LICENSE](LICENSE)
