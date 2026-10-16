---
title: 架构总览
---

# 架构总览

oekit 是 23 个独立发版的 Go 模块仓库（每仓独立 SemVer + 独立 CI）。依赖**严格自底向上**：上层随意组合，下层永不反向依赖，全矩阵无环。

![oekit 模块矩阵 · 架构总览](/architecture.svg)

## 五个能力层

| 能力层 | 模块 | 职责 |
|---|---|---|
| 应用引导 · 框架生态 | [bootstrap](https://github.com/oekit/bootstrap) · [hertz](https://github.com/oekit/hertz) · [kitex](https://github.com/oekit/kitex) · [middleware](https://github.com/oekit/middleware) · [handler](https://github.com/oekit/handler) · [workflow](https://github.com/oekit/workflow) · [istio](https://github.com/oekit/istio) · [kitex-examples](https://github.com/oekit/kitex-examples) | 组合根与优雅关停、Hertz/Kitex 运行时集成、HTTP 中间件栈、CRUD Handler、流程编排、xDS 熔断 |
| 通信 · 服务治理 | [httpx](https://github.com/oekit/httpx) · [nns-endpoint](https://github.com/oekit/nns-endpoint) · [network](https://github.com/oekit/network) · [nns](https://github.com/oekit/nns) · [registry](https://github.com/oekit/registry) | HTTP 客户端（LB/熔断/重试）、端点工厂、WS/NATS/MQ、服务治理门面、注册发现核心 + Nacos |
| 数据访问 | [gorm](https://github.com/oekit/gorm) · [redis](https://github.com/oekit/redisx) · [data](https://github.com/oekit/data) · [timertask](https://github.com/oekit/timertask) | GORM 增强 + 框架无关 CRUD、Redis 客户端/缓存/分布式锁、LocalCache、分片定时任务 |
| 可观测性 | [logx](https://github.com/oekit/logx) · [tracing](https://github.com/oekit/tracing) · [metrics](https://github.com/oekit/metrics) | 统一日志门面（多后端/Sink/caller）、OpenTelemetry + trace_id 真相源、Prometheus 弹性指标族 |
| 基础库 | [pkg](https://github.com/oekit/pkg)（16 合 1）· [concurrency](https://github.com/oekit/concurrency) · [core](https://github.com/oekit/core) | 微工具集（errors/stringx/cache/…）、GoSafe/singleflight/retry、governance schema/lifecycle |

## 关键依赖链

- **服务发现**：`hertz` / `kitex` → `nns` → `registry`（Nacos 实现 + 多级降级链）
- **端点弹性**：`nns-endpoint` → `httpx`（per-service 熔断 + 换实例重试，与 httpx 的 breaker-outside-retry 层次一致）
- **数据访问**：`handler` → `gorm`（CRUD Service / 事务防丢更新）；`redis` → `data`（缓存检查器）
- **优雅关停**：`hertz.RunServer` / `kitex.RunServer` → `bootstrap` 组合根（排空连接 → 释放资源）
- **可观测贯通**：全矩阵统一走 `logx` / `tracing` / `metrics` 门面，底层实现可替换

## 设计原则

1. **依赖自底向上**——模块只能依赖更低能力层，同层依赖仅限同泳道组合（如 `handler` → `middleware`）。
2. **每仓独立发版**——SemVer 互不牵连；`matrix-tools` 每周巡检漂移（README 矩阵表 / AGENTS.md / 版本 pin）。
3. **接口分层，实现可替换**——logx、registry、cache 均面向接口编程，业务可注入自定义实现。
4. **AI Agent 友好**——每仓 `AGENTS.md` + 全站 [llms.txt](/llms.txt)，见《[AI Agent 使用](/guide/ai-agent.html)》。

完整的「模块 × 内容 × 矩阵内依赖」表见各仓 README 的「矩阵总览」（自动生成）；从 ekit 单体迁移过来的路径对照见《[迁移指南](/guide/migration.html)》。
