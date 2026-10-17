---
title: SERVICE_TEMPLATE
---

> **oekit 适配说明**：本文写于 ekit 单体时期（v0.34.0，冻结维护）。包分层概念在 oekit 矩阵中一一对应（微库已合并为 oekit/pkg）。

# ekit 服务接入模板

本文档提供新服务接入 ekit 的标准模板，确保日志、指标、追踪按统一契约关联。

## Hertz HTTP 服务模板

```go
package main

import (
	"context"

	"github.com/oekit/bootstrap/bootstrap"
	bootstrapobs "github.com/oekit/bootstrap/obs"
	ekithertz "github.com/oekit/hertz/hertz"
	health "github.com/oekit/hertz/hertz/health"
	hertzmetrics "github.com/oekit/hertz/hertz/metrics"
	mw "github.com/oekit/middleware"
	"github.com/oekit/logx"
	"github.com/oekit/tracing"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/hlog"
)

func main() {
	// 1. 日志桥接：Hertz 框架日志 → logx（自动携带 trace_id）
	hlog.SetLogger(ekithertz.NewLogger(logx.WithService("my-http")))

	// 2. 启动编排
	b, err := bootstrap.New(
		bootstrap.WithServiceName("my-http"),
		bootstrapobs.WithTracing(tracing.Config{
			Endpoint: "otel-collector:4317",
			Insecure: true,
		}),
	)
	if err != nil {
		return err
	}
	_ = b.Run(func(app *bootstrap.App) error {
		tracing := ekithertz.NewServerTracing()
		h := server.New(server.WithHostPorts(":8080"), tracing.Option)

		// 3. 标准中间件栈（Prometheus 采集 → TraceID → Response → AccessLog）
		h.Use(tracing.Middleware)
		h.Use(mw.DefaultMiddleware(mw.StackConfig{
			ServiceName: "my-http",
		})...)

		// 4. Prometheus 指标 + 健康检查
		hertzmetrics.InitAndRegister("my-http", h) // metrics.Init + 暴露 /metrics
		health.RegisterHealthRoutes(h)             // /ping, /health, /buildVersion

		// 5. 业务路由
		h.GET("/ping", func(ctx context.Context, c *app.RequestContext) {
			mw.SuccessResp(c, "pong")
		})

		// 6. 生命周期管理
		ekithertz.RunServer(app, "hertz", h)
		<-app.Context().Done() // 阻塞直到收到 SIGINT/SIGTERM（userFn 返回 = 主动关机）
		return nil
	}); err != nil {
		logx.WithService("main").Error("server exited with error", "err", err)
	}
}
```

## Kitex RPC 服务模板

```go
package main

import (
	"github.com/oekit/bootstrap/bootstrap"
	bootstrapobs "github.com/oekit/bootstrap/obs"
	ekithertz "github.com/oekit/hertz/hertz"
	health "github.com/oekit/hertz/hertz/health"
	hertzmetrics "github.com/oekit/hertz/hertz/metrics"
	kitexgo "github.com/oekit/kitex"
	"github.com/oekit/logx"
	"github.com/oekit/tracing"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/kitex/pkg/klog"
	"github.com/cloudwego/kitex/server"
)

func main() {
	// 1. 日志桥接：Kitex 框架日志 → logx（自动携带 trace_id）
	klog.SetLogger(kitexgo.NewLogger(logx.WithService("my-rpc")))

	// 2. 启动编排
	b, err := bootstrap.New(
		bootstrap.WithServiceName("my-rpc"),
		bootstrapobs.WithTracing(tracing.Config{
			Endpoint: "otel-collector:4317",
			Insecure: true,
		}),
	)
	if err != nil {
		return err
	}
	_ = b.Run(func(app *bootstrap.App) error {
		svr := echo.NewServer(new(Impl),
			server.WithSuite(kitexgo.NewServerTracingSuite()),
		)

		// 3. 运维端口：Kitex 自身无 HTTP 端点，用独立 Hertz 暴露 /metrics 与健康检查
		opsH := server.New(server.WithHostPorts(":9091"))
		hertzmetrics.InitAndRegister("my-rpc", opsH)
		health.RegisterHealthRoutes(opsH)
		ekithertz.RunServer(app, "ops-metrics", opsH)

		// 4. 生命周期管理
		kitexgo.RunServer(app, "kitex-echo", svr)
		<-app.Context().Done() // 阻塞直到收到 SIGINT/SIGTERM（userFn 返回 = 主动关机）
		return nil
	}); err != nil {
		logx.WithService("main").Error("server exited with error", "err", err)
	}
}
```

