---
title: HTTP 服务指南
---

config + gorm + crud + middleware + hertz + nns + bootstrap：从零组一个生产级 HTTP 服务。

## 依赖

```bash
go get github.com/oekit/pkg github.com/oekit/logx github.com/oekit/registry \
  github.com/oekit/gorm github.com/oekit/middleware github.com/oekit/hertz github.com/oekit/bootstrap
```

## 1. 配置加载

```go
import "github.com/oekit/registry/config"

func init() { config.LoadDotEnv(".env") }          // 可选：本地 .env
cfg, err := config.LoadBootstrap[MyConfig]("dev")   // 自动选 etc/config-dev.yaml
token := config.Get("API_TOKEN")                    // 环境变量优先
d := config.ParseDuration(cfg.WorkerInterval, time.Second)
```

## 2. 存储层：gormx + crud

```go
import (
    "github.com/oekit/gorm/crud"
    "github.com/oekit/gorm/crud/gormrepo"
    "github.com/oekit/gorm/gormx"
)

db, err := gormx.Open(dialector, gormx.WithConnectionPool(10, 100, time.Hour))
repo := gormrepo.NewGormRepository[Project](db)
svc := crud.NewBaseService[Project, CreateProjectReq, UpdateProjectReq](repo)
```

> [!TIP] 提示
> > **并发语义**：repo 实现 `TxRepository` 时（GormRepository 已实现）， Update 自动走「事务 + FOR UPDATE 行锁读」消除丢更新；afterUpdate 钩子失败整体回滚。

## 3. HTTP 层：crudh + middleware 栈

```go
import (
    hertzserver "github.com/cloudwego/hertz/pkg/app/server"
    "github.com/oekit/hertz/handler/crudh"
    mw "github.com/oekit/middleware/middleware"
)

h := hertzserver.New(hertzserver.WithHostPorts(":8080"))
// 标准栈：Prometheus → TraceID → Recovery → Response → AccessLog
// v0.28.1 起 Recovery 入栈——引擎无默认 PanicHandler，裸奔会直接断连
for _, m := range mw.DefaultMiddleware(mw.StackConfig{ServiceName: "order-service"}) {
    h.Use(m)
}
crudh.NewHandler(svc).RegisterRoutes(h.Group("/api/v1"), "/projects")
```

常用中间件（同在 oekit/middleware）：

```text
h.Use(mw.RateLimitMiddleware(mw.WithRateLimit(100, 200)))
h.Use(mw.BearerTokenAuth(mw.WithBearerToken(token), mw.WithAuthSkipPaths("/healthz")))
// contrib 桥接：JWT/Sessions/Swagger/CSRF/pprof/Debug/Gzip/ETag/Lark… 见仓库 contrib/ 目录
```

## 4. 服务注册：nns 一行接入

```go
import (
    "github.com/oekit/nns"
    nacospkg "github.com/oekit/registry/nacos"
    "github.com/oekit/registry/registry"
)

nnsc := nns.New(nacospkg.Bootstrap{ServiceName: "order-service"},
    nns.WithStaticInstance("dep-svc", []registry.Instance{{IP: "10.0.0.1", Port: 9000}}))
_ = nnsc.Init(ctx, "order-service", []string{"dep-svc"})
// mock/本地开发：nns.WithMockMode(true) 全链路无 Nacos 依赖
```

## 5. 生命周期：bootstrap 骨架

```go
import (
    ekithertz "github.com/oekit/hertz/hertz"
    "github.com/oekit/bootstrap/bootstrap"
    bootstrapnacos "github.com/oekit/bootstrap/nacos"
)

b, _ := bootstrap.New(
    bootstrap.WithServiceName("order-service"),
    bootstrapnacos.WithNNS(cfg.Nacos, cfg.Port, cfg.DepServices), // 注册发现（按需注入）
)
_ = b.Run(func(app *bootstrap.App) error {
    h := hertzserver.New(...)
    ekithertz.RunServer(app, "order-service", h)   // 注册进生命周期，优雅关闭
    ekithertz.AddShutdownHook(h, func(ctx context.Context) error {
        return flushLastBatch(ctx)                 // 关停前刷数据
    })
    nnsc.RunWithLifecycle(app, "order-service", 8080,
        registry.WithWeight(99), registry.WithMetadata(map[string]string{"region": "cn-east"}))
     [!WARNING] 注意
> > **时间关系**（K8s 必须满足）： client 发现延迟 < preStop 宽限 < server 最大延迟 < `ExitWaitTime`（默认 5s，`server.WithExitWaitTime` 调整）< `terminationGracePeriodSeconds`。有长耗时请求时调大 ExitWaitTime。

## 6. 健康检查 / 指标 / SSE

```go
// K8s liveness/readiness：多 check 并发、总超时、panic 隔离
healthz.RegisterHealthRoutes(h, healthz.WithHealthCheck("db", pingDB))
// Prometheus（oekit/metrics）
h.GET("/metrics", hertzmetrics.MetricsHandler())
// SSE 流式推送（基于 Hertz 官方 protocol/sse）
h.GET("/stream", func(ctx context.Context, c *app.RequestContext) {
    s := ekitsse.NewStream(c)
    defer s.Close()
    _ = s.Send("progress", map[string]any{"percent": 50})
})
```
