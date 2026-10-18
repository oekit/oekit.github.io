---
title: 迁移指南
---

从 ekit 单体迁移到 oekit：路径映射、API 变更、版本对照，以及 oekit 矩阵内的升级迁移。

## 路径映射

| 旧 | 新 | 状态 |
|---|---|---|
| git.enjoye.top/enjoydream/ekit/ | `github.com/oekit/<module>` | 单体冻结维护，仅安全修复 |
| github.com/oekit/（16 微库） | github.com/oekit/pkg/ | 微仓已删除；旧版本经 proxy 缓存仍可解析 |
| github.com/oekit/pkg/uidgen · validator | github.com/oekit/kitx/uidgen · validator | 2026-10-17 拆分（pkg v0.10.0，BREAKING）；包名与行为契约不变 |
| github.com/oekit/redis | github.com/oekit/redisx | 2026-10-16 更名（消 go-redis 包名撞车）；旧路径重定向 ≤ v0.4.0 |
| github.com/oekit/gorm | github.com/oekit/gormx | 2026-10-16 更名（避 gorm.io/gorm 混淆）；旧路径重定向 ≤ v0.2.1 |

### ekit 单体 import → oekit 模块（完整路径映射）

> 下表经真实单体项目全量迁移实测核对（18 条 import 路径 → 多模块），与
> `go doc` / 目录树交叉验证。**2026-10-17 起矩阵内全部模块已扁平化至仓库根**
> （无 `模块名/同名子目录` 双层），下表对齐当前布局。

| ekit 单体路径 | oekit 新家 | 说明 |
|---|---|---|
| `config`（`LoadDotEnv` / `Get*` / `OverlayMerge` / `ParseDuration`） | **`github.com/oekit/core/config`** | ⚠️ registry v0.2.6 曾有 `config/`，**v0.3.0 已移除**；config 新家是 core/config，不要去 registry 找。env 优先写法用 `config.ApplyEnvOverlay[T]`（core v0.8.0） |
| `middleware/traceid/hmw` | `github.com/oekit/middleware/hmw` | 挪到**模块根**（不再嵌在 traceid 下） |
| `middleware`（包名 `mw`） | `github.com/oekit/middleware` | 模块根包 `mw`（middleware/middleware 双层已收平） |
| `hertz` | `github.com/oekit/hertz` | **模块根**（hertz/hertz 双层已收平，v0.6.0 起）；包名仍为 `hertz` |
| `hertz/sse` | `github.com/oekit/hertz/sse` | 模块根下的 sse |
| `hertz/metrics` | `github.com/oekit/hertz/metrics` | 模块根下的 metrics |
| `handler/validatorh` | `github.com/oekit/hertz/validatorh` | 收编回 hertz 子包 |
| `handler/crudh` | `github.com/oekit/hertz/crudh` | 同上 |
| `network/octopus` | **已移除** | 业务推送客户端不属于通用网络客户端，oekit 不提供；请在业务仓自持 |
| `network/<pkg>`（conn/mq/nats/streamx/wsutil） | `github.com/oekit/network/<pkg>` | v0.5.0 收平双层目录 |
| `bootstrap.Run(Config{...})` | `github.com/oekit/bootstrap` | **v0.4.0 删除 Run(Config)**——见下方改写示例 |
| `data/cache`、`data/gormx` | `github.com/oekit/data/cache`、`github.com/oekit/data/gormx` | 同名直映 |
| `concurrency/async` | `github.com/oekit/concurrency/async` | 同名直映 |
| `observability/logx` | `github.com/oekit/logx` | observability 解散 |
| `observability/metrics` | `github.com/oekit/metrics` | 同上 |
| `observability/tracing` | `github.com/oekit/tracing` | 同上 |
| `pkg/*`（errors/stringx/...） | `github.com/oekit/pkg/*` | 16 微库并入 pkg |

