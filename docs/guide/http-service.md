---
title: HTTP 服务指南
---

config + gorm + crud + middleware + hertz + nns + bootstrap：从零组一个生产级 HTTP 服务。

## 依赖

```bash
go get github.com/oekit/core github.com/oekit/logx github.com/oekit/registry \
  github.com/oekit/gormx github.com/oekit/middleware github.com/oekit/hertz github.com/oekit/bootstrap
```

## 1. 配置加载

```go
import "github.com/oekit/core/config"

func init() { config.LoadDotEnv(".env") }          // 可选：本地 .env
cfg, err := config.LoadBootstrap[MyConfig]("dev")   // 自动选 etc/config-dev.yaml
_ = config.ApplyEnvOverlay(&cfg)                    // env 优先于配置文件（12-factor，core v0.8.0 起）
token := config.Get("API_TOKEN")                    // 环境变量优先
d := config.ParseDuration(cfg.WorkerInterval, time.Second)
```

> 配置加载已自 `registry/config` 迁至 `core/config`（2026-10-16，core v0.4.0）；
> Nacos 远端配置源适配器仍在 `registry/nacos.NewConfigSource`。
> 多源叠加热更（如「yaml 基线 + Nacos 覆盖」）用 `config.NewOverlaySource(base, override...)`
> 配合 `ConfigWatcher[T]`；`default/env/range/options` struct tag 校验开箱即用。

## 2. 存储层：gormx + crud

```go
import (
    "github.com/oekit/gormx"
    "github.com/oekit/gormx/crud"
    "github.com/oekit/gormx/crud/gormrepo"
)

db, err := gormx.Open(dialector, gormx.WithConnectionPool(10, 100, time.Hour))
// 第二个类型参数 ID 为实体主键类型（gormx v0.6.0 起）：int64 自增 / string 文本主键 / UUID 均可
repo := gormrepo.NewGormRepository[Project, int64](db)
svc := crud.NewBaseService[Project, int64, CreateProjectReq, UpdateProjectReq](repo)
```

> [!TIP] 提示
> > **并发语义**：repo 实现 `TxRepository` 时（GormRepository 已实现），Update 自动走「事务 + FOR UPDATE 行锁读」消除丢更新；afterUpdate 钩子失败整体回滚。
> > 想给 CRUD 叠加缓存读写编排（写后失效/事务提交后失效），在 repo 外包一层 `data/cached`——见《[缓存指南](/guide/caching.html)》。

## 3. HTTP 层：crudh + middleware 栈

```go
import (
    hertzserver "github.com/cloudwego/hertz/pkg/app/server"
    "github.com/oekit/hertz/crudh"
    mw "github.com/oekit/middleware"
)

h := hertzserver.New(hertzserver.WithHostPorts(":8080"))
// 标准栈：TraceID → Recovery → Response → AccessLog（零指标强制）
// Recovery 入栈——引擎无默认 PanicHandler，裸奔会直接断连
for _, m := range mw.DefaultMiddleware(mw.StackConfig{SkipPaths: []string{"/healthz"}}) {
    h.Use(m)
}
// 需要 HTTP 指标时显式拼在栈最前（middleware v0.2.0 起 Prometheus 从默认栈拆出）
pm := mw.NewPrometheusMetrics(mw.PrometheusConfig{ServiceName: "order-service"})
h.Use(pm.Middleware())
crudh.NewHandler(svc).RegisterRoutes(h.Group("/api/v1"), "/projects")
```

常用中间件（同在 oekit/middleware）：

```go
h.Use(mw.RateLimitMiddleware(mw.WithRateLimit(100, 200)))
h.Use(mw.BearerTokenAuth(mw.WithBearerToken(token), mw.WithAuthSkipPaths("/healthz")))
// contrib 桥接：JWT/Sessions/Swagger/CSRF/pprof/Debug/Gzip/ETag/Lark… 见仓库 contrib/ 目录
```

> **跨协议复用**：同一套 Recovery/AccessLog/元数据透传逻辑有 transport 无关版本
> `mw/chainmw`（基于 `core/chain` + `core/transport`）——Hertz 服务可直接用根包栈，
> Kitex 服务经 `kitex/chainmw.ToKitex` 复用同一实现（panic 上报钩子已做隔离，
> 监控 SDK panic 不影响业务）。凭证路径脱敏：`mw.WithAccessLogRedactPathPrefixes`。

### 适用边界：响应体自管的服务（middleware v0.11.0+）

标准栈面向**响应契约统一、由中间件包装**的服务（handler 用 `SuccessResp`/`ErrorResp`
或返回裸 JSON，`ResponseMiddleware` 统一成 `{code, data, message, trace_id}`）。如果
响应由各 handler 自己构造（与既有 API 对齐、自定义字段名、null 字段整个不出现等），
不要让中间件接管响应——两条路：

