---
title: RPC 服务指南（Kitex）
---

kitex + 治理热更 + BizError 桥接 + nns-endpoint 熔断重试：CloudWeGo Kitex 的生产化拼图。

## 依赖

```bash
go get github.com/oekit/kitex github.com/oekit/logx github.com/oekit/nns github.com/oekit/nns-endpoint github.com/oekit/bootstrap
```

> kitex 仓已扁平化至模块根（v0.6.0 收平，原 `kitex/kitex` 双层目录删除）：
> import 一律 `github.com/oekit/kitex`。

## 1. 日志桥接（klog → logx）

```go
import (
    "github.com/cloudwego/kitex/pkg/klog"
    logxkitexlog "github.com/oekit/logx/kitexlog"
)

klog.SetLogger(logxkitexlog.NewLogger(logx.NewSlogLogger("my-rpc")))
```

> kitex 仓的 `kitex.NewLogger` 是同实现的 Deprecated 别名，新代码请直接用 `logx/kitexlog`。

## 2. Server 端

```go
import ekitkitex "github.com/oekit/kitex"

svr := echo.NewServer(handler,
    server.WithSuite(ekitkitex.NewServerTracingSuite()),  // OTel
    server.WithMiddleware(ekitkitex.NewPanicLogMiddleware()), // panic 结构化日志，原样透传
)
ekitkitex.RunServer(app, "echo-service", svr,
    ekitkitex.WithOnReady(func(ctx context.Context) { app.Ready() })) // 就绪门：延迟注册
// kitex 内部 goroutine panic 兜底：
ekitkitex.SetDefaultPanicHandler()
```

> **就绪门契约**（bootstrap/nacos v0.3.0 起）：`WithOnReady`（TCP 探活通过后回调，
> `WithReadyProbeTimeout` 缺省 5s / `WithReadyAddr` 可探活独立地址）里触发
> `app.Ready()`，NNS 注册才会发生；不触发则服务不进注册中心。关停序自动保证
> nns 反注册先于 server 关闭。

## 3. Client 端：治理配置热更新

```go
gov, _ := ekitkitex.NewGovernanceConfig(configCli,
    ekitkitex.WithGovernanceTemplate("my-service.governance")) // Nacos dataId
suite := ekitkitex.NewClientSuite("client-svc", "server-svc", gov,
    ekitkitex.WithRetry(), ekitkitex.WithRPCTimeout(), ekitkitex.WithCircuitBreaker())
cli, _ := echo.NewClient("server-svc", client.WithSuite(suite), ekitkitex.WithBizErrorBridge())
```

> [!WARNING] 注意
> > **三条纪律**：① 治理策略是**全量同步**——配置里删除的 method 回退 Kitex 默认值； ② 不要混用代码级 `client.WithFailureRetry`，混用会使容器忽略全部远端配置； ③ `timeout_ms` 必须 >0（0 走无超时 fast path，清超时用删除配置段表达）。

## 4. 业务异常透传

```text
// WithBizErrorBridge：对端 BizStatusError 自动转本地 BizError 上抛，handler 层 mw.Fail 无感处理
// timeout→50400/504 · no-instance→50300/503 · ACL→40301/403 · Thrift 8 类→50000/500
```

## 5. 元信息透传（trace_id + 业务 kv）

```go
// client middleware：ekit trace_id + user_id/space_code 等全链路透传（走 TTHeader）
cli, _ := echo.NewClient("server-svc",
    kitexmeta.PropagateClientOption(extractors...),
    client.WithSuite(suite))
```

## 6. 跨协议中间件：chainmw.ToKitex

middleware 的 `chainmw`（Recovery/AccessLog/MetadataPropagate，transport 无关内核）
一份逻辑两端跑：kitex 侧经 `kitex/chainmw.ToKitex(mw chain.Middleware)` 桥接，
与 Hertz 服务共享同一实现（`chainmw.Recovery` 的监控上报钩子已做 panic 隔离，
第三方 SDK panic 不影响业务 panic 语义）：

```go
import (
    "github.com/oekit/kitex/chainmw"
    mwchainmw "github.com/oekit/middleware/chainmw"
)

svr := echo.NewServer(handler,
    server.WithMiddleware(chainmw.ToKitex(mwchainmw.Recovery(
        mwchainmw.WithRecoveryReporter(reportPanic), // 钩子内部 panic 被隔离记日志
    ))))
```

## 7. 出站 HTTP：nns-endpoint 熔断 + 换实例重试