> [!NOTE] 模块布局已全部扁平化
> 矩阵内曾有「模块名/同名子目录」双层结构的仓已全部收平至仓库根（2026-10-17）：
> `registry`（v0.4.0）、`nns`（v0.4.0）、`workflow`（v0.3.0）、`kitex`（并入 v0.6.0）、
> `middleware`、`hertz`、`network`（v0.5.0）。import 时**不再有重复的模块段**：
> 是 `github.com/oekit/hertz/sse`，不是 `github.com/oekit/hertz/hertz/sse`。
> bootstrap 的 `bootstrap/nacos`、`bootstrap/obs`、`logx/sink` 等是**独立嵌套模块**
> （有自己的 tag），不是双层目录残留。

### bootstrap.Run 删除改写（v0.4.0）

```go
// 旧（ekit / oekit ≤ v0.3.x）：
app, err := bootstrap.Run(bootstrap.Config{
    ServiceName:     "svc",
    ShutdownTimeout: 10 * time.Second,
}, func(ctx context.Context) error { ... })

// 新（oekit ≥ v0.4.0）：
b, err := bootstrap.New(
    bootstrap.WithServiceName("svc"),
    bootstrap.WithShutdownTimeout(10*time.Second),
)
if err != nil { ... }
_ = b.Run(func(ctx context.Context) error { ... })
```

迁移服务时注意**就绪门契约**（bootstrap/nacos v0.3.0 起）：注入了 `WithNNS` 的服务，
userFn 必须在 server 就绪后调用 `app.Ready()`（推荐经 hertz/kitex `RunServer` 的
`WithOnReady` 自动触发），否则不会进入注册中心；userFn 里用 `<-app.Context().Done()`
阻塞，返回即主动关机。详见《[HTTP 服务指南](/guide/http-service.html)》第 5 节。

Metrics / NNS / Tracing 组件迁至嵌套模块：

| 旧 | 新 |
|---|---|
| bootstrap 内 Metrics 组件 | `github.com/oekit/bootstrap/obs` |
| bootstrap 内 Tracing 组件 | `github.com/oekit/bootstrap/obs` |
| bootstrap 内 NNS 组件 | `github.com/oekit/bootstrap/nacos` |

### 一条命令完成 import 改写

**长路径规则必须在前**（`traceid/hmw` 先于 `middleware`、`hertz/sse` 先于
`hertz`，否则短前缀先命中会把长路径改写坏）：

```perl
perl -pi -e '
s{git\.enjoye\.top/enjoydream/ekit/middleware/traceid/hmw}{github.com/oekit/middleware/hmw}g;
s{git\.enjoye\.top/enjoydream/ekit/hertz/(sse|metrics)}{github.com/oekit/hertz/$1}g;
s{git\.enjoye\.top/enjoydream/ekit/observability/logx}{github.com/oekit/logx}g;
s{git\.enjoye\.top/enjoydream/ekit/observability/metrics}{github.com/oekit/metrics}g;
s{git\.enjoye\.top/enjoydream/ekit/concurrency/async}{github.com/oekit/concurrency/async}g;
s{git\.enjoye\.top/enjoydream/ekit/data/(cache|gormx)}{github.com/oekit/data/$1}g;
s{git\.enjoye\.top/enjoydream/ekit/handler/validatorh}{github.com/oekit/hertz/validatorh}g;
s{git\.enjoye\.top/enjoydream/ekit/network/}{github.com/oekit/network/}g;
s{git\.enjoye\.top/enjoydream/ekit/pkg/}{github.com/oekit/pkg/}g;
s{git\.enjoye\.top/enjoydream/ekit/middleware}{github.com/oekit/middleware}g;
s{git\.enjoye\.top/enjoydream/ekit/hertz}{github.com/oekit/hertz}g;
s{git\.enjoye\.top/enjoydream/ekit/config}{github.com/oekit/core/config}g;
s{git\.enjoye\.top/enjoydream/ekit/bootstrap}{github.com/oekit/bootstrap}g;
' $(grep -rl 'enjoydream/ekit' --include='*.go' .)
```

跑完后 `go mod tidy` + 编译；bootstrap.Run 调用点需按上一节手工改写
（不是纯路径替换）。机器可读规则表与调用点级改写见
`matrix-tools/scripts/ekit2oekit.py`（`--print-rules`）。

