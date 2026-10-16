---
title: RPC 服务指南（Kitex）
---

kitex + 治理热更 + BizError 桥接 + nns-endpoint 熔断重试：CloudWeGo Kitex 的生产化拼图。

## 依赖

```bash
go get github.com/oekit/kitex github.com/oekit/logx github.com/oekit/nns github.com/oekit/nns-endpoint github.com/oekit/bootstrap
```

## 1. 日志桥接（klog → logx）

```go
import (
    "github.com/cloudwego/kitex/pkg/klog"
    logxkitexlog "github.com/oekit/logx/kitexlog"
)

klog.SetLogger(logxkitexlog.NewLogger(logx.NewSlogLogger("my-rpc")))
```

> kitex 仓的 `kitex.NewLogger` 是同实现的 Deprecated 别名，新代码请直接用 `logx/kitexlog`。

## 2. Server 端

```go
svr := echo.NewServer(handler,
    server.WithSuite(ekitkitex.NewServerTracingSuite()),  // OTel
    server.WithMiddleware(ekitkitex.NewPanicLogMiddleware()), // panic 结构化日志，原样透传
)
ekitkitex.RunServer(app, "echo-service", svr) // bootstrap 生命周期 + netpoll 监听失败自恢复
// kitex 内部 goroutine panic 兜底：
ekitkitex.SetDefaultPanicHandler()
```

## 3. Client 端：治理配置热更新

```go
gov, _ := ekitkitex.NewGovernanceConfig(configCli,
    ekitkitex.WithGovernanceTemplate("my-service.governance")) // Nacos dataId
suite := ekitkitex.NewClientSuite("client-svc", "server-svc", gov,
    ekitkitex.WithRetry(), ekitkitex.WithRPCTimeout(), ekitkitex.WithCircuitBreaker())
cli, _ := echo.NewClient("server-svc", client.WithSuite(suite), ekitkitex.WithBizErrorBridge())
```

> [!WARNING] 注意
> > **三条纪律**：① 治理策略是**全量同步**——配置里删除的 method 回退 Kitex 默认值； ② 不要混用代码级 `client.WithFailureRetry`，混用会使容器忽略全部远端配置； ③ `timeout_ms` 必须 >0（0 走无超时 fast path，清超时用删除配置段表达）。

## 4. 业务异常透传

```text
// WithBizErrorBridge：对端 BizStatusError 自动转本地 BizError 上抛，handler 层 mw.Fail 无感处理
// timeout→50400/504 · no-instance→50300/503 · ACL→40301/403 · Thrift 8 类→50000/500
```

## 5. 元信息透传（trace_id + 业务 kv）

```go
// client middleware：ekit trace_id + user_id/space_code 等全链路透传（走 TTHeader）
cli, _ := echo.NewClient("server-svc",
    kitexmeta.PropagateClientOption(extractors...),
    client.WithSuite(suite))
```

## 6. 出站 HTTP：nns-endpoint 熔断 + 换实例重试

RPC 服务也常要调 HTTP 依赖。nns-endpoint 提供端点级熔断（per-service，4xx 不计失败）与失败换实例重试：

```go
import endpoint "github.com/oekit/nns-endpoint"

factory := endpoint.NewHTTPEndpointFactory(nnsc.ServiceClient())
ep, err := factory.MakeEndpoint("payment-svc")
// ep 背后：服务发现 + per-service 熔断 + 5xx/网络错误换实例重试 + 弹性指标
```

## 7. 治理配置模板

```json
{
  "retry":         { "max_attempts": 3, "backoff_ms": 50, "max_backoff_ms": 1000, "jitter_ms": 20 },
  "timeout_ms":    { "*": 500, "echo-service/Echo": 200 },
  "circuit_breaker": { "error_rate_threshold": 30, "min_requests": 100, "open_ms": 10000 },
  "limiter":       { "rate": 1000, "burst": 2000 }
}
```

key 匹配：精确 → 前缀 → 全局 `""`。非法值 fail-closed；kitex 侧 key 自动翻译
（`svc:Method`/`svc`/`""` → 裸方法名/通配）。hertz 侧动态限流/超时见
[oekit/middleware](https://github.com/oekit/middleware) 的 governance 目录。

## 8. 更多弹性原语（按需引入）

- **分布式限流**：`github.com/oekit/redisx` 的 `ratelimit` 子包——Redis Lua 固定窗口/令牌桶（三态返回），故障自动降级本地令牌桶并探活回切
- **自适应熔断 / CPU 自适应降载 / 滑动窗口**：`github.com/oekit/concurrency` 的 `breaker` / `shedding` / `window` 子包（规范哨兵 `ErrCircuitOpen`）
- HTTP 服务端过载保护：`oekit/middleware` 的 `SheddingMiddleware`（opt-in）
