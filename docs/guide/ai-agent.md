---
title: AI Agent 使用指南
---

让人和 AI Agent 都能在 5 分钟内正确使用 oekit：机器可读入口、模块选型决策树、必须遵守的硬规则。

## 给 Agent 的三个入口

  
| 入口 | 地址 | 用途 |
|---|---|---|
| llms.txt | [oekit.github.io/llms.txt](https://oekit.github.io/llms.txt) | 全矩阵机器可读索引：31 个发版单元一句话说明（24 个独立发版的 Go 模块 + 7 个嵌套模块）+ 全部文档链接，一次抓取即建立全局认知 |
| AGENTS.md | 每个仓库根目录 | 该仓的权威开发规范：错误处理/日志/并发的硬规则 + 本仓包清单。改代码前必读 |
| go doc | `go doc github.com/oekit/` | 接口签名以源码为准；每仓均带测试，可疑用法直接看 _test.go |

  
## 模块选型决策树

  
```bash
需要字符串/切片/类型转换/时间/ID？
  └─ go get github.com/oekit/pkg     // 基础微工具集（零第三方依赖，按需 import）
  └─ go get github.com/oekit/kitx    // 标识与校验 + 非密码学哈希（uidgen/validator/hash）
错误处理？服务形态用 pkg/errors（BizError 双码）；库形态用 stdlib errors/%w + 哨兵
需要日志？ ── github.com/oekit/logx      // WithService + Ctx* 方法
要发 HTTP 请求？
  ├─ 调内部服务（要发现/熔断/重试/LB）→ oekit/httpx + oekit/nns
  ├─ 存量 net/http 代码一行接入治理 → oekit/httpx 的 NewRoundTripper/StdClient（v0.6.0）
  └─ 只是带 JSON 解析的 HTTP      → pkg/httpjson（零依赖）
搭 HTTP 服务？ ── oekit/middleware + oekit/hertz + oekit/bootstrap
搭 RPC 服务？ ── oekit/kitex（+ oekit/nns + oekit/nns-endpoint）
要数据库？ ── oekit/gormx（CRUD Service）
要 Redis？ ── oekit/redisx（+ 分布式限流 ratelimit / 分布式锁·信号量 distlock）
要缓存编排？ ── oekit/data（cache/cached 写后失效/twolevel 两级广播）
要 etcd？ ── oekit/etcdx（客户端/注册发现/分布式锁）；要 K8s 客户端或 Lease 选主？ ── oekit/k8s
要限流/熔断/降载？
  ├─ 分布式限流 → oekit/redisx 的 ratelimit 子包；防爆破锁 → oekit/concurrency 的 Lockout
  ├─ 进程内限流/三态自适应熔断/CPU 降载/滑动窗口 → oekit/concurrency（ratelimit/breaker/shedding）
  └─ HTTP 服务端过载保护 → oekit/middleware 的 SheddingMiddleware（opt-in）
```

  
## 硬规则红线（违反即产出错误代码）

  
1. **错误处理（按形态两档）**
    - **服务形态**（有 handler 层 / HTTP 状态码映射）：只用 `github.com/oekit/pkg/errors`
      （BizError 双码）。混用旧 `oekit/errors` 会导致 BizError 的 As/Is 互不识别——
      Not Found 会断裂成 500（这是真实发生过的事故）。
    - **库形态**（被 import 的 SDK/组件库，无 handler）：标准库 `errors` /
      `fmt.Errorf("%w")` + 导出哨兵/错误类型即可；**不必**引入 BizError。
      若需与 oekit 服务互操作，仅要求错误链可被 `errors.Is/As` 穿透。
1. **日志用 kv 风格**（全形态）：`log.Info("msg", "key", val)`，不要 printf 风格；
   带 ctx 用 `CtxInfo/CtxError`（自动携带 trace_id）。
1. **SDK 包声明包级 logger 必须用 `logx.Delegating("组件名")`**（全形态），
   禁止 `logx.Default()`/`WithService`（init 时序导致消费方设置失效）。
1. **禁止裸 `go func`**（全形态）：用 `concurrency/async` 的 GoSafe 系列（panic 自动 recover）。
1. **长驻服务的 bootstrap.Run 里必须 `<-app.Context().Done()` 阻塞**（服务形态）——
   userFn 返回即服务结束。
1. **server 就绪后必须触发 `app.Ready()`**（服务形态，bootstrap/nacos v0.3.0+）：
   推荐 hertz/kitex `RunServer` 的 `WithOnReady`——不触发就绪门则 NNS 注册永不发生，
   服务不可被发现。
```

## 新模块接入五步走

```text
1. 上面的决策树定位模块仓
2. go get github.com/oekit/<mod>@latest
3. 读该仓 AGENTS.md（硬规则）+ README 快速使用示例
4. 写代码；不确定的 API 用 go doc / 直接看源码与 _test.go
5. 测试规范：表驱动 + t.Run 子测试；文件名 xxx_test.go
```

  
> [!TIP] 提示
> > **给 Agent 的提示**：本矩阵模块升级频繁（0.x 阶段），写死版本号前先查最新 tag。
> > **查 tag 务必 `GOPROXY=direct`**——默认 proxy 的版本列表缓存滞后，高频发版日
> > `go list -m -versions` 会给出陈旧列表，误以为已钉最新：
> >
> > ```bash
> > GOPROXY=direct go list -m -versions github.com/oekit/pkg
> > GOPROXY=direct go list -m github.com/oekit/pkg@latest
> > ```
> >
> > 旧路径 `git.enjoye.top/enjoydream/ekit`（单体，冻结）、`yi-nology`、
> > `openekit` 均已迁移到 `github.com/oekit`，不要生成旧路径的代码。

  
## 统一 CI 规则（改 CI 只去一个仓）

  全部模块仓的 `.github/workflows/ci.yml` 都是**薄调用层**，指向
  [oekit/.github](https://github.com/oekit/.github) 的共享 reusable workflow `go-ci.yml@main`
  （gofmt → golangci-lint → vet → race 测试 → 覆盖率门禁 → coverage 产物）。

  - **升级 lint 版本 / 加门禁步骤：只改 `oekit/.github`，merge 即全 org 生效**——
    不要在各模块仓的 ci.yml 里复制规则（那是迁移前的旧模式）。
  - 各仓 ci.yml 只携带按仓参数：`go-version`（跟仓库 go.mod 主次版本）、
    `coverage-threshold`（默认 30，0 关闭）、`test-script`、`additional-script`。
  - 已知特例：`bootstrap`、`logx` 用 `additional-script` 补测嵌套子模块；`kitex-examples`
    只 build 不测试（`test-script: go build ./...` + 关闭覆盖率门禁）。
  - 新仓接入：拷 `.github` README 里的接入模板，或跑其 `scripts/sync-callers.sh`
    从旧版完整 ci.yml 自动生成。
  - caller 引用 `@main` 即时生效；要锁定稳定性可改为 tag 引用（如 `@v1`）。

  
## 人该怎么用

  同样的入口对人更简单：从 [首页](/) 的模块地图选仓 → README 顶部有可复制的最小示例 →
  深入看 [指南](/guide/getting-started.html)；每个模块的「矩阵总览」表告诉你它依赖谁、
  被谁依赖，避免引入不需要的层。