> [!WARNING] 注意
> > **类型同一性**：同一进程内所有模块必须使用**同一个** `oekit/pkg/errors`。 混用旧 `oekit/errors` 会导致 BizError 的 As/Is 互相不识别（Not Found 变 500）。pkg v0.12.0 起 `errors.New/As/Is/Unwrap` 与 stdlib 同型透传，哨兵错误单 import 即可。

## 混合依赖过渡期

下游库仍在 ekit、主工程已迁 oekit 时，两侧
`logx.Logger` 接口**形状逐签名一致，但接口值不可互相赋值**——
`SetLevel(Level)` / `WithAttrs(...Attr)` 里的 `Level` / `Attr` 是各包的
命名类型，编译器报：

```text
cannot use ekitLogger (variable of type ekitlogx.Logger)
    as oekitlogx.Logger value in argument to SetLogger:
    wrong type for method SetLevel
    (have SetLevel(ekitlogx.Level), want SetLevel(oekitlogx.Level))
```

### 5 方法委派桥

只委派 5 个方法，其余 promote；`Level` 两侧同为 `iota` 0-3
（Debug/Info/Warn/Error），可直接转换：

```go
// logxbridge 仅过渡期使用，下游发版后整文件删除（约 45 行）。
type bridgedLogger struct{ inner ekitlogx.Logger }

func (b bridgedLogger) WithCtx(ctx context.Context) oekitlogx.Logger {
    return bridgedLogger{b.inner.WithCtx(ctx)}
}
func (b bridgedLogger) WithService(name string) oekitlogx.Logger {
    return bridgedLogger{b.inner.WithService(name)}
}
func (b bridgedLogger) WithAttrs(attrs ...oekitlogx.Attr) oekitlogx.Logger {
    old := make([]ekitlogx.Attr, 0, len(attrs))
    for _, a := range attrs {
        old = append(old, ekitlogx.Attr{Key: a.Key, Value: a.Value})
    }
    return bridgedLogger{b.inner.WithAttrs(old...)}
}
func (b bridgedLogger) WithGroup(name string) oekitlogx.Logger {
    return bridgedLogger{b.inner.WithGroup(name)}
}
func (b bridgedLogger) SetLevel(lv oekitlogx.Level) {
    b.inner.SetLevel(ekitlogx.Level(lv)) // iota 0-3 双侧同构
}
// 其余方法（Debug/Info/Warn/Error、Ctx*、*f）直接 promote 或一行转发
```

过渡期结束后（下游发版跟上 oekit）删除桥接文件，直接传 `logx.Logger`。

## oekit 矩阵内升级迁移（2026-10-17/18 波次）

已在 ekit→oekit 迁移完成的下游，升级到近期版本时注意这几处路径/API 变更：

| 旧（oekit 早期） | 新 | 版本 |
|---|---|---|
| `github.com/oekit/pkg/uidgen` · `pkg/validator` | `github.com/oekit/kitx/uidgen` · `kitx/validator` | pkg v0.10.0（BREAKING，机械替换 import） |
| `github.com/oekit/pkg/collectionx` | `github.com/oekit/pkg/container` | pkg v0.9.0（类型名/签名不变） |
| `github.com/oekit/logx/shutdown` | `github.com/oekit/core/lifecycle` | logx v0.5.0 弃用别名（Manager 正身在 core，零外部依赖） |
| `httpx.WithBalance(strategy)` / `loadbalance.Balancer` 家族 | `httpx.WithSelector(sel)` / `loadbalance.NewSelector("roundrobin")`；`NewConsistentHashBalance` → `NewConsistentHashSelector`；`WeightedResolver` → `InstanceResolver` | httpx v0.4.0（BREAKING，无兼容路径；v0.5.0 起 Selector 另有 p2c 自适应策略） |
| `registry/registry`、`nns/nns`、`workflow/workflow`、`kitex/kitex`、`middleware/middleware`、`hertz/hertz` 双层路径 | 各模块根（`github.com/oekit/<mod>`） | registry/nns v0.4.0 · workflow v0.3.0 · kitex v0.6.0 · middleware/hertz 已收平 |
| `logx.NewFileSink` 等根包 Sink | `github.com/oekit/logx/sink` 嵌套模块 | logx v0.4.0 |
| `bootstrap.Run(Config{...})` | `bootstrap.New(With*...)` + `b.Run(fn)` + 就绪门 `app.Ready()` | bootstrap v0.4.0 / v0.6.0 |
| 自实现 `concurrency.Breaker` 接口 | v0.13.0 起接口新增 `State()`（外部实现者需补方法；`NewBreaker` 用户无感）；同版行为变更：open 态不放流量（公式概率放行删除，仅 forcePass 探活 + 冷却期满半开探测） | concurrency v0.13.0 |

