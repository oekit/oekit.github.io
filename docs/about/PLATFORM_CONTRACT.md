---
title: PLATFORM_CONTRACT
---

> **oekit 适配说明**：本文写于 ekit 单体时期（v0.34.0，冻结维护）。包分层概念在 oekit 矩阵中一一对应（微库已合并为 oekit/pkg）。

# ekit 平台契约文档

本文档定义 ekit 接入后所有服务共享的可观测性契约：trace_id、日志字段、HTTP 响应格式、错误码映射和 Metrics 标准。
所有新增服务应遵循本契约，确保日志、指标、追踪可按同一维度关联。

## 1. trace_id 标准

| 项目 | 定义 | 来源 |
|------|------|------|
| context 键名 | `trace_id` | `middleware/traceid.Key` |
| HTTP 头名 | `X-Trace-Id` | `middleware/traceid.HeaderKey` |
| ID 长度 | 12 字符（UUID 前 12 位） | `middleware/traceid.IDLength` |

**行为**：
- 请求进入时，中间件读取 `X-Trace-Id` 请求头；缺失则生成 12 位 ID。
- ID 同时写入：响应头 `X-Trace-Id`、Hertz `RequestContext`、标准 `context.Context`。
- Service 层通过 `traceid.FromContext(ctx)` 提取。

```go
import "github.com/oekit/tracing/traceid"

traceID := traceid.FromContext(ctx)
```

## 2. 日志字段标准

### 2.1 结构化日志字段（slog 实现）

通过 `logx.UseSlog("svc")` 启用结构化 JSON 输出。每行日志包含以下标准字段：

| 字段 | 类型 | 说明 | 输出条件 |
|------|------|------|---------|
| `time` | string (RFC3339Nano) | 时间戳 | 始终 |
| `level` | string | `DEBUG` / `INFO` / `WARN` / `ERROR` | 始终 |
| `message` | string | 日志消息 | 始终 |
| `service` | string | 服务标识（`logx.WithService` 设置） | service 非空时 |
| `trace_id` | string | 链路追踪 ID | context 中存在时 |
| `caller` | string (`file:line`) | 真实调用方位置 | 可定位时 |

**附加字段**：`WithAttrs` 持久化属性和每次调用的 kv 对作为独立 JSON key 输出。

### 2.2 访问日志字段

`AccessLogMiddleware` 通过 `logx.Delegating("access")` 输出（懒解析，运行期 `SetDefault` 生效），固定字段：

| 字段 | 说明 |
|------|------|
| `method` | HTTP 方法 |
| `path` | 请求路径（原始路径） |
| `status` | HTTP 状态码 |
| `latency_ms` | 请求耗时（毫秒） |
| `ip` | 客户端 IP |

隐含字段：`component` = `"access"`（SDK 组件日志以 `component` 属性标识来源，`service` 属于消费方），`trace_id` 由 `CtxInfo` 自动提取。

### 2.3 日志使用规范

```go
var svcLog = logx.WithService("my-service")

// 正确：结构化 kv 风格
svcLog.CtxError(ctx, "create failed", "err", err, "resource_id", id)

// 禁止：printf 风格
// svcLog.Infof("[my-service] create failed: %v", err)
```

## 3. HTTP 响应格式

### 3.1 统一响应结构

所有业务响应使用统一 JSON 结构：

