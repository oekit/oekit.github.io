---
title: 快速开始
---

三种起步姿势：单个微库、可观测门面组合、HTTP/RPC 全栈骨架。

> [!IMPORTANT] Go 版本前置
> 各模块的最低 Go 版本由**它自己的 `go.mod`** 决定（唯一权威）：
> 轻量模块（pkg / logx / core / concurrency / registry / timertask / workflow 等）要求 **Go ≥ 1.24**；
> 框架生态那几个（hertz / kitex / httpx / middleware / tracing / k8s / etcdx / network / nns-endpoint）
> 要求 **Go ≥ 1.26**。
> 「一次拉齐」的伞仓快照（`go get github.com/oekit/oekit@latest`）统一要求 **Go ≥ 1.26.0**，
> 并会把下游 go.mod 的 `go` 指令抬到 1.26.0（实测 `go: upgraded go 1.24 => 1.26.0`）——
> 只按需取单个模块则不受影响。

## 三种起步姿势

### 姿势一：只要一个微库

oekit 的 23 个基础工具包合在 [oekit/pkg](https://github.com/oekit/pkg) 一个 module 里（零第三方依赖，仅标准库），Go 按包编译，import 哪个用哪个：

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
| 通信 · 服务治理 | [httpx](https://github.com/oekit/httpx) · [nns-endpoint](https://github.com/oekit/nns-endpoint) · [network](https://github.com/oekit/network) · [nns](https://github.com/oekit/nns) · [registry](https://github.com/oekit/registry) | HTTP 客户端（Selector 负载均衡含 p2c + codec 注册制 + 熔断重试 + net/http RoundTripper 桥接）、端点熔断、WS/NATS、服务治理、注册发现 + Nacos |
| 数据访问 | [gormx](https://github.com/oekit/gormx) · [redisx](https://github.com/oekit/redisx) · [etcdx](https://github.com/oekit/etcdx) · [data](https://github.com/oekit/data) · [timertask](https://github.com/oekit/timertask) | SQL/CRUD、Redis（锁续期/信号量/限流）、etcd（客户端/注册发现/分布式锁）、缓存编排 + 两级缓存、定时任务（可选可靠投递） |
| 可观测性 | [logx](https://github.com/oekit/logx) · [tracing](https://github.com/oekit/tracing) · [metrics](https://github.com/oekit/metrics) | 日志门面（脱敏/slog 双向桥）、OTel、Prometheus |
| 基础库 | [pkg](https://github.com/oekit/pkg) · [concurrency](https://github.com/oekit/concurrency) · [core](https://github.com/oekit/core) · [kitx](https://github.com/oekit/kitx) | 微工具集（按需 import）、并发原语 + 三态熔断、config/transport/chain/lifecycle 基建、标识与校验 + 非密码学哈希 |

> [!TIP] 提示
> > **提示**：版本一律 `@latest`。每仓独立 SemVer，升级互不牵连。

<!-- deps-table:start -->
## 装它要拖多少东西（消费方实测）

「按需取用」的另一面是**代价**：装一个模块会连带拉进多少东西。
下表是**实测值**——在空消费方模块里 `go get github.com/oekit/<单元>@latest`
之后数 `go list -m all` 得到的模块图（不含消费方自身）。
不是任何仓 `go.mod` 的声明，声明不算证据。

量级分档：零第三方 / 轻（≤5）/ 中（≤20）/ 重（>20）。
机器可读版：[deps.json](https://oekit.github.io/deps.json)。

由 `matrix-tools/scripts/consumer_probe.py` 测量、`gen_deps_doc.py` 生成，
随矩阵周巡检刷新。

| 模块 | 装它会拉进 | 其中第三方 | 量级 |
|---|---|---|---|
| [`logx`](https://github.com/oekit/logx) | 2 | 0 | 零第三方 |
| [`oekit`](https://github.com/oekit/oekit) | 34 | 0 | 零第三方 |
| [`pkg`](https://github.com/oekit/pkg) | 1 | 0 | 零第三方 |
| [`timertask`](https://github.com/oekit/timertask) | 2 | 0 | 零第三方 |
| [`concurrency`](https://github.com/oekit/concurrency) | 3 | 1 | 轻 |
| [`logx/sink`](https://github.com/oekit/logx/sink) | 2 | 1 | 轻 |
| [`workflow`](https://github.com/oekit/workflow) | 6 | 1 | 轻 |
| [`core`](https://github.com/oekit/core) | 3 | 2 | 轻 |
| [`registry`](https://github.com/oekit/registry) | 4 | 2 | 轻 |
| [`bootstrap`](https://github.com/oekit/bootstrap) | 8 | 3 | 轻 |
| [`kitx`](https://github.com/oekit/kitx) | 10 | 8 | 中 |
| [`network`](https://github.com/oekit/network) | 16 | 12 | 中 |
| [`gormx`](https://github.com/oekit/gormx) | 17 | 13 | 中 |
| [`redisx`](https://github.com/oekit/redisx) | 17 | 13 | 中 |
| [`timertask/redis`](https://github.com/oekit/timertask/redis) | 19 | 13 | 中 |
| [`data`](https://github.com/oekit/data) | 22 | 15 | 中 |
| [`logx/hlog`](https://github.com/oekit/logx/hlog) | 25 | 22 | 重 |
| [`metrics`](https://github.com/oekit/metrics) | 41 | 39 | 重 |
| [`logx/kitexlog`](https://github.com/oekit/logx/kitexlog) | 45 | 42 | 重 |
| [`logx/hertzlog`](https://github.com/oekit/logx/hertzlog) | 45 | 44 | 重 |
| [`k8s`](https://github.com/oekit/k8s) | 80 | 77 | 重 |
| [`etcdx`](https://github.com/oekit/etcdx) | 102 | 97 | 重 |
| [`hertz`](https://github.com/oekit/hertz) | 113 | 99 | 重 |
| [`httpx`](https://github.com/oekit/httpx) | 111 | 103 | 重 |
| [`kitex-examples`](https://github.com/oekit/kitex-examples) | 120 | 104 | 重 |
| [`tracing`](https://github.com/oekit/tracing) | 109 | 107 | 重 |
| [`bootstrap/obs`](https://github.com/oekit/bootstrap/obs) | 134 | 126 | 重 |
| [`bootstrap/nacos`](https://github.com/oekit/bootstrap/nacos) | 136 | 128 | 重 |
| [`nns`](https://github.com/oekit/nns) | 136 | 128 | 重 |
| [`nns-endpoint`](https://github.com/oekit/nns-endpoint) | 138 | 128 | 重 |
| [`registry/nacos`](https://github.com/oekit/registry/nacos) | 158 | 155 | 重 |
| [`registry/nacosimpl`](https://github.com/oekit/registry/nacosimpl) | 159 | 155 | 重 |
| [`middleware`](https://github.com/oekit/middleware) | 187 | 179 | 重 |
| [`kitex`](https://github.com/oekit/kitex) | 310 | 300 | 重 |
<!-- deps-table:end -->
