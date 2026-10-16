---
title: 快速开始
---

三种起步姿势：单个微库、可观测门面组合、HTTP/RPC 全栈骨架。

## 三种起步姿势

### 姿势一：只要一个微库

oekit 的 16 个基础工具包合在 [oekit/pkg](https://github.com/oekit/pkg) 一个 module 里，Go 按包编译，import 哪个用哪个：

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
| 应用引导 · 框架生态 | [bootstrap](https://github.com/oekit/bootstrap) · [hertz](https://github.com/oekit/hertz) · [kitex](https://github.com/oekit/kitex) · [middleware](https://github.com/oekit/middleware) · [handler](https://github.com/oekit/handler) · [workflow](https://github.com/oekit/workflow) · [istio](https://github.com/oekit/istio) · [kitex-examples](https://github.com/oekit/kitex-examples) | 组合根、Hertz/Kitex 运行时、中间件栈、CRUD handler、流程编排、xDS 熔断 |
| 通信 · 服务治理 | [httpx](https://github.com/oekit/httpx) · [nns-endpoint](https://github.com/oekit/nns-endpoint) · [network](https://github.com/oekit/network) · [nns](https://github.com/oekit/nns) · [registry](https://github.com/oekit/registry) | HTTP 客户端、端点熔断、WS/NATS、服务治理、注册发现 + Nacos |
| 数据访问 | [gormx](https://github.com/oekit/gormx) · [redis](https://github.com/oekit/redisx) · [data](https://github.com/oekit/data) · [timertask](https://github.com/oekit/timertask) | SQL/CRUD、Redis、缓存、定时任务 |
| 可观测性 | [logx](https://github.com/oekit/logx) · [tracing](https://github.com/oekit/tracing) · [metrics](https://github.com/oekit/metrics) | 日志门面、OTel、Prometheus |
| 基础库 | [pkg](https://github.com/oekit/pkg) · [concurrency](https://github.com/oekit/concurrency) · [core](https://github.com/oekit/core) | 微工具集 20 合 1、并发原语、治理 schema |

> [!TIP] 提示
> > **提示**：版本一律 `@latest`。每仓独立 SemVer，升级互不牵连。
