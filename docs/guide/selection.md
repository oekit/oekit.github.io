---
title: 选型速查（场景 → 包）
---

用 oekit 重构/实现功能时的「我要做 X → 用什么包」速查。与 AI 入口 skill
（matrix-tools `skills/oekit`）**同源渲染**（`scripts/gen_skill.py`）——手改会被巡检覆盖；
模块事实以 [matrix.py](https://github.com/oekit/matrix-tools/blob/main/matrix.py) 为真相源。

## 使用流

1. 下面场景表定位模块/子包；基础工具需求查 [pkg 子包速查](#pkg-子包速查33-合-1零第三方依赖)
2. `go doc github.com/oekit/<pkg>` 或读包 `doc.go` 拿准签名
3. 对照[硬规则](#硬规则速览全矩阵适用)
4. 深入：该仓 AGENTS.md / 对应指南（[日志](/guide/logging) · [错误](/guide/errors) ·
   [缓存](/guide/caching) · [HTTP](/guide/http-service) · [RPC](/guide/rpc-service) ·
   [可观测](/guide/observability)）

## 场景选型表

### 服务构建

| 我要做什么 | 用什么 | 组合提示 | 红线 |
|---|---|---|---|
| 起 HTTP 服务（生产全栈） | `bootstrap` + `hertz` + `middleware`（注册发现加 `nns`） | `hertz.RunServer` 的 `WithOnReady` 里触发 `app.Ready()`（就绪门，NNS 才注册）；标准栈 `mw.DefaultMiddleware` | userFn 返回即服务结束：长驻必须 `<-app.Context().Done()`；无 Recovery 则 panic 直接断连 |
| 起 RPC 服务（Kitex） | `kitex` + `bootstrap`（+`nns`） | `RunServer(WithOnReady/WithReadyAddr)`；`SetDefaultPanicHandler` 兜底；治理热更 `NewGovernanceConfig` | 就绪门不触发 ⇒ 服务永不进注册中心；治理配置是全量同步，勿混用代码级 retry |
| handler 错误出口 | `pkg/errors` + `middleware` | BizError 命名工厂（NewNotFoundError 等）；`mw.Fail(ctx, c, err)` 统一出口（NotFound→404、兜底 500） | BizError 载体唯一——混两套 errors 包 404 断裂成 500；error 禁 `_` 忽略 |
| 响应体自管的服务 | `middleware` | `StackConfig{DisableResponseWrap: true}` 一键（TraceID→Recovery→AccessLog）或 `MinimalMiddleware` 手拼 | Recovery 仍硬性要求（Hertz 无默认 PanicHandler） |
| 健康检查 / K8s 就绪 | `bootstrap/healthz` + `hertz` | liveness/readiness 多 check 并发、panic 隔离；业务健康门过了再 `app.Ready()` | TCP 探活只证端口可建连，不证业务健康 |
| K8s 客户端 / Lease 选主 | `k8s`（+`k8s/leaderelection`） | kubeconfig→KUBECONFIG→in-cluster 逐级回退；主备单活 OnStarted/StoppedLeading 回调 | 失权与 ctx 取消并存时失权优先上抛 ErrLostLeadership |
| 组合式流程编排 | `workflow` | 串行/并行/异步/条件分支 + Hook AOP | — |

### 出站调用与弹性

| 我要做什么 | 用什么 | 组合提示 | 红线 |
|---|---|---|---|
| 内部服务 HTTP 调用（发现+熔断+重试+LB） | `httpx`（+`nns`） | 存量 net/http 用 `NewRoundTripper`/`StdClient` 一行接入治理；LB 用 loadbalance Selector（p2c/一致性哈希） | 重试缺省关、显式开；非 2xx 非错误才计失败 |
| 出站 SSRF 防护 | `pkg/urlguard` + `httpx` | 一行组合 `httpx.WithSafeDial`；豁免只走构造态 `WithAllow*` | 拨号层预解析 + RemoteAddr 核对闭合 TOCTOU——别在调用方自己写解析 |
| RPC 依赖的 HTTP 端点（熔断+换实例重试） | `nns-endpoint` | `NewHTTPEndpointFactory(nnsc.ServiceClient()).MakeEndpoint("dep-svc")` | 4xx 不计熔断失败 |
| 重试（带返回值/退避抖动） | `concurrency/retry` | `DoValue[T]`（`Do` 已委托给它，只有一份退避实现）；服务端 Retry-After 优先（DelayHint） | 别手写退避——封顶/抖动/可重试判定都在 retry 里 |
| 中间件一份逻辑两端跑 | `core/chain` + `core/transport` → `middleware/chainmw` | kitex 经 `kitex/chainmw.ToKitex` 复用同一实现（Recovery/AccessLog/MetadataPropagate） | 监控上报钩子内 panic 已隔离，别在钩子里再 recover 吞语义 |
| RPC 业务异常透传 | `kitex` `WithBizErrorBridge` | 对端 BizStatusError → 本地 BizError，handler `mw.Fail` 无感处理 | timeout→50400/504、no-instance→50300/503——映射是框架契约，别自己猜 |

### 数据访问

| 我要做什么 | 用什么 | 组合提示 | 红线 |
|---|---|---|---|
| CRUD 缓存编排 | `data/cached`（多实例加 `data/twolevel`） | 三行接入 `cached.NewRepository`：写后失效/事务提交后失效/查询缓存版本号失效/GetByIDs 批量；仓储需实现 `gormx/crud.Repository[T, ID]` 接口（gormrepo 已实现） | 模式是 Cache-Aside 不是双写；TTL 必须有限（失效失败唯一安全网）；返回值只读（改写开 CloneOnRead） |
| 本地缓存 | `pkg/cache` | `LocalCache` + `SingleFlightCache` 防击穿；确定性 TTL 测试用 `cachetest.RunWithClock`（Comparable 契约仅 int/uint/string，struct 需自定义 Contract） | 命中返回零拷贝引用（改写开 CloneOnRead）；`GetEx` 在 LocalCache 上区分 miss 与显式 nil（装饰器走 Peek） |
| 分布式缓存 | `data/rediscache` / `redisx` | CacheAside 的 Redis 实现，管道化 MGet | `redis.Nil` 是未命中不是错误 |
| 分布式锁 / 信号量 | `redisx/distlock` 或 `etcdx/distlock`（接口契约单源 `pkg/distlock`） | Locker/哨兵集/WithLock 定义在 `pkg/distlock` 一次（后端中立，errors.Is 跨包正确分类）；自动续期 `WithAutoRenew`；Semaphore ZSET 槽位 | `Renew` 返回 false = 锁丢失；Semaphore 无 Redis fail-fast 不降级 |
| 泛型 CRUD / 防丢更新 | `gormx/crud`（HTTP 层 `hertz/crudh`） | `NewBaseService[T, ID, Req]`；repo 实现 `TxRepository` 则 Update 自动事务 + FOR UPDATE 行锁读 | afterUpdate 钩子失败整体回滚 |
| 分片定时任务 | `timertask`（分布式加嵌套 `timertask/redis`） | 单机 `Scheduler`（cron 表达式复用 pkg/timex/cron，FakeClock 确定性断言）；分布式 RedisBackend + 可靠投递 | 可靠投递要接入生命周期才真正生效 |

### 流控与防护

| 我要做什么 | 用什么 | 组合提示 | 红线 |
|---|---|---|---|
| 进程内限流 / 熔断 / 降载 | `concurrency`（ratelimit / breaker / shedding / window / batch） | breaker 三态：open 不放流量（仅 forcePass + 冷却期满半开探测）；连续失败 `WithConsecutiveFailures`；LLM 等长尾用 `WithCooldown` 与 `WithProbeTimeout` 分开配 | 规范哨兵 `ErrCircuitOpen`；自实现 Breaker 接口须补 `State()` |
| 分布式限流 | `redisx/ratelimit` | Lua 三态返回；故障自动降级本地令牌桶并探活回切 | — |
| HTTP 服务端过载保护 | `middleware` SheddingMiddleware | CPU 自适应降载，opt-in 显式挂载 | — |
| 防爆破锁 | `concurrency/ratelimit` Lockout（跨实例 `redisx/distlock` Lockout） | fail2ban 形态：滑窗失败计数→阈值锁定→成功 Reset/到期自解 | 多实例共享计数才用 Redis 版 |
| 防击穿 / 防穿透 | `pkg/cache` SingleFlightCache / null marker / `data` bloom | SingleFlight 包 LocalCache；bloom 用 `cached.WithBloomFilter`（可选件） | bloom 慎用：全写走装饰器 + 存量预热 + ID 单调，违反即「数据消失」窗口 |

### 可观测

| 我要做什么 | 用什么 | 组合提示 | 红线 |
|---|---|---|---|
| 日志 | `logx` | 业务 `WithService`；kv 风格默认；`Ctx*` 自动带 trace_id；后端 `SetDefault` 整体替换；LOG_LEVEL 统一生效 | SDK/基础包包级 logger 必须 `Delegating`；错误字段用 `logx.ErrKey` 常量 |
| 脱敏 / 审计日志 | `logx` WithFilter / NewAuditLogger | `FilterKey` 凭证打 ***；审计级别锁 Info、不受 LOG_LEVEL 降级；slog 双向桥 + TraceHandler | — |
| 指标 | `metrics`（挂载 `hertz/metrics`） | Prometheus Registry + `/metrics` handler；Prometheus 中间件从默认栈拆出（v0.2.0 起），要就显式挂 | — |
| 追踪 / trace_id 串联 | `tracing`（+`logx` TraceHandler） | `traceid.Middleware` 注入 ctx 后 `Ctx*` 自动提取；OTLP gRPC/HTTP 双协议（v0.3.0 起） | 框架挂载二选一勿叠加 |

### 配置 · 生命周期 · 基础设施

| 我要做什么 | 用什么 | 组合提示 | 红线 |
|---|---|---|---|
| 应用配置 | `core/config` | `LoadBootstrap`（etc/ 约定）/ `LoadFile`（任意路径）/ `Unmarshal`（字节源）共享同一条解码线；严格模式 `WithStrict()` 未知键拒载 | `Unmarshal` 是 yaml 优先于 env——要 12-factor 再调 `ApplyEnvOverlay` |
| 零依赖嵌入配置 | `pkg/config` | yaml 子集 parser + env 覆盖 + 必填汇总校验 + 敏感字段 Redact dump | 需要完整 yaml/三方能力选 core/config（pkg 是零依赖仓） |
| 优雅关停 | `core/lifecycle`（`bootstrap` 组合根） | Manager：closer 注册 / Drain 引用计数 / per-job 超时 / panic 隔离；关停序 nns 反注册 → server.Shutdown | 组件 Close 统一 `Close(ctx) error` + sync.Once 幂等 |
| ID 生成 / 校验 / 哈希 | `kitx` | uidgen（Snowflake 单例 + Extract 元数据 / RFC4122 v4）；validator 校验失败 Unwrap 即 BizError 400；hash 非密码学缓存键 | — |
| 日志后端桥接 / 文件轮转 | `logx/sink` · `logx/hlog` · `logx/hertzlog` · `logx/kitexlog`（嵌套模块按需引入） | 文件/轮转/多目标 Sink；logrus/zap/zerolog/slog 四后端桥 hlog；Kitex klog 桥接 | 防递归：hlog 后端别再传给框架桥（kitexlog panic 防御） |
| 注册发现 / Nacos 配置 | `registry`（+嵌套 `registry/nacos`·`registry/nacosimpl`），客户端门面 `nns` | SPI 无关：Registrar/Discoverer/ConfigStore + registrymocks 测试替身；Nacos 重依赖在嵌套模块 | — |


## pkg 子包速查（33 合 1，零第三方依赖）

| 想做什么 | 子包 | 说明 |
|---|---|---|
| 错误包装/业务错误 | `errors` | nil-safe Wrap/Cause + BizError 双码（服务形态唯一载体） |
| 字符串/脱敏/敏感词 | `stringx` | 工具集 + Replacer 最长匹配替换 + Masker 正则脱敏 |
| 切片/枚举/类型转换 | `slicex` / `enumx` / `convert` | — |
| 时间边界/cron | `timex` / `timex/cron` | BeginningOf/EndOf 七对 + cron 表达式 |
| 数学/路径/分页/指针 | `mathx` / `pathx` / `pagination` / `ptrx` | — |
| JSON 修复/宽松解析 | `jsonrepair` | UnmarshalLenient + ExtractObject/ExtractArray |
| HTTP + JSON（零依赖） | `httpjson` | 带解析的轻量请求 |
| 编码 | `encoding` | — |
| 本地缓存 | `cache` / `cache/cachetest` | CacheAside/LocalCache/SingleFlightCache + 契约套件（RunWithClock 假时钟；Comparable 仅 int/uint/string） |
| 泛型容器 | `container` | Set/Ring/Queue/SafeMap/Slice（并发安全） |
| 布隆过滤器 | `bloomx` | — |
| ctx 取值/作用域 | `contextx` / `ctxscope` | — |
| 缓冲 IO | `bufiox` | — |
| 并发安全 map | `strmap` | — |
| secrets 凭证 | `secretx` | — |
| shell 词法判据 | `shellx` | Analyze 事实面（重定向/动态词），判不了就报错 |
| 出站 SSRF 校验 | `urlguard` | CheckURL + DialFunc 预解析（与 httpx.WithSafeDial 组合） |
| webhook 回调 | `webhook` | — |
| CLI 子命令 | `cli` | 退出码 0/1/2 写死，不读 os.Args 不 os.Exit |
| 迁移包容器 | `pack` | zip + manifest + JSONL 流式 + Inspect 体检 |
| 目录 tar 传输 | `tarx` | Scan/Write/Extract 三件套，拒 Zip Slip |
| 断点续传/分片上传 | `resumable` | 会话状态机 + ChunkStore 接口 |
| 子进程治理 | `procx` | 内存上限 cgroup v2；与 shellx 配套 |
| 零依赖静态配置 | `config` | yaml 子集 + env 覆盖 + Redact |
| 分布式锁契约（后端中立） | `distlock` | Locker/哨兵集/WithLock 单源——redisx·etcdx 后端消费（etcdx#123 治本） |
| singleflight 契约测试 | `singleflighttest` | 共享契约套件 |
| 反射深拷贝 / 类型解析 | `reflectx` | DeepCopyValue 指针环防护；config.SetFromString 字符串按 reflect.Kind 落位 |

## 硬规则速览（全矩阵适用）

### 分层与依赖
- 依赖严格自底向上，禁止反向依赖；本仓的矩阵内依赖见 README「矩阵总览」表
- 微工具集统一在 `github.com/oekit/pkg`；本仓新增基础工具前先确认 pkg 里没有
- `pkg` 是**零第三方依赖仓**（go.mod 零 require，仅标准库，CI 强制）——需要三方能力的基础工具拆独立仓（先例：kitx）

### 错误处理
- 业务错误（需 BizCode/HTTPCode 双轨、可被 As/Is 判定）统一用
  `github.com/oekit/pkg/errors` 的 BizError（命名工厂 NewNotFoundError 等）
- 普通错误包装允许 stdlib：`fmt.Errorf("...: %w", err)` / `errors.New`
- BizError 载体同一进程只此一套：混入其他 BizError 实现会打断 As/Is 判定（Not Found 变 500）
- handler 层统一 `mw.Fail(ctx, c, err)` 出口；所有 error 禁止 `_` 忽略

### 日志
- 门面 `github.com/oekit/logx`：业务服务 `logx.WithService("svc")`；
  **SDK/基础包必须 `logx.Delegating("组件名")` 懒解析**（禁止 Default()/WithService 声明包级 logger）
- kv 结构化风格为默认；`Ctx*` 方法自动携带 trace_id；禁止 printf 风格 `logx.Infof` 作为主要手段
- 错误字段名统一用 `logx.ErrKey` 常量（值 "err"），禁止手写 "err"/"error" 字面量（两矩阵落同一 Loki/ES）
- 后端经 `logx.SetDefault` 替换；`LOG_LEVEL` 环境变量统一生效

### 并发安全
- 禁止裸 `go func`：用 `github.com/oekit/concurrency/async` 的 GoSafe 系列（panic 被 recover）
- 共享状态 mutex / atomic 保护；包级全局可变状态用 `atomic.Pointer[T]`

### 生命周期
- 组件 Close 统一 `Close(ctx) error` 签名 + sync.Once 幂等
- 应用骨架用 `github.com/oekit/bootstrap/bootstrap.Run`；**userFn 返回即服务结束，
  长驻服务必须 `<-app.Context().Done()` 阻塞**

### Option 与命名
- 函数选项模式 `XxxOption`（禁止裸 `Option`，多包 co-import 冲突）
- 导出符号 PascalCase + godoc 注释；包文档放 doc.go
- Option 非法值总则：① 构造期非法值 fail-fast（panic 或返回 error，同仓内保持一致）；
  ② nil 参数 = 显式回退默认值，不算非法；③ 运行期不可恢复错误显式上抛，不静默

### 超时默认值
- 探测类 ≤10s、治理类 ≤60s、后台任务 ≤10min；跨区间取值须在包文档声明理由

### 版本与发版
- SemVer；0.x 阶段 minor 允许 breaking
- **main 受分支保护，改动一律走 PR，管理员也不例外**（`enforce_admins=true`，
  直推会被 `GH006 Changes must be made through a pull request` 拒掉）
- 发版流程：建分支 → 提交 → 开 PR → CI（`Lint & Test / Lint` + `Lint & Test / Test`）
  绿 → 合入 main → **合入之后**再打 annotated tag 推远端
- tag 不走 PR（`protect-release-tags` ruleset 管的是不可删/不可改，不是审批）；
  tag 必须落在已合入 main 的 commit 上，否则 `go get` 拉到的是没进过 CI 的代码
- module 路径 = `github.com/oekit/<name>`；**改 module 路径必须同步**：
  全部 import、go.mod、README 安装行、logx caller 启发式（若涉及 logx）

### 文档
- 本仓 README 的「矩阵总览」表由脚本生成，结构变化后需重新生成
- 历史完整规范见 ekit 单体仓（git.enjoye.top/enjoydream/ekit，冻结维护）的 AGENTS.md 与 docs/


## 模块索引

## 应用引导 · 框架生态

| 模块 | 一句话 | 深入 |
|---|---|---|
| [bootstrap](https://github.com/oekit/bootstrap) | 应用生命周期引导——New(WithServiceName/WithShutdownTimeout/WithBeforeServe) + Run(fn) + healthz | `bootstrap/AGENTS.md` |
| [hertz](https://github.com/oekit/hertz) | Hertz 运行时集成（模块根扁平化）——日志桥接、生命周期、SSE/health/metrics、适配器、OTel、crudh/validatorh（基于 kitx… | `hertz/AGENTS.md` |
| [kitex](https://github.com/oekit/kitex) | Kitex 生态——日志桥接、治理热更、生命周期、BizError 桥接、kitexotel、istio（xDS 动态熔断，原 istio 微库收编） | `kitex/AGENTS.md` |
| [middleware](https://github.com/oekit/middleware) | Hertz 标准中间件栈（模块根 mw，双层目录已收平）+ contrib 桥接 + hmw + SheddingMiddleware 自适应降载 + chainmw… | `middleware/AGENTS.md` |
| [workflow](https://github.com/oekit/workflow) | 组合式流程编排——串行/并行/异步/条件分支 + Hook AOP | `workflow/AGENTS.md` |
| [kitex-examples](https://github.com/oekit/kitex-examples) | Kitex echo 示例——client/server + IDL + 治理配置 | `kitex-examples/AGENTS.md` |
| [k8s](https://github.com/oekit/k8s) | Kubernetes 客户端封装——RESTConfig/Clientset/DynamicClient 构建（显式 kubeconfig → KUBECONFIG 显式意图… | `k8s/AGENTS.md` |

## 通信 · 服务治理

| 模块 | 一句话 | 深入 |
|---|---|---|
| [httpx](https://github.com/oekit/httpx) | HTTP 客户端 + 负载均衡——服务发现/熔断（规范哨兵 ErrCircuitOpen）/重试/指标/OTel 透传 | `httpx/AGENTS.md` |
| [nns-endpoint](https://github.com/oekit/nns-endpoint) | NNS 端点工厂——per-service 熔断、换实例重试、gRPC 池 | `nns-endpoint/AGENTS.md` |
| [network](https://github.com/oekit/network) | 轻量网络客户端——WebSocket/NATS/MQ 抽象、连接与流工具 | `network/AGENTS.md` |
| [nns](https://github.com/oekit/nns) | NNS 服务治理客户端——provider 无关发现/配置/实例缓存 | `nns/AGENTS.md` |
| [registry](https://github.com/oekit/registry) | 注册发现核心（provider 无关 SPI：Registrar/Discoverer/Subscriber… | `registry/AGENTS.md` |

## 数据访问

| 模块 | 一句话 | 深入 |
|---|---|---|
| [gormx](https://github.com/oekit/gormx) | SQL/GORM 全家——连接池增强、框架无关 CRUD Service、仓储（原 oekit/gorm，v0.3.0 更名） | `gormx/AGENTS.md` |
| [redisx](https://github.com/oekit/redisx) | Redis 全家——客户端封装（根包）、分布式缓存 cache/、分布式锁 distlock（Locker 同形可互换；Renew 手动续期（false=锁丢失，不进… | `redisx/AGENTS.md` |
| [etcdx](https://github.com/oekit/etcdx) | etcd 全家——客户端封装（根包：生产默认值/Health 探活/Close(ctx) 幂等）、registry 注册发现实现（SPI 对接 registry… | `etcdx/AGENTS.md` |
| [data](https://github.com/oekit/data) | 数据访问门面——复刻 ekit data/ 能力面：cache/rediscache/crud/distlock/gormx/redisx/timertask… | `data/AGENTS.md` |
| [timertask](https://github.com/oekit/timertask) | 分片定时任务（FNV-1a、心跳续约） | `timertask/AGENTS.md` |

## 可观测性

| 模块 | 一句话 | 深入 |
|---|---|---|
| [logx](https://github.com/oekit/logx) | 统一日志门面（多后端可替换 + caller 归属；Sink 已迁嵌套模块 logx/sink，根包纯 stdlib） | `logx/AGENTS.md` |
| [tracing](https://github.com/oekit/tracing) | OpenTelemetry 追踪 + trace_id 真相源（v0.3.0 起 OTLP 双协议导出：gRPC 缺省… | `tracing/AGENTS.md` |
| [metrics](https://github.com/oekit/metrics) | Prometheus 门面 + 弹性指标族 | `metrics/AGENTS.md` |

## 基础库

| 模块 | 一句话 | 深入 |
|---|---|---|
| [pkg](https://github.com/oekit/pkg) | 微工具集 33 合 1（errors/bloomx/contextx/ctxscope/container/distlock/stringx/slicex/enumx… | `pkg/AGENTS.md` |
| [concurrency](https://github.com/oekit/concurrency) | 并发与流控原语（async/gopool/group/singleflight/progress/syncx/ratelimit/retry）+ window 滑动窗口… | `concurrency/AGENTS.md` |
| [core](https://github.com/oekit/core) | 应用基建件——governance 治理 schema、config 配置加载（LoadBootstrap/LoadDotEnv/Get* 系、default/env… | `core/AGENTS.md` |
| [kitx](https://github.com/oekit/kitx) | 标识与校验——uidgen（Snowflake 全局单例+Extract 元数据、手写 RFC 4122 v4 UUID 零第三方依赖、RandomHex… | `kitx/AGENTS.md` |

### 嵌套模块（重依赖隔离载体）

| 父仓 | 模块 | 一句话 | 安装 |
|---|---|---|---|
| bootstrap | `nacos` | bootstrap 的 Nacos/NNS 服务治理接入——以 BootstrapperOption 注入，父仓保持零 Nacos 依赖（v0.3.0 起注册延迟到 App.Ready 之后） | `go get github.com/oekit/bootstrap/nacos@latest` |
| bootstrap | `obs` | bootstrap 的可观测性接入——以 BootstrapperOption 注入 Prometheus 指标（oekit/metrics）与 OpenTelemetry 追踪（oekit… | `go get github.com/oekit/bootstrap/obs@latest` |
| logx | `sink` | logx 的输出目标实现——Sink 抽象 + MultiSink/FileSink/RotatingSink 三个内置实现，重依赖隔离在此，根包纯 stdlib | `go get github.com/oekit/logx/sink@latest` |
| logx | `hlog` | 基于 Hertz hlog 的 logx.Logger 实现（结构化 kv 降级为字符串拼接，输出格式与 Hertz hlog 对齐） | `go get github.com/oekit/logx/hlog@latest` |
| logx | `hertzlog` | Hertz 日志后端桥接——logrus/zap/zerolog/slog 四后端各自实现 hlog.FullLogger（依赖隔离，logx 根包不引三方日志库） | `go get github.com/oekit/logx/hertzlog@latest` |
| logx | `kitexlog` | Kitex 日志后端桥接——把 logx.Logger 适配为 Kitex klog.FullLogger（依赖隔离，logx 根包不引 kitex） | `go get github.com/oekit/logx/kitexlog@latest` |
| timertask | `redis` | timertask 的 Redis 后端——RedisBackend/ShardManager 与可靠投递，go-redis 隔离在此，根包零 redis 依赖（v0.2.0 起） | `go get github.com/oekit/timertask/redis@latest` |
| registry | `nacosimpl` | Nacos SPI 实现——Discoverer/ConfigStore/Registrar 基于 nacos-sdk-go v2（nacos-sdk 重依赖隔离在此，registry 根仓零 nacos-sdk） | `go get github.com/oekit/registry/nacosimpl@latest` |
| registry | `nacos` | Nacos 客户端门面——Bootstrap 配置、client 工厂与 config 加载（实现 core/config.ConfigSource，配 ConfigWatcher 热更新） | `go get github.com/oekit/registry/nacos@latest` |
| kitex | `observability/tracing/instrumentation/kitexotel` | Kitex 的 OpenTelemetry tracing 接入——client/server suite + metainfo 透传（obs-opentelemetry 重依赖隔离在此，kitex 根仓回归零… | `go get github.com/oekit/kitex/observability/tracing/instrumentation/kitexotel@latest` |
| kitex | `istio` | Kitex 的 xDS / Proxyless / Istio 集成桥接——xDS 资源管理器 + 动态熔断（kitex-contrib/xds 重依赖隔离在此，kitex 根仓回归零 apache/thrift） | `go get github.com/oekit/kitex/istio@latest` |
| kitex | `cmd/thrift2openapi` | thrift IDL（api.* 注解体系）→ OpenAPI 3.0 文档生成器（thriftgo 真 parser，go install 即用）——替换各服务手搓 regex… | `go get github.com/oekit/kitex/cmd/thrift2openapi@latest` |

> 模块事实源：[matrix.py](https://github.com/oekit/matrix-tools/blob/main/matrix.py)；
> 机器可读索引：[llms.txt](/llms.txt) · 版本矩阵：[versions.json](/versions.json)