## 组件化启动模板（推荐新服务使用）

```go
package main

import (
	"github.com/oekit/bootstrap/bootstrap"
	bootstrapobs "github.com/oekit/bootstrap/obs"
	ekithertz "github.com/oekit/hertz/hertz"
	health "github.com/oekit/hertz/hertz/health"
	hertzmetrics "github.com/oekit/hertz/hertz/metrics"
	mw "github.com/oekit/middleware"
	"github.com/oekit/logx"
	"github.com/oekit/tracing"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/hlog"
)

func main() {
	hlog.SetLogger(ekithertz.NewLogger(logx.WithService("my-svc")))

	b, err := bootstrap.New(
		bootstrap.WithServiceName("my-svc"),
		bootstrap.WithMetrics(), // metrics.Init（/metrics 端点见下方 MetricsHandler）
		bootstrap.WithTracing(tracing.Config{
			Endpoint: "otel-collector:4317",
			Insecure: true,
		}),
		// bootstrap.WithNNS(nacosCfg, 8080, []string{"dep-service"}),
	)
	if err != nil {
		logx.WithService("main").Error("bootstrap init failed", "err", err)
		return
	}

	b.Run(func(app *bootstrap.App) error {
		tracing := ekithertz.NewServerTracing()
h := server.New(server.WithHostPorts(":8080"), tracing.Option)
		h.Use(tracing.Middleware)
		h.Use(mw.DefaultMiddleware(mw.StackConfig{
			ServiceName: "my-svc",
		})...)

		// WithMetrics 组件已执行 metrics.Init（sync.Once 幂等），这里只需暴露 /metrics
		h.GET("/metrics", hertzmetrics.MetricsHandler())
		health.RegisterHealthRoutes(h)

		ekithertz.RunServer(app, "hertz", h)
		<-app.Context().Done() // 阻塞直到收到 SIGINT/SIGTERM（userFn 返回 = 主动关机）
		return nil
	})
}
```

## 接入检查清单

- [ ] 日志桥接：`hlog.SetLogger` / `klog.SetLogger` 已配置
- [ ] OTel 追踪：`tracing.Init` 已配置；**核心组件零注入，装饰器显式接入**——GORM 用 `db.Use(gormotel.NewPlugin())`、Redis 用 `redisotel.InstrumentTracing(c.Client())`（无 SDK 时 noop）
- [ ] 中间件栈：`DefaultMiddleware` 已注册（TraceID + Recovery + Response + AccessLog，零指标强制）；需要 HTTP 指标时 `h.Use(pm.Middleware())` 显式拼最前
- [ ] 指标暴露：`hertzmetrics.InitAndRegister` 或 `h.GET("/metrics", hertzmetrics.MetricsHandler())` 已配置（注册表与 `PrometheusConfig.Registry` 缺省一致，均为 `metrics.Registry`）
- [ ] 服务注册：`RunServer` 已调用（自动注册 shutdown 钩子）；userFn 内 `<-app.Context().Done()` 阻塞等信号
- [ ] 健康检查：`health.RegisterHealthRoutes(h)` 已注册（包 `github.com/oekit/hertz/hertz/health`；/ping, /health, /buildVersion）
- [ ] 错误处理：业务错误使用 `mw.Fail(ctx, c, err)` 而非手动构造响应
- [ ] 分页参数：使用 `validatorh.BindPage(c)` 或 `validatorh.BindPageWithDefault(c, 1, 20)`