RPC 服务也常要调 HTTP 依赖。nns-endpoint 提供端点级熔断（per-service，4xx 不计失败）与失败换实例重试：

```go
import endpoint "github.com/oekit/nns-endpoint"

factory := endpoint.NewHTTPEndpointFactory(nnsc.ServiceClient())
ep, err := factory.MakeEndpoint("payment-svc")
// ep 背后：服务发现 + per-service 熔断 + 5xx/网络错误换实例重试 + 弹性指标
```

## 8. 治理配置模板

```json
{
  "retry":         { "max_attempts": 3, "backoff_ms": 50, "max_backoff_ms": 1000, "jitter_ms": 20 },
  "timeout_ms":    { "*": 500, "echo-service/Echo": 200 },
  "circuit_breaker": { "error_rate_threshold": 30, "min_requests": 100, "open_ms": 10000 },
  "limiter":       { "rate": 1000, "burst": 2000 }
}
```

key 匹配：精确 → 前缀 → 全局 `""`。非法值 fail-closed；kitex 侧 key 自动翻译
（`svc:Method`/`svc`/`""` → 裸方法名/通配）。hertz 侧动态限流/超时见
[oekit/middleware](https://github.com/oekit/middleware) 的 governance 目录。

## 9. 更多弹性原语（按需引入）

- **分布式限流**：`github.com/oekit/redisx` 的 `ratelimit` 子包——Redis Lua 固定窗口/令牌桶（三态返回），故障自动降级本地令牌桶并探活回切
- **分布式锁与信号量**：`redisx/distlock`——`Locker` 之外有 `Renew` 手动续期 / `WithAutoRenew` 覆盖 TryLock 自动续期（v0.8.0），以及 `Semaphore` ZSET 槽位信号量（Acquire 幂等刷新 + 原子清过期槽崩溃自愈；配额语义不做无 Redis 降级，fail-fast）
- **防爆破锁**：`concurrency/ratelimit` 的 `Lockout`（v0.11.0，fail2ban 形态 keyed 锁定/成功 Reset）
- **自适应熔断 / CPU 自适应降载 / 滑动窗口**：`github.com/oekit/concurrency` 的 `breaker` / `shedding` / `window` 子包（规范哨兵 `ErrCircuitOpen`）
- HTTP 服务端过载保护：`oekit/middleware` 的 `SheddingMiddleware`（opt-in）

### breaker 三态状态机使用规则（v0.9.0+，v0.13.0 行为收敛）

`concurrency/breaker` 自 v0.9.0 起是显式 closed/open/half-open 状态机，规则如下：

- **触发**：速率型（SRE 公式：错误率超阈值即接受预算耗尽；**v0.13.0 起公式退役为
  closed→open 触发器**，不再参与熔断期放行）与计数型 `WithConsecutiveFailures(n)`
  （连续失败即熔断，对齐 Envoy consecutive_5xx，补低 QPS「连挂」信号）并联，任一命中切入 open
- **熔断期流量（v0.13.0 行为变更）**：open 态**不放流量**——仅两条放行通道：
  forcePass 强制探活（缺省 1s）+ 冷却期满的半开探测，其余一律拒绝并记丢弃样本。
  公式概率放行与「公式愈合自动恢复」已删除——`WithConsecutiveFailures(3)` 触发后
  流量真停（旧版公式短路会让计数型触发形同虚设）
- **冷却与探测**：冷却期（`WithCooldown`，缺省回落 `WithProbeTimeout` 缺省 1m）期满后
  首个放行请求即半开探测；探测成功关闸并清窗（旧失败样本不得触发立即重开），
  失败重开重置计时；超 `WithProbeTimeout` 未回报视为失联自动回收，可 `AbandonGen` 显式放弃
- **代绑定**（`GenBreaker` 扩展接口，`Breaker` 零改动）：代仅在探测放行时自增，
  陈旧代（gen < 当前代）回报整体作废——一次调用的结果不会被算进另一次调用的账；
  **开放期普通失败只记窗口、不后移冷却计时**，恢复时间可预测
- **兼容面**：`Allow`/`Do`/`DoWithAcceptable`/`NewBreaker` 调用方签名不变
  （v0.13.0 仅新增 `State()`/`State` 枚举可观测出口——**外部自实现 `Breaker` 接口的
  需补实现**，库内构造的用户无感）；LLM 等长尾调用场景用 `WithCooldown`(业务冷却)
  + `WithProbeTimeout`(在途上界) 分开配（如 5m/60s）
