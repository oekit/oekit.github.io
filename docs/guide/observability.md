---
title: 可观测性指南
---

metrics + tracing + traceid 三件套，Hertz/Kitex 双侧 instrumentation。

## Prometheus 指标（oekit/metrics）

```go
import (
    "github.com/oekit/metrics"
    hertzmetrics "github.com/oekit/hertz/metrics"
)

metrics.Init("my-service")
h.GET("/metrics", hertzmetrics.MetricsHandler())
// 或一步到位：
hertzmetrics.InitAndRegister("my-service", h)
```

弹性指标族（`metrics/resilience`）覆盖 httpx / nns-endpoint / kitex 三路的
熔断状态/迁移/拒绝与重试计数，labels 统一带 `service` 与 `kind`。

## OpenTelemetry 追踪（oekit/tracing）

```go
provider, err := tracing.Init(tracing.Config{
    ServiceName: "my-service",
    Endpoint:    "otel-collector:4317",  // 为空 = 仅本地 provider，零网络
    Insecure:    true,
})
defer provider.Shutdown(context.Background())
```

## 框架挂载（二选一，勿叠加）

| 框架 | OTel（新生态） | OpenTracing（旧生态） |
|---|---|---|
| Hertz | oekit/hertz → hertzotel.NewServerTracing() | oekit/hertz → hertztracer |
| Kitex | oekit/kitex → NewServerTracingSuite() | hertz-contrib/tracer 自行桥接 |

> [!WARNING] 注意
> > **二选一**：同一服务叠用 OTel 与 OpenTracing 会 double-instrument（每请求两条 span）。

## trace_id：全链路串起来的那根线

```go
// HTTP 入口注入（middleware 栈已内置 TraceID）
h.Use(traceid.Middleware()...)
// 任意层提取
id := traceid.FromContext(ctx)
// 跨 RPC 传播：Kitex 走 kitexmeta（TTHeader），HTTP 出站走 httpx WithTracePropagation
```

logx 的 `Ctx*` 方法自动读取 ctx 里的 trace_id 输出 `[trace=xxx]`；
裸 slog 项目用 `logx.TraceHandler(handler)` 给任意 slog.Handler 自动注入 trace_id
（详见[日志指南](/guide/logging.html)）；
响应体 `ResponseMiddleware` 也会回填 `trace_id` 字段，用户报障直接可查。

## 弹性指标怎么用

```bash
# 熔断状态 / 迁移 / 拒绝 / 重试——httpx、nns-endpoint、kitex 三路同款
http_client_breaker_state{service="payment",kind="httpx"} 1
http_client_retry_attempts_total{service="payment",kind="httpx"} 42
```
