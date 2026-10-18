---
title: 日志指南（logx）
---

面向接口的统一日志门面：多后端可替换、kv 结构化、caller 自动归属、trace_id 注入、脱敏与 slog 双向桥。

## 核心设计

`logx` 是接口门面，底层实现可整体替换。接口分四层，按需依赖：

| 接口 | 方法 | 用途 |
|---|---|---|
| CoreLogger | Debug/Info/Warn/Error | kv 结构化（禁止 printf 风格） |
| FormattedLogger | + Debugf/Infof/Warnf/Errorf | printf 风格 |
| ContextLogger | + CtxDebug/CtxInfo/…（8 个） | 自动从 ctx 提取 trace_id |
| Logger | + WithService/WithAttrs/WithGroup/WithCtx/SetLevel | 派生子 logger |

根包自 v0.4.0 起**纯 stdlib 零外部依赖**：轮转文件等 Sink 能力在嵌套模块
`logx/sink`（含 lumberjack），只用门面的消费者不再被拖依赖。

## 业务服务接入

```go
import "github.com/oekit/logx"

var svcLog = logx.WithService("order-service")

func handle() {
    svcLog.Info("creating order", "order_id", ord, "amount", amt)
    svcLog.CtxError(ctx, "create failed", "err", err) // 自动带 trace_id
}
```

- kv 风格是**默认规范**，printf 风格（`Infof`）仅用于确需格式化的场景
- `LOG_LEVEL=DEBUG|INFO|WARN|ERROR` 环境变量对所有后端统一生效；程序内解析用
  `logx.ParseLogLevel(s)`（v0.7.0 起返回 `(Level, error)`，配错不再返回 nil），
  「配错退默认」用 `logx.ParseLogLevelOr(s, logx.LevelInfo)`
- `Ctx*` 方法的 trace_id 由 tracing 模块的 `traceid.Middleware()` 注入 ctx 后自动提取
- 热路径昂贵 kv 先判级：`logx.Enabled(logger, logx.LevelDebug)`（LevelEnabler，
  未实现的实现方保守返回 true）

## SDK / 基础库接入：Delegating

> [!WARNING] 注意
> > **硬规则**：SDK 基础包**禁止**用 `logx.Default()` 或 `WithService` 声明包级 logger—— 包级 var 在 init 时求值，先于 main() 的 SetDefault，消费方后续设置永远不生效。必须用 `Delegating` 懒解析。

```text
var flowLog = logx.Delegating("workflow") // 调用时才解析 Default()，组件名渲染为 component=workflow
```

## 脱敏与丢弃：WithFilter

```go
// 凭证类键值替换为 ***（覆盖 Core/Ctx/Fmt 全路径，With* 派生子 logger 保持规则）
safeLog := logx.WithFilter(svcLog, logx.FilterKey("password", "token", "authorization"))
// 命中即丢整条（如 noisy healthcheck）
quietLog := logx.WithFilter(svcLog, logx.FilterFunc(func(msg string, kvs []any) bool {
    return msg == "healthcheck ping"
}))
```

## 与 slog 互操作（双向桥 + trace 注入）

```go
import (
    "log/slog"

    "github.com/oekit/logx"
)

// 正向桥：期望 *slog.Logger 的三方库直接消费 logx 生态
sl := logx.Slogger(svcLog)             // 级别按名称映射，WithGroup 为键前缀
h := logx.SlogHandler(svcLog)          // 只要 slog.Handler 的形态

// TraceHandler：给任意 slog.Handler 包一层自动注入 trace_id
// ——裸 slog 项目接 trace 串联的唯一路子（ctx 无 trace 不注入、已携带不重复）
std := slog.New(logx.TraceHandler(slog.NewJSONHandler(os.Stdout, nil)))
```

trace 来源统一走 `SetTraceExtractor` 注册的提取器（与 logx/hmw/hertzotel 一致），
`logx.WithTraceKey("trace_id")` 自定义键名。

## 审计留痕：NewAuditLogger

```go
auditLog := logx.NewAuditLogger("order-service") // 级别锁 LevelInfo
```

审计/合规/安全留痕专用：级别锁 Info、**不受 `LOG_LEVEL` 降级**，`SetLevel` 调到
WARN/ERROR 被拒绝——「审计留痕不被部署配置静默过滤」是门面级承诺。

## 后端与 SetDefault

```go
import "github.com/oekit/logx"

logx.SetDefault(logx.NewSlogLogger("my-service")) // 结构化 JSON；另有 NewStdLogger（默认 LevelInfo）
```

桥接子包 `hlog`/`hertzlog`/`kitexlog` 是**独立嵌套模块**（v0.2.0 起），按需引入，
主模块零 Hertz/Kitex 依赖：`go get github.com/oekit/logx/hlog`（及 `/hertzlog`、`/kitexlog`）。

| 后端 | 位置 | 场景 |
|---|---|---|
| stdLogger | logx 根包 `NewStdLogger` | 标准库 log（默认级别 Info，零 Hertz 依赖） |
| slogLogger | logx 根包 `NewSlogLogger` | 结构化 JSON 输出 |
| sink 嵌套模块 | [oekit/logx/sink](https://github.com/oekit/logx/tree/main/sink) `NewFileSink`/`NewRotatingSink`/`NewMultiSink` | 文件/按大小轮转/多目标（单 sink 失败不阻塞整体） |
| hlog 适配 | [oekit/logx/hlog](https://github.com/oekit/logx/tree/main/hlog) `NewHlogLogger` | 与 Hertz hlog 输出格式一致（降级为字符串拼接） |
| hertzlog 桥接 | [oekit/logx/hertzlog](https://github.com/oekit/logx/tree/main/hertzlog) | logrus/zap/zerolog/slog 四后端 → hlog |
| kitexlog 桥接 | [oekit/logx/kitexlog](https://github.com/oekit/logx/tree/main/kitexlog) `NewLogger` | Kitex klog → logx（FullLogger + Control 全实现，caller 归属已修正） |

> [!WARNING] 注意
> > **防递归**：把 hlog 后端的 Logger 再传给 `hertz.NewLogger`/`kitexlog.NewLogger` 会无限递归—— 桥接框架日志请用 `NewSlogLogger` 或 `NewStdLogger`（kitexlog 会 panic 防御）。

Sink 用法（嵌套模块）：

```go
import "github.com/oekit/logx/sink"

fileSink, _ := sink.NewFileSink("/var/log/my-service/app.log")
rotSink, _ := sink.NewRotatingSink("/var/log/my-service/app.log", 100) // 100MB
// Sink 接口可自行实现接 Loki/OTLP；MultiSink 隔离单点失败
```

## 优雅关停去哪了

关停管理器正身已迁 `github.com/oekit/core/lifecycle`（`lifecycle.Manager`：注册
closer/teardown、信号监听、Drain 引用计数、per-job 超时、panic 隔离；日志注入
`*slog.Logger`）。`logx/shutdown` 仅余 Deprecated 类型别名转发，新代码请直接用
`core/lifecycle`。

## caller 归属

每个后端自动追踪真实调用方（`caller` 字段），内部帧按 module 路径前缀跳过；
桥接适配器（如 kitex/hertz 的日志桥）通过 `logx.SkipCallerFiles(file)` 注册自身文件，
框架日志的 caller 指向真实调用方而非桥接帧。
