---
layout: home
hero:
  name: "oekit"
  text: "Open Easy Kit"
  tagline: "开源 · 易用 · 工具集合 — 24 个独立发版的 Go 模块（根模块）＋ 7 个嵌套模块，合计 31 个发版单元：微工具库、标识与校验、日志/追踪/指标门面、注册发现、HTTP/Kitex 生态、应用引导"
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: AI Agent 指南
      link: /guide/ai-agent
    - theme: alt
      text: GitHub
      link: https://github.com/orgs/oekit/repositories
features:
  - icon: 🟢
    title: Open 开源
    details: 全部 MIT 协议，源码即文档。所有仓库公开、可审计、可 fork——不锁平台。
  - icon: ⚡
    title: Easy 易用
    details: 每个模块只做一件事，import 即用；微库零依赖或至多一条内部依赖。
  - icon: 🧰
    title: Kit 工具集合
    details: 从 pkg 微库到 Hertz/Kitex 生态适配器，同套规范同套接口分层。
  - icon: 🤖
    title: AI Agent 友好
    details: 每仓 AGENTS.md 权威规范 + 全站 llms.txt 机器可读索引 + 类型同一性等硬规则成文。
---

## 模块矩阵

依赖严格自底向上——上层随意组合，下层永不反向依赖（完整架构见《[架构总览](/about/architecture)》）：

![oekit 模块矩阵 · 架构总览](/architecture.svg)

| 能力层 | 模块 |
|---|---|
| 应用引导 · 框架生态 | [bootstrap](https://github.com/oekit/bootstrap) · [hertz](https://github.com/oekit/hertz) · [kitex](https://github.com/oekit/kitex) · [middleware](https://github.com/oekit/middleware) · [workflow](https://github.com/oekit/workflow) · [kitex-examples](https://github.com/oekit/kitex-examples) · [k8s](https://github.com/oekit/k8s) |
| 通信 · 服务治理 | [httpx](https://github.com/oekit/httpx) · [nns-endpoint](https://github.com/oekit/nns-endpoint) · [network](https://github.com/oekit/network) · [nns](https://github.com/oekit/nns) · [registry](https://github.com/oekit/registry) |
| 数据访问 | [gormx](https://github.com/oekit/gormx) · [redisx](https://github.com/oekit/redisx) · [etcdx](https://github.com/oekit/etcdx) · [data](https://github.com/oekit/data) · [timertask](https://github.com/oekit/timertask) |
| 可观测性 | [logx](https://github.com/oekit/logx) · [tracing](https://github.com/oekit/tracing) · [metrics](https://github.com/oekit/metrics) |
| 基础库 | [pkg](https://github.com/oekit/pkg)（微工具集）· [concurrency](https://github.com/oekit/concurrency) · [core](https://github.com/oekit/core) · [kitx](https://github.com/oekit/kitx)（标识与校验 + hash）|

每个模块的 GitHub 仓库 README 均含可复制的最小示例；矩阵内依赖见各仓「矩阵总览」表。

## 快速开始

```bash
# 微工具集（零第三方依赖，按需 import）
go get github.com/oekit/pkg@latest

# 标识与校验
go get github.com/oekit/kitx@latest

# HTTP 服务全家
go get github.com/oekit/middleware@latest github.com/oekit/hertz@latest
```

## 兼容性

| 旧路径（已归档/删除） | 新路径 |
|---|---|
| `git.enjoye.top/enjoydream/ekit/…`（单体，冻结维护） | `github.com/oekit/…` |
| `github.com/oekit/<micro>`（16 微库） | `github.com/oekit/pkg/<micro>` |
| `github.com/oekit/pkg/uidgen`、`github.com/oekit/pkg/validator`（v0.10.0 拆出） | `github.com/oekit/kitx/uidgen`、`github.com/oekit/kitx/validator` |
| `github.com/oekit/pkg/collectionx`（pkg v0.9.0 收编） | `github.com/oekit/pkg/container` |
| `github.com/oekit/logx/shutdown`（别名已弃用） | `github.com/oekit/core/lifecycle` |
| `registry/registry`、`nns/nns`、`workflow/workflow`、`kitex/kitex`、`middleware/middleware`、`hertz/hertz` 双层路径（2026-10-17 收平） | `github.com/oekit/<mod>`（模块根） |
| `httpx.WithBalance` / `loadbalance.Balancer` 家族（httpx v0.4.0 删除） | `httpx.WithSelector` / `loadbalance.Selector` |

旧版本在 Go module proxy 缓存中仍可解析。
