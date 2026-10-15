---
title: 日志指南（logx）
---

面向接口的统一日志门面：多后端可替换、kv 结构化、caller 自动归属、trace_id 注入。

## 核心设计

`logx` 是接口门面，底层实现可整体替换。接口分四层，按需依赖：

| 接口 | 方法 | 用途 |
|---|---|---|
| CoreLogger | Debug/Info/Warn/Error | kv 结构化（禁止 printf 风格） |
| FormattedLogger | + Debugf/Infof/Warnf/Errorf | printf 风格 |
| ContextLogger | + CtxDebug/CtxInfo/…（8 个） | 自动从 ctx 提取 trace_id |
| Logger | + WithService/WithAttrs/WithGroup/WithCtx/SetLevel | 派生子 logger |

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
- `LOG_LEVEL=DEBUG|INFO|WARN|ERROR` 环境变量对所有后端统一生效
- `Ctx*` 方法的 trace_id 由 tracing 模块的 `traceid.Middleware()` 注入 ctx 后自动提取

## SDK / 基础库接入：Delegating

> [!WARNING] 注意
> > **硬规则**：SDK 基础包**禁止**用 `logx.Default()` 或 `WithService` 声明包级 logger—— 包级 var 在 init 时求值，先于 main() 的 SetDefault，消费方后续设置永远不生效。必须用 `Delegating` 懒解析。

```text
var flowLog = logx.Delegating("workflow") // 调用时才解析 Default()，组件名渲染为 component=workflow
```

## 后端与 SetDefault

```go
import (
    "github.com/oekit/logx"
    logslog "github.com/oekit/logx" // 根包内置 slog / std 两种实现
)

logx.SetDefault(logslog.NewSlogLogger("my-service"))
```

| 后端 | 位置 | 场景 |
|---|---|---|
| stdLogger | logx 根包 `NewStdLogger` | 默认（标准库 log），零 Hertz 依赖 |
| slogLogger | logx 根包 `NewSlogLogger` | 结构化 JSON 输出 |
| hlog 适配 | [oekit/logx/hlog](https://github.com/oekit/logx/tree/main/hlog) `NewHlogLogger` | 与 Hertz hlog 输出格式一致（降级为字符串拼接） |
| hertzlog 桥接 | [oekit/logx/hertzlog](https://github.com/oekit/logx/tree/main/hertzlog) | logrus/zap/zerolog/slog 四后端 → hlog |

> [!WARNING] 注意
> > **防递归**：把 hlog 后端的 Logger 再传给 `hertz.NewLogger`/`kitex.NewLogger` 会无限递归—— 桥接框架日志请用 `NewSlogLogger` 或 `NewStdLogger`。

## 多目标输出：Sink

```go
// 同时写 stdout + 按大小轮转文件
fileSink, _ := logx.NewFileSink("/var/log/my-service/app.log")
rotSink, _ := logx.NewRotatingSink("/var/log/my-service/app.log", 100) // 100MB
logx.SetDefault(logx.NewSlogLogger("my-service"))
// Sink 接口可自行实现接 Loki/OTLP；单 sink 失败不阻塞整体（MultiSink 隔离）
```

## caller 归属

每个后端自动追踪真实调用方（`caller` 字段），内部帧按 module 路径前缀跳过；
桥接适配器（如 kitex/hertz 的日志桥）通过 `logx.SkipCallerFiles(file)` 注册自身文件，
框架日志的 caller 指向真实调用方而非桥接帧。