```go
// 一键：TraceID → Recovery → AccessLog，响应构造权完全留在 handler
h.Use(mw.DefaultMiddleware(mw.StackConfig{DisableResponseWrap: true})...)

// 手拼：最小安全栈 + 按需挂访问日志
h.Use(mw.MinimalMiddleware()...)
h.Use(mw.AccessLogMiddleware())
```

访问日志要落到自家 `access_log` 表用 `WithAccessLogSink`——同一份记录（与日志同源、
Path 已脱敏）旁路交给你的 DAO，`c` 可读鉴权中间件注入的 userId；sink 出错或 panic
只记 Warn、不影响响应；`SkipPaths` 命中不触发。中间件也可按路由组装配（Hertz
`Use`/`Group` 接受变参，栈切片直接 `...` 展开，组内再叠自家 JWT/ApiKey）：

```go
h.Use(mw.DefaultMiddleware(mw.StackConfig{
    DisableResponseWrap: true,
    SkipPaths:           []string{"/healthz", "/metrics"},
    AccessLogOptions: []mw.AccessLogOption{mw.WithAccessLogSink(
        func(ctx context.Context, c *app.RequestContext, rec mw.AccessRecord) error {
            uid, _ := c.Get("userId")
            return accessLogDAO.Save(ctx, uid, rec) // 落库失败不拖垮请求
        })},
})...)
api := h.Group("/api", mw.DefaultMiddleware(cfg)...)
user := api.Group("/user", auth.Required(svc))
```

无论哪种形态 **Recovery 都是硬性要求**（Hertz 无默认 PanicHandler，缺失则 panic 直接
断连）；`mw.RecoveryMiddleware(mw.WithRecoveryErrorHandler(...))` 可换成自己的 500 响应体。

## 4. 服务注册：nns 一行接入

```go
import (
    "github.com/oekit/nns"
    nacospkg "github.com/oekit/registry/nacos"
    "github.com/oekit/registry"
)

nnsc := nns.New(nacospkg.Bootstrap{ServiceName: "order-service"},
    nns.WithStaticInstance("dep-svc", []registry.Instance{{IP: "10.0.0.1", Port: 9000}}))
_ = nnsc.Init(ctx, "order-service", []string{"dep-svc"})
// mock/本地开发：nns.WithMockMode(true) 全链路无 Nacos 依赖
```

## 5. 生命周期：bootstrap + 就绪门

```go
import (
    "github.com/oekit/bootstrap"
    bootstrapnacos "github.com/oekit/bootstrap/nacos"
    "github.com/oekit/hertz"
)

b, _ := bootstrap.New(
    bootstrap.WithServiceName("order-service"),
    bootstrapnacos.WithNNS(cfg.Nacos, cfg.Port, cfg.DepServices), // 注册发现（按需注入）
)
_ = b.Run(func(app *bootstrap.App) error {
    h := hertzserver.New(...)
    hertz.RunServer(app, "order-service", h,
        hertz.WithOnReady(func(ctx context.Context) { app.Ready() })) // 就绪门
    hertz.AddShutdownHook(h, func(ctx context.Context) error {
        return flushLastBatch(ctx)                 // 关停前刷数据
    })
    nnsc.RunWithLifecycle(app, "order-service", 8080,
        registry.WithWeight(99), registry.WithMetadata(map[string]string{"region": "cn-east"}))
    <-app.Context().Done() // 阻塞直到收到 SIGINT/SIGTERM；userFn 返回 = 主动关机
    return nil
})
```

> [!WARNING] 就绪门契约
> > **bootstrap/nacos v0.3.0 起，NNS 注册延迟到 `app.Ready()` 之后**（修复「注册先于
> > server 监听、反注册后于 server 关闭」双序错误）：`hertz.WithOnReady` 在全部
> > HostPort TCP 探活可建连后才回调（默认超时 5s，`hertz.WithReadyProbeTimeout` 调整；
> > 探活超时按启动失败触发优雅关机）。**userFn 里必须触发 `app.Ready()`**（推荐就用
> > `WithOnReady`），否则服务永远不会进入注册中心。关停序由生命周期保证：
> > nns 反注册 → server.Shutdown。

> [!WARNING] 注意
> > **时间关系**（K8s 必须满足）：client 发现延迟 < preStop 宽限 < server 最大延迟 < `ExitWaitTime`（默认 5s，`server.WithExitWaitTime` 调整）< `terminationGracePeriodSeconds`。有长耗时请求时调大 ExitWaitTime（保持其小于 bootstrap 单资源关闭预算，实际排空上限 = min(两者)）。

## 6. 健康检查 / 指标 / SSE

```go
import (
    "github.com/oekit/bootstrap/healthz"
    hertzmetrics "github.com/oekit/hertz/metrics"
    ekitsse "github.com/oekit/hertz/sse"
)

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

> 业务级健康门（依赖就绪才算 Ready）可配合 `healthz` 检查通过后再调 `app.Ready()`——
> TCP 探活只保证「端口可建连」，不保证业务健康。