## API 变更对照（相对 ekit 单体）

| 旧（ekit 单体） | 新（oekit） | 说明 |
|---|---|---|
| middleware 包（含 contrib） | oekit/middleware（包名 `mw`）+ contrib 子包 | Round-2 拆出，Round-3 成独立仓 |
| handler/crudh·validatorh | oekit/hertz/crudh·validatorh | Round-3 拆出独立仓 oekit/handler，2026-10-16 收编回 hertz 子包 |
| nns.MakeHTTPEndpoint / MakeGRPCEndpoint | oekit/nns-endpoint：`endpoint.NewHTTPEndpointFactory(nnsClient.ServiceClient())` | Round-4 分家，工厂生命周期由调用方管理 |
| observability/logx · metrics · tracing | oekit/logx · oekit/metrics · oekit/tracing | Round-2 解散 observability |
| bootstrap.Run(Config{...}) | bootstrap.New(WithServiceName, WithShutdownTimeout) + b.Run(fn) | v0.4.0 删除 Run(Config)；Metrics/NNS/Tracing 迁 bootstrap/obs、bootstrap/nacos |
| workflow（在单体） | oekit/workflow | 依赖 logx，独立成仓 |
| examples/kitex（在单体） | oekit/kitex-examples | kitex 主仓 shed bootstrap 链 |

## 版本对照（2026-10-18 快照，晚）

| 模块 | 版本 | 模块 | 版本 |
|---|---|---|---|
| pkg | v0.14.0 | registry | v0.4.1 |
| concurrency | v0.16.0 | timertask | v0.1.9 |
| logx | v0.7.0 | nns / nns-endpoint | v0.4.1 / v0.2.3 |
| core / kitx | v0.9.1 / v0.2.0 | middleware | v0.11.0 |
| metrics / tracing | v0.1.7 / v0.2.2 | gormx / redisx / data | v0.5.5 / v0.9.0 / v0.13.0 |
| httpx | v0.6.1 | bootstrap | v0.6.2 |
| hertz / kitex | v0.6.4 / v0.6.2 | workflow / kitex-examples | v0.3.1 / v0.1.17 |
| etcdx / k8s / network | v0.1.5 / v0.1.2 / v0.5.4 | | |

一次性拉齐这组经验证的兼容组合：`go get github.com/oekit/oekit@latest`（BOM 快照，
[MATRIX.md 口径](https://github.com/oekit/oekit)）；各模块以各自 tag 为准（`go get github.com/oekit/<mod>@latest`），
上表仅作迁移快照；机器可读实时矩阵见 [versions.json](/versions.json)。

## 归档仓去向

- ekit 单体（git.enjoye.top）— 冻结维护，完整历史与架构文档（docs/PLATFORM_CONTRACT.md）
- oekit/observability — Round-2 解散（仓已删除）：logx→oekit/logx，metrics→oekit/metrics，tracing→oekit/tracing
- oekit/{errors,validator,stringx,slicex,enumx,convert,encoding,jsonrepair,httpjson,mathx,pathx,pagination,ptrx,timex,uidgen,cache} — Round-4 微库，已并入 oekit/pkg（仓已删除；uidgen/validator 又于 pkg v0.10.0 拆至 oekit/kitx）
