---
title: 快速开始
---

三种起步姿势：单个微库、可观测门面组合、HTTP/RPC 全栈骨架。

## 三种起步姿势

### 姿势一：只要一个微库

oekit 的 20 个基础工具包合在 [oekit/pkg](https://github.com/oekit/pkg) 一个 module 里（零第三方依赖，仅标准库），Go 按包编译，import 哪个用哪个：

```bash
go get github.com/oekit/pkg@latest
```

```go
package main

import (
    "fmt"

    "github.com/oekit/pkg/errors"
    "github.com/oekit/pkg/stringx"
)

func main() {
    if err := doSomething(); err != nil {
        // nil-safe 包装 + kv 关联字段
        err = errors.Wrap(err, "do something failed", "user_id", 42)
        fmt.Println(errors.Cause(err))
    }
    fmt.Println(stringx.Pluralize(3, "module")) // 3 modules
}
```

### 姿势二：可观测门面组合

```bash
go get github.com/oekit/logx github.com/oekit/tracing github.com/oekit/metrics github.com/oekit/registry
```

`logx` 是全矩阵的日志门面（详见 [日志指南](/guide/logging.html)），
`tracing` 提供 OTel 接入与 trace_id 上下文，`metrics` 提供 Prometheus Registry，
`registry` 提供服务注册发现抽象与 Nacos 实现。

### 姿势三：HTTP / RPC 全栈骨架

```bash
# HTTP 服务：中间件栈 + Hertz 运行时 + 应用引导
go get github.com/oekit/middleware github.com/oekit/hertz github.com/oekit/bootstrap
# RPC 服务：Kitex 生态
go get github.com/oekit/kitex github.com/oekit/nns github.com/oekit/nns-endpoint
```

全栈骨架参考 [HTTP 服务指南](/guide/http-service.html) 与 [RPC 服务指南](/guide/rpc-service.html)。

## 模块地图

依赖严格自底向上——上层随意组合，下层永不反向依赖：

| 能力层 | 模块 | 说明 |
|---|---|---|
| 应用引导 · 框架生态 | [bootstrap](https://github.com/oekit/bootstrap) · [hertz](https://github.com/oekit/hertz) · [kitex](https://github.com/oekit/kitex) · [middleware](https://github.com/oekit/middleware) · [workflow](https://github.com/oekit/workflow) · [kitex-examples](https://github.com/oekit/kitex-examples) · [k8s](https://github.com/oekit/k8s) | 组合根与就绪门、Hertz/Kitex 运行时（`RunServer WithOnReady` TCP 探活 + transportx/chainmw 桥接；含 CRUD handler 与 xDS 熔断子包）、中间件栈 + chainmw 框架无关内核、流程编排、K8s 客户端与 Lease 选主 |
| 通信 · 服务治理 | [httpx](https://github.com/oekit/httpx) · [nns-endpoint](https://github.com/oekit/nns-endpoint) · [network](https://github.com/oekit/network) · [nns](https://github.com/oekit/nns) · [registry](https://github.com/oekit/registry) | HTTP 客户端（Selector 负载均衡含 p2c + codec 注册制 + 熔断重试）、端点熔断、WS/NATS、服务治理、注册发现 + Nacos |
| 数据访问 | [gormx](https://github.com/oekit/gormx) · [redisx](https://github.com/oekit/redisx) · [etcdx](https://github.com/oekit/etcdx) · [data](https://github.com/oekit/data) · [timertask](https://github.com/oekit/timertask) | SQL/CRUD、Redis、etcd（客户端/注册发现/分布式锁）、缓存编排 + 两级缓存、定时任务（可选可靠投递） |
| 可观测性 | [logx](https://github.com/oekit/logx) · [tracing](https://github.com/oekit/tracing) · [metrics](https://github.com/oekit/metrics) | 日志门面（脱敏/slog 双向桥）、OTel、Prometheus |
| 基础库 | [pkg](https://github.com/oekit/pkg) · [concurrency](https://github.com/oekit/concurrency) · [core](https://github.com/oekit/core) · [kitx](https://github.com/oekit/kitx) | 微工具集 20 合 1、并发原语 + 三态熔断、config/transport/chain/lifecycle 基建、标识与校验 |

> [!TIP] 提示
> > **提示**：版本一律 `@latest`。每仓独立 SemVer，升级互不牵连。