```json
{
  "code": 0,
  "data": {},
  "message": "success",
  "trace_id": "a1b2c3d4e5f6"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | int | 业务状态码：`0` = 成功，非 `0` = 失败 |
| `data` | any | 业务数据，失败时为 `null` |
| `message` | string | 描述信息 |
| `trace_id` | string | 链路追踪 ID |

### 3.2 响应写入函数

| 函数 | HTTP 状态 | body code | 行为 |
|------|-----------|-----------|------|
| `mw.SuccessResp(c, data)` | 200 | 0 | 成功响应 |
| `mw.SuccessRespMsg(c, data, msg)` | 200 | 0 | 成功响应（自定义 message） |
| `mw.ErrorResp(c, bizCode, msg)` | StatusMapper(bizCode) | bizCode | 错误响应，自动 `c.Abort()` |
| `mw.Fail(ctx, c, err, opts...)` | 由 err 推导 | 由 err 推导 | handler 统一错误处理，见 §4.5 |

### 3.3 ResponseMiddleware 自动包装

当 handler 写入裸 JSON（无 `code` 字段）且 HTTP 200 + Content-Type JSON 时，自动包装为统一响应结构。
已包含 `code` 字段的响应不会被重复包装。

## 4. 错误码与 HTTP 状态映射

### 4.1 BizError 结构

```go
type BizError struct {
    BizCode  int    // 业务码（写入响应 body 的 code 字段）
    HTTPCode int    // HTTP 状态码；0 = 经 StatusMapper 从 BizCode 推导
    Message  string // 业务描述
    Cause    error  // 原始错误（可选，JSON 序列化时忽略）
}
```

### 4.2 预定义错误构造函数

| 函数 | BizCode | HTTPCode |
|------|---------|----------|
| `NewBadRequestError(msg)` | 400 | 400 |
| `NewUnauthorizedError(msg)` | 401 | 401 |
| `NewForbiddenError(msg)` | 403 | 403 |
| `NewNotFoundError(msg)` | 404 | 404 |
| `NewConflictError(msg)` | 409 | 409 |
| `NewBizError(code, msg)` | 自定义 | 0（经 StatusMapper 从 BizCode 推导） |
| `NewBizErrorWithStatus(bizCode, httpCode, msg)` | 显式指定 | 显式指定 |

`WrapBizError(code, msg, cause)` 与 `NewBizError` 一致（HTTPCode=0）并保留原始错误链。

### 4.3 StatusMapper 映射规则

| 业务码范围 | HTTP 状态码 |
|-----------|------------|
| `100 <= code < 600` | 直接复用（如 404 → HTTP 404） |
| `code == 0` | 200 |
| 其他（自定义业务码如 1001） | 400 |

自定义映射：`mw.SetStatusMapper(fn)`，应在 main 中、注册路由前调用。

### 4.4 ValidationError 自动映射

`ValidationError` 实现 `Unwrap() → BizError(BizCode=400, HTTPCode=400)`，使 `mw.Fail` 自动返回 400：

```go
var req CreateReq
if err := validatorh.BindAndValidate(c, &req); err != nil {
    mw.Fail(ctx, c, err) // ValidationError 自动映射为 400
    return
}
```

### 4.5 Fail 统一错误处理（handler 层标准）

`mw.Fail(ctx, c, err, opts...)` 是 handler 层错误处理的标准入口，按以下顺序判定：

| 顺序 | 条件 | HTTP 状态 | body code | 日志 |
|------|------|-----------|-----------|------|
| 1 | err 为 `*errors.BizError` | `HTTPCode`（0 时经 StatusMapper 推导） | `BizCode` | 不打 error 日志（expected） |
| 2 | err 包装 `registry.ErrNoInstances` | 503 | 503 | Warn（依赖不可用语义） |
| 3 | 命中 not-found checker | 404 | 404 | 不打 error 日志 |
| 4 | 其他 | 500 | 500 | `CtxError` 自动携带 trace_id |

not-found 判定默认关闭，通过 `mw.WithNotFoundChecker(fn)` 按调用注入（或全局设置）。`data/crud` 的查询
错误已包装为 `BizError(404)`，经第 1 层自动映射。ctx 为 Hertz handler 的 `context.Context`，需显式传入
（`*app.RequestContext` 不实现 `context.Context`）。

## 5. Metrics 标准

### 5.1 应用级指标

| 指标名 | 类型 | Labels |
|--------|------|--------|
| `app_build_info` | Gauge | `service`, `commit`, `branch`, `build_time`, `go_version` |
| `app_start_time_seconds` | Gauge | （无） |
| `go_*` / `process_*` | 混合 | Go 运行时标准指标 |

### 5.2 HTTP 请求级指标

默认 namespace 为 `http`：

| 指标名 | 类型 | Labels |
|--------|------|--------|
| `http_requests_total` | Counter | `method`, `path`, `status_code`（+ `service` 可选） |
| `http_request_duration_seconds` | Histogram | `method`, `path`（+ `service` 可选） |
| `http_requests_in_flight` | Gauge | `method`, `path`（+ `service` 可选） |
| `http_request_size_bytes` | Histogram（可选） | 同上 |
| `http_response_size_bytes` | Histogram（可选） | 同上 |

Histogram buckets（duration）：`[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` 秒。

### 5.3 HTTP 客户端出站指标

`network/httpx` 通过 `WithMetrics` 启用，默认 namespace 为 `http_client`：

| 指标名 | 类型 | Labels |
|--------|------|--------|
| `http_client_requests_total` | Counter | `service`, `target`, `method`, `status_code` |
| `http_client_request_duration_seconds` | Histogram | `service`, `target`, `method` |
| `http_client_requests_in_flight` | Gauge | `service`, `target`, `method` |

`target` 是被调服务的业务标识（通过 `WithTarget("user-service")` 显式设置），是受控的低基数 label。
**禁止**用 URL host/IP/port/path 等高基数来源作为 label——服务调 100 个下游实例会产生
~100 × method × status_code 个 series，导致 Prometheus 内存爆炸。

### 5.4 高基数标签规避

| 标签 | 取值约定 | 防高基数措施 |
|------|---------|-------------|
| `path` | 使用路由模板 `c.FullPath()`（如 `/api/user/:id`） | **禁止使用原始路径**，未匹配路由时为 `"unnamed"` |
| `status_code` | HTTP 状态码整数字符串 | 固定有限集 |
| `method` | HTTP 方法 | 固定有限集 |
| `service` | 服务名 | 固定有限集 |

**禁止**将以下值作为 metrics label：请求 ID、用户 ID、数据库主键、任意用户输入。

### 5.5 客户端弹性指标（熔断/重试）

`observability/metrics/resilience` 是全库熔断/重试指标的唯一定义点，`network/httpx`
（`WithMetrics` 启用，namespace `http_client`）与 `nns/endpoint`（`WithMetrics` 启用，
namespace `nns_endpoint`）共享同一指标族：

| 指标名（以 http_client 为例） | 类型 | Labels |
|--------|------|--------|
| `http_client_breaker_state` | Gauge | `service`, `kind`（0 closed / 1 half_open / 2 open） |
| `http_client_breaker_transitions_total` | Counter | `service`, `kind`, `from`, `to` |
| `http_client_breaker_rejected_total` | Counter | `service`, `kind` |
| `http_client_retry_attempts_total` | Counter | `service`, `kind` |

`kind` 是弹性栈标识（固定有限集）：`httpx`（httpx.Client 自带熔断/重试）、
`nns-http` / `nns-grpc`（nns/endpoint 工厂）、`kitex`（kitex 治理栈
`WithCircuitBreaker`+`WithMetrics`，namespace 缺省 `kitex`）。`service` 为目标服务名。

kitex 侧说明：kitex CBSuite 的状态回调是私有的，指标经轮询 Panel 状态
（5s 粒度）聚合到服务级——聚合状态 = 全部方法熔断器的最差状态，方法级
变化走结构化日志。重试计数经 metainfo 的 `retry.TransitKey`（kitex retry
容器每次重试重新走 middleware 链并注入序号，middleware 读到即一次额外尝试）。

方法级 RPC 视角（吞吐/时延按 `caller/callee/method/status/retry` 分维）经
`observability/metrics/instrumentation/kitexprom` 桥接（kitex-contrib/
monitor-prometheus）：指标注册进 ekit Registry 单端点暴露，禁用插件自带
exporter（独立端口 + 启动失败 log.Fatal）；tracer 按 Registry 幂等缓存
（插件 MustRegister 不去重）。

排障语义：`breaker_state=2` 期间 `breaker_rejected_total` 仍在涨 = 调用方持续
请求但被熔断保护；`transitions_total` 高频震荡 = 故障临界抖动，考虑调大
`Interval`/`Timeout`；`retry_attempts_total` 与请求总数的比值偏高 = 下游
半死状态（重试在掩盖故障）。

## 6. 中间件栈顺序

`mw.DefaultMiddleware(StackConfig{ServiceName: "svc"})` 注册顺序：

```
Prometheus → TraceID(gen) → TraceID(bridge) → Recovery → Response → AccessLog
```

TraceID 必须在 Response 和 AccessLog 之前，确保 trace_id 可被后续中间件提取。

## 7. registry 与 nns 选择指南

### 职责边界

| 包 | 定位 | 能力 |
|---|------|------|
| `registry` | 薄抽象，provider 无关、框架无关 | `Registrar`（注册/注销）、`Discoverer`（发现）、`Subscriber`（订阅）、`ConfigStore`（配置存储） |
| `registry/nacos` | registry 的 Nacos 实现 | 将 Nacos SDK 适配为 registry 接口 |
| `registry/kitex` / `registry/hertz` | registry 的框架薄适配 | Registry/Resolver 桥接 + 实例类型转换（`convert.go`） |
| `nns` | 高级服务治理门面 | mock 模式、静态实例、缓存+singleflight、多级降级、服务配置热更新、端点工厂；`New(cfg)` 是 provider 选择点（Nacos 默认构造在此，SDK 客户端随 Close 释放） |
| `nns/kitex` | NNS → Kitex 适配 | 继承 NNS 全部能力，桥接 Kitex resolver/registry |
| `nns/client` | 治理核心（v0.29.0 起 provider 无关） | 实例缓存/降级链/订阅/配置加载；provider 全部经 `With*` 注入，可 mock 可替换 |
| `nns/hertz` | NNS → Hertz 适配 | Registry/Resolver 适配 + InstanceWatcher 健康检查轮询器 |

> 边界说明（v0.24+）：
> - `registry` 核心已完全去框架化：Kitex/Hertz 实例类型转换函数（`InstancesToKitex`/`InstancesToHertz`）
>   已移至 `registry/kitex`、`registry/hertz` 的 `convert.go`，核心包不再 import 任何 transport 框架。
> - `nns/{kitex,hertz}` 与 `registry/{kitex,hertz}` 的 4 个 Resolver 共享骨架（拉取 + 校验 + 错误包装）、
>   `?tags` 解析与注册信息转换统一下沉 `internal/sdbridge`（`ResolverCore`/`ToInstance`/`ServiceNameFromDesc`）；
>   各适配层只保留实例类型转换（`convert.go`）与框架 Result 组装的薄壳。
> - transport 生命周期契约：`lifecycle.App`（`ekit/lifecycle`）是 `hertz.RunServer`/`kitex.RunServer`
>   依赖的最小接口（`Context`/`AddResource`/`GoBackground`），`bootstrap.App` 隐式满足；
>   transport 包不反向依赖 bootstrap。

### 选择决策树

```
需要什么能力？
├─ 只需注册发现基础能力（无 mock/缓存/降级）
│   → 使用 registry + registry/nacos
│
├─ 需要内部服务治理（mock/缓存/降级/端点工厂）
│   → 使用 nns
│
├─ 使用 Kitex 框架
│   → 使用 nns/kitex（继承 NNS 全部能力）
│
└─ 使用 Hertz 框架
    → 使用 nns/hertz（InstanceWatcher 健康检查）
```

### 禁止事项

- 业务服务不得直接 import `github.com/nacos-group/nacos-sdk-go`，应通过 `registry/nacos` 或 `nns` 间接使用。
- 业务服务不得直接 import `github.com/go-redis/redis`，应通过 `data/redisx` 间接使用。
- 业务服务不得直接 import `gorm.io/gorm` 的 logger，应通过 `data/gormx` 间接使用。

## 8. HTTP 客户端选型指南

ekit 提供两层 HTTP 客户端抽象，职责清晰、不重叠：

| 包 | 定位 | 适用场景 |
|---|---|---|
| `network/httpx` | 高层 Hertz client 客户端（v0.25.1 起，替代 req/v3） | 业务服务间 RPC、需服务发现/熔断/重试/指标的场景。默认推荐。 |
| `observability/tracing/instrumentation/httpotel`（Go 包名 `httpxotel`） | 标准 `http.Client` 的低层 transport 工具 | 已有标准库 `http.Client` 链路，仅需注入 OpenTelemetry tracing 的场景。 |

### 边界与协作

- `network/httpx` 是推荐入口，自带 NNS 服务发现、熔断、重试、Prometheus 指标。
- 两者**不是重复**，前者封装 Hertz client（v0.25.1 起，原 req/v3 已移除），后者封装 `net/http` transport（`httpxotel.Transport()` / `httpxotel.WrapTransport`）。
- `network/httpx.WithTracePropagation`（v0.26.0 起为现行 API，旧 `WithTracing` 已移除）走 Hertz client `UseAsLast` 注入 W3C TraceContext + Baggage 头；替换/包装既有 `net/http` transport 用 `httpxotel.Transport()`，两条路径的 propagator 语义一致（均读 `otel.GetTextMapPropagator()`）。

### 决策

- 新业务代码 → `network/httpx`
- 替换/包装既有 `http.Client` 接入 tracing → `observability/tracing/instrumentation/httpotel`
- 两者**不要在同一调用链上叠加**（tracing span 会重复）
