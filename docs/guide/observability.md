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

### OTLP/HTTP 后端（Langfuse / SaaS 类，v0.3.0 起）

`Config.Protocol` 选导出协议（`grpc` 缺省 / `http`），`Config.Headers` 带认证头。
**两种协议下 `Init` 的全局副作用完全一致**——TracerProvider + MeterProvider
（含 Go runtime 指标）+ 传播器 + 关闭被替换的旧 provider，差别只在传输层。

```go
provider, err := tracing.Init(tracing.Config{
    ServiceName: "my-service",
    Endpoint:    "https://cloud.example.com/api/public/otel/v1/traces",
    Protocol:    tracing.ProtocolHTTP,
    Headers:     map[string]string{"Authorization": "Bearer " + token},
})
```

`Endpoint` 在 http 协议下接受三种写法：

| 写法 | 示例 | traces / metrics 实际路径 |
|---|---|---|
| 完整 signal URL | `https://host/api/otel/v1/traces` | `/api/otel/v1/traces` 与 `/api/otel/v1/metrics`（同前缀换名） |
| 基址 | `https://host`、`https://host/api/otel` | 基址 + `/v1/traces` 与 `/v1/metrics` |
| 无 scheme 的 host:port | `otel-collector:4318` | 同上，scheme 由 `Insecure` 决定 |

端点里**不嵌凭据**（`https://user:pass@host` 直接报错）——凭据走 `Headers`，URL
里的凭据会进访问日志与代理日志。

> [!IMPORTANT] 为什么这件事值得单独一节
> > 此前 OTLP/HTTP 只能绕开 `tracing.Init` 自写一整套装配，漏掉传播器 / 指标 /
> > 旧 provider 关闭时全是**静默**缺口：出站请求不带 `traceparent`（跨服务
> > 链路断但不报错）、进程无 Go runtime 指标、重复 `Init` 时旧 provider 不被
> > 关闭。换协议应该是换一条传输，不是换一整套可观测性语义。

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
