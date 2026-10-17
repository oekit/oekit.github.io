---
title: 迁移指南
---

从 ekit 单体迁移到 oekit：路径映射、API 变更、版本对照。

## 路径映射

| 旧 | 新 | 状态 |
|---|---|---|
| git.enjoye.top/enjoydream/ekit/ | `github.com/oekit/<module>` | 单体冻结维护，仅安全修复 |
| github.com/oekit/（16 微库） | github.com/oekit/pkg/ | 微仓已删除；旧版本经 proxy 缓存仍可解析 |
| github.com/oekit/redis | github.com/oekit/redisx | 2026-10-16 更名（消 go-redis 包名撞车）；旧路径重定向 ≤ v0.4.0 |
| github.com/oekit/gorm | github.com/oekit/gormx | 2026-10-16 更名（避 gorm.io/gorm 混淆）；旧路径重定向 ≤ v0.2.1 |

### ekit 单体 import → oekit 模块（argus 实测全表）

| ekit 单体路径 | oekit 新家 | 说明 |
|---|---|---|
| `config`（`LoadDotEnv` / `Get*` / `OverlayMerge` / `ParseDuration`） | **`github.com/oekit/core/config`** | ⚠️ registry v0.2.6 曾有 `config/`，**v0.3.0 已移除**；config 新家是 core/config，不要去 registry 找 |
| `middleware/traceid/hmw` | `github.com/oekit/middleware/hmw` | 挪到**模块根**（不再嵌在 traceid 下） |
| `middleware`（包名 `mw`） | `github.com/oekit/middleware/middleware` | **双层目录**：模块名与同名子目录；包名仍是 `mw` |
| `hertz` | `github.com/oekit/hertz/hertz` | **双层目录**（v0.4.1 回退 hertzx 更名后保留） |
| `hertz/sse` | `github.com/oekit/hertz/hertz/sse` | 双层目录下的 sse |
| `hertz/metrics` | `github.com/oekit/hertz/hertz/metrics` | 双层目录下的 metrics |
| `handler/validatorh` | `github.com/oekit/hertz/validatorh` | 收编回 hertz 子包 |
| `handler/crudh` | `github.com/oekit/hertz/crudh` | 同上 |
| `network/octopus` | `github.com/oekit/network/network/octopus` | **双层目录**（模块名/同名子目录） |
| `bootstrap.Run(Config{...})` | `github.com/oekit/bootstrap/bootstrap` | **v0.4.0 删除 Run(Config)**——见下方改写示例 |
| `data/cache`、`data/gormx` | `github.com/oekit/data/cache`、`github.com/oekit/data/gormx` | 同名直映 |
| `concurrency/async` | `github.com/oekit/concurrency/async` | 同名直映 |
| `observability/logx` | `github.com/oekit/logx` | observability 解散 |
| `observability/metrics` | `github.com/oekit/metrics` | 同上 |
| `observability/tracing` | `github.com/oekit/tracing` | 同上 |
| `pkg/*`（errors/stringx/...） | `github.com/oekit/pkg/*` | 16 微库并入 pkg |

