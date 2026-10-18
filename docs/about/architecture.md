---
title: 架构总览
---

# 架构总览

oekit 是 24 个独立发版的 Go 模块仓库（每仓独立 SemVer + 独立 CI）。依赖**严格自底向上**：上层随意组合，下层永不反向依赖，全矩阵无环。

![oekit 模块矩阵 · 架构总览](/architecture.svg)

## 五个能力层

| 能力层 | 模块 | 职责 |
|---|---|---|
| 应用引导 · 框架生态 | [bootstrap](https://github.com/oekit/bootstrap) · [hertz](https://github.com/oekit/hertz) · [kitex](https://github.com/oekit/kitex) · [middleware](https://github.com/oekit/middleware) · [workflow](https://github.com/oekit/workflow) · [kitex-examples](https://github.com/oekit/kitex-examples) · [k8s](https://github.com/oekit/k8s) | 组合根与**就绪门**（`App.Ready` + NNS 延迟注册）、Hertz/Kitex 运行时（`RunServer` 变参 `WithOnReady` TCP 探活就绪门、transportx/chainmw 桥接；hertz 含 CRUD Handler 与 xDS 熔断子包）、标准中间件栈 + chainmw 框架无关内核（一份逻辑两端跑）、流程编排、K8s 客户端构建与 Lease 选主 |
| 通信 · 服务治理 | [httpx](https://github.com/oekit/httpx) · [nns-endpoint](https://github.com/oekit/nns-endpoint) · [network](https://github.com/oekit/network) · [nns](https://github.com/oekit/nns) · [registry](https://github.com/oekit/registry) | HTTP 客户端（LB Selector：RoundRobin/Weighted/一致性哈希/p2c 自适应 + codec 注册制 json/form + 熔断/重试 + net/http 桥接 NewRoundTripper/StdClient）、端点工厂（per-service 熔断 + 换实例重试）、WS/NATS/MQ、服务治理门面、注册发现核心 + Nacos |
| 数据访问 | [gormx](https://github.com/oekit/gormx) · [redisx](https://github.com/oekit/redisx) · [etcdx](https://github.com/oekit/etcdx) · [data](https://github.com/oekit/data) · [timertask](https://github.com/oekit/timertask) | 数据访问门面 data（八子包 re-export 复刻 ekit data/ 能力面 + cached 缓存读写编排 + twolevel 两级缓存/失效广播）：GORM 增强 + 框架无关 CRUD、Redis 客户端/缓存/分布式锁（续期）/信号量/分布式限流、etcd 客户端/注册发现实现/分布式锁、缓存接口 + LocalCache/SingleFlightCache（实现在 pkg/cache）、分片定时任务（可选可靠投递） |
| 可观测性 | [logx](https://github.com/oekit/logx) · [tracing](https://github.com/oekit/tracing) · [metrics](https://github.com/oekit/metrics) | 统一日志门面（多后端/`WithFilter` 脱敏/Slogger·TraceHandler slog 桥/caller 归属）、OpenTelemetry + trace_id 真相源、Prometheus 弹性指标族 |
| 基础库 | [pkg](https://github.com/oekit/pkg)（微工具集）· [concurrency](https://github.com/oekit/concurrency) · [core](https://github.com/oekit/core) · [kitx](https://github.com/oekit/kitx) | 微工具集（errors/stringx/cache/container/…）、并发原语 + **三态熔断状态机**（closed/open/half-open + 代绑定，熔断期收敛探测级）、应用基建件（config 多源叠加/transport 协议无关上下文/chain 中间件链/lifecycle）、标识与校验 + 非密码学哈希（uidgen/validator/hash）|

## 关键依赖链

- **服务发现**：`hertz` / `kitex` → `nns` → `registry`（Nacos 实现 + 多级降级链）
- **就绪门与延迟注册**：`hertz.RunServer` / `kitex.RunServer`（`WithOnReady`，全部 HostPort TCP 探活可建连后才回调）→ `bootstrap.App.Ready()` → `bootstrap/nacos` 此刻才执行 NNS 注册；关停序 nns 反注册 → `server.Shutdown`（对齐 kratos Stop）
- **端点弹性**：`nns-endpoint` → `httpx`（per-service 熔断 + 换实例重试，与 httpx 的 breaker-outside-retry 层次一致）；熔断语义统一由 `concurrency/breaker` 三态状态机（探测成功关闸清窗、代绑定防陈旧回报记账、冷却期独立于探测时限）供给
- **中间件一份逻辑两端跑**：`core/chain`（stdlib 中间件链）+ `core/transport`（协议无关传输上下文）→ `middleware/chainmw`（Recovery 带 panic 隔离上报 / AccessLog skip+redact / MetadataPropagate）→ hertz 直用、kitex 经 `kitex/chainmw.ToKitex` 桥接
- **数据访问**：`hertz/crudh` → `gormx`（泛型 CRUD Handler / 事务防丢更新）；`redisx` → `data`（CacheAside 接口与契约套件）；`data` 为门面（八子包 re-export pkg 与各子仓，cached/twolevel 为原生子包：写后失效缓存编排 + 两级缓存与失效广播）
- **优雅关停**：`hertz.RunServer` / `kitex.RunServer` → `bootstrap` 组合根（就绪门 → 排空连接 → 释放资源；Manager 正身 `core/lifecycle`，`logx/shutdown` 仅余 Deprecated 别名）
- **可观测贯通**：全矩阵统一走 `logx` / `tracing` / `metrics` 门面，底层实现可替换

## 设计原则

1. **依赖自底向上**——模块只能依赖更低能力层，同层依赖仅限同泳道组合（如 `nns-endpoint` → `httpx`）。
2. **公共抽象下沉 core**——lifecycle、chain、transport 依次下沉 core（仅标准库），避免下游为通用抽象拖框架依赖（先例：chain 下沉防 hertz 污染）。
3. **每仓独立发版**——SemVer 互不牵连；`matrix-tools` 每周巡检漂移（README 矩阵表 / AGENTS.md / 版本 pin）。
4. **接口分层，实现可替换**——logx、registry、cache、httpx codec 与 Selector 均面向接口/注册制编程，业务可注入自定义实现。
5. **AI Agent 友好**——每仓 `AGENTS.md` + 全站 [llms.txt](/llms.txt)，见《[AI Agent 使用](/guide/ai-agent.html)》。

完整的「模块 × 内容 × 矩阵内依赖」表见各仓 README 的「矩阵总览」（自动生成）；从 ekit 单体迁移过来的路径对照见《[迁移指南](/guide/migration.html)》。
