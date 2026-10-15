# oekit.github.io

> **oekit**（Open Easy Kit）官方站点源码——部署于 <https://oekit.github.io/>（GitHub Pages，main 分支根目录）。

本站为纯静态站点（无构建系统）：改完直接推 main 即发布。

## 结构（VitePress）

- `docs/index.md` — 落地页（hero + 模块矩阵 + 快速开始）
- `docs/guide/*.md` — 8 篇指南（Markdown 书写，TOC/侧边栏/上下篇自动生成）
- `docs/about/*.md` — 平台契约、服务模板
- `docs/public/` — 原样拷贝资产（llms.txt、旧路径重定向）
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

依赖严格自底向上（完整依赖表见各仓 README 的"矩阵总览"）：

| 层 | 模块 |
|---|---|
| L0 微工具库 / 基础件 | [errors](https://github.com/oekit/pkg/errors) · [validator](https://github.com/oekit/pkg/validator) · [stringx](https://github.com/oekit/pkg/stringx) · [slicex](https://github.com/oekit/pkg/slicex) · [enumx](https://github.com/oekit/pkg/enumx) · [convert](https://github.com/oekit/pkg/convert) · [encoding](https://github.com/oekit/pkg/encoding) · [jsonrepair](https://github.com/oekit/pkg/jsonrepair) · [httpjson](https://github.com/oekit/pkg/httpjson) · [mathx](https://github.com/oekit/pkg/mathx) · [pathx](https://github.com/oekit/pkg/pathx) · [pagination](https://github.com/oekit/pkg/pagination) · [ptrx](https://github.com/oekit/pkg/ptrx) · [timex](https://github.com/oekit/pkg/timex) · [uidgen](https://github.com/oekit/pkg/uidgen) · [cache](https://github.com/oekit/pkg/cache) · [concurrency](https://github.com/oekit/concurrency) · [logx](https://github.com/oekit/logx) · [istio](https://github.com/oekit/istio) · [core](https://github.com/oekit/core) |
| L1 门面 / 注册发现 | [metrics](https://github.com/oekit/metrics) · [tracing](https://github.com/oekit/tracing) · [registry](https://github.com/oekit/registry) |
| L2 领域件 | [data](https://github.com/oekit/data) · [gorm](https://github.com/oekit/gorm) · [redis](https://github.com/oekit/redis) · [httpx](https://github.com/oekit/httpx) · [timertask](https://github.com/oekit/timertask) · [middleware](https://github.com/oekit/middleware) · [nns](https://github.com/oekit/nns) · [nns-endpoint](https://github.com/oekit/nns-endpoint) |
| L3 应用层 / 框架生态 | [bootstrap](https://github.com/oekit/bootstrap) · [handler](https://github.com/oekit/handler) · [hertz](https://github.com/oekit/hertz) · [kitex](https://github.com/oekit/kitex) · [workflow](https://github.com/oekit/workflow) · [kitex-examples](https://github.com/oekit/kitex-examples) |

## 快速开始

```bash
# 微工具集
go get github.com/oekit/pkg@latest

# HTTP 服务全家
go get github.com/oekit/middleware github.com/oekit/hertz
```

## 兼容性

| 旧路径（重定向仍可用） | 新路径 |
|---|---|
| `git.enjoye.top/enjoydream/ekit/…`（ekit 单体，冻结维护） | `github.com/oekit/…` |

## License

MIT — 见 [LICENSE](LICENSE)


oekit 是一套按"框架耦合分层"组织的独立 Go 模块矩阵：**37 个活跃仓库（+1 归档），每仓独立发版（SemVer）、独立 CI、按需取用**。
从 `errors` / `stringx` 这类零依赖微库，到 Hertz / Kitex 生态适配器，全部遵循同一套接口分层与开发规范。

- 项目主页：**https://oekit.github.io/oekit/**
- 组织：https://github.com/orgs/oekit/repositories
- 协议：MIT

## 名字由来

| 字母 | 含义 |
|---|---|
| **o** | **Open** — 开源：MIT 协议，全部公开 |
| **e** | **Easy** — 易用：一个 import 即用，微库零捆绑 |
| **kit** | **Kit** — 工具集合：微库 → 门面 → 框架生态，同一套规范 |

## 模块矩阵

依赖严格自底向上（完整依赖表见各仓 README 的"矩阵总览"）：

| 层 | 模块 |
|---|---|
| L0 微工具库 / 基础件 | [errors](https://github.com/oekit/pkg/errors) · [validator](https://github.com/oekit/pkg/validator) · [stringx](https://github.com/oekit/pkg/stringx) · [slicex](https://github.com/oekit/pkg/slicex) · [enumx](https://github.com/oekit/pkg/enumx) · [convert](https://github.com/oekit/pkg/convert) · [encoding](https://github.com/oekit/pkg/encoding) · [jsonrepair](https://github.com/oekit/pkg/jsonrepair) · [httpjson](https://github.com/oekit/pkg/httpjson) · [mathx](https://github.com/oekit/pkg/mathx) · [pathx](https://github.com/oekit/pkg/pathx) · [pagination](https://github.com/oekit/pkg/pagination) · [ptrx](https://github.com/oekit/pkg/ptrx) · [timex](https://github.com/oekit/pkg/timex) · [uidgen](https://github.com/oekit/pkg/uidgen) · [cache](https://github.com/oekit/pkg/cache) · [concurrency](https://github.com/oekit/concurrency) · [logx](https://github.com/oekit/logx) · [istio](https://github.com/oekit/istio) · [core](https://github.com/oekit/core) |
| L1 门面 / 注册发现 | [metrics](https://github.com/oekit/metrics) · [tracing](https://github.com/oekit/tracing) · [registry](https://github.com/oekit/registry) |
| L2 领域件 | [data](https://github.com/oekit/data) · [gorm](https://github.com/oekit/gorm) · [redis](https://github.com/oekit/redis) · [httpx](https://github.com/oekit/httpx) · [timertask](https://github.com/oekit/timertask) · [middleware](https://github.com/oekit/middleware) · [nns](https://github.com/oekit/nns) · [nns-endpoint](https://github.com/oekit/nns-endpoint) |
| L3 应用层 / 框架生态 | [bootstrap](https://github.com/oekit/bootstrap) · [handler](https://github.com/oekit/handler) · [hertz](https://github.com/oekit/hertz) · [kitex](https://github.com/oekit/kitex) · [workflow](https://github.com/oekit/workflow) · [kitex-examples](https://github.com/oekit/kitex-examples) |

## 快速开始

```bash
# 微工具集
go get github.com/oekit/pkg@latest

# HTTP 服务全家
go get github.com/oekit/middleware github.com/oekit/hertz
```

## 兼容性

| 旧路径（重定向仍可用） | 新路径 |
|---|---|
| `git.enjoye.top/enjoydream/ekit/…`（ekit 单体，冻结维护） | `github.com/oekit/…` |

## License

MIT — 见 [LICENSE](LICENSE)