> [!NOTE] 双层目录布局
> `middleware` / `hertz` / `network` 三个模块保留了「模块名/同名子目录」
> 双层结构（历史拆分留下，v0.x 为兼容未收拢）。import 时**模块段会重复一次**：
> `github.com/oekit/hertz/hertz/sse`，不是 `github.com/oekit/hertz/sse`。

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
app, err := b.Run(func(ctx context.Context) error { ... })
```

Metrics / NNS / Tracing 组件迁至嵌套模块：

| 旧 | 新 |
|---|---|
| bootstrap 内 Metrics 组件 | `github.com/oekit/bootstrap/obs` |
| bootstrap 内 Tracing 组件 | `github.com/oekit/bootstrap/obs` |
| bootstrap 内 NNS 组件 | `github.com/oekit/bootstrap/nacos` |

### 一条命令完成 import 改写

**长路径规则必须在前**（`traceid/hmw` 先于 `middleware`、`hertz/sse` 先于
`hertz`，否则短前缀先命中会把长路径改坏）：

```perl
perl -pi -e '
s{git\.enjoye\.top/enjoydream/ekit/middleware/traceid/hmw}{github.com/oekit/middleware/hmw}g;
s{git\.enjoye\.top/enjoydream/ekit/hertz/(sse|metrics)}{github.com/oekit/hertz/hertz/$1}g;
s{git\.enjoye\.top/enjoydream/ekit/observability/logx}{github.com/oekit/logx}g;
s{git\.enjoye\.top/enjoydream/ekit/observability/metrics}{github.com/oekit/metrics}g;
s{git\.enjoye\.top/enjoydream/ekit/concurrency/async}{github.com/oekit/concurrency/async}g;
s{git\.enjoye\.top/enjoydream/ekit/data/(cache|gormx)}{github.com/oekit/data/$1}g;
s{git\.enjoye\.top/enjoydream/ekit/handler/validatorh}{github.com/oekit/hertz/validatorh}g;
s{git\.enjoye\.top/enjoydream/ekit/network/octopus}{github.com/oekit/network/network/octopus}g;
s{git\.enjoye\.top/enjoydream/ekit/pkg/}{github.com/oekit/pkg/}g;
s{git\.enjoye\.top/enjoydream/ekit/middleware}{github.com/oekit/middleware/middleware}g;
s{git\.enjoye\.top/enjoydream/ekit/hertz}{github.com/oekit/hertz/hertz}g;
s{git\.enjoye\.top/enjoydream/ekit/config}{github.com/oekit/core/config}g;
s{git\.enjoye\.top/enjoydream/ekit/bootstrap}{github.com/oekit/bootstrap/bootstrap}g;
' $(grep -rl 'enjoydream/ekit' --include='*.go' .)
```

跑完后 `go mod tidy` + 编译；bootstrap.Run 调用点需按上一节手工改写
（不是纯路径替换）。

> [!WARNING] 注意
> > **类型同一性**：同一进程内所有模块必须使用**同一个** `oekit/pkg/errors`。 混用旧 `oekit/errors` 会导致 BizError 的 As/Is 互相不识别（Not Found 变 500）。

## 混合依赖过渡期

下游库（如 agentkit v0.14.x）仍在 ekit、主工程已迁 oekit 时，两侧
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

## 版本对照（2026-10-16 快照）

| 模块 | 版本 | 模块 | 版本 |
|---|---|---|---|
| pkg | v0.3.0 | registry | v0.3.0 |
| concurrency | v0.3.1 | timertask | v0.1.4 |
| logx | v0.2.0 | nns / nns-endpoint | v0.3.3 / v0.1.3 |
| metrics / tracing | v0.1.5 / v0.2.0 | middleware | v0.4.0 |
| core | v0.5.0 | gormx / redisx / data | v0.3.0 / v0.5.1 / v0.4.1 |
| httpx | v0.1.6 | bootstrap | v0.4.2 |
| hertz / kitex | v0.5.0 / v0.5.0 | workflow / kitex-examples | v0.2.5 / v0.1.7 |

各模块以各自 tag 为准（`go get github.com/oekit/<mod>@latest`），上表仅作迁移快照。

## 归档仓去向

- ekit 单体（git.enjoye.top）— 冻结维护，完整历史与架构文档（docs/PLATFORM_CONTRACT.md）
- oekit/observability — Round-2 解散（仓已删除）：logx→oekit/logx，metrics→oekit/metrics，tracing→oekit/tracing
- oekit/{errors,validator,stringx,slicex,enumx,convert,encoding,jsonrepair,httpjson,mathx,pathx,pagination,ptrx,timex,uidgen,cache} — Round-4 微库，已并入 oekit/pkg（仓已删除）
