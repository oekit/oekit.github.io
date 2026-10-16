---
title: 迁移指南
---

从 ekit 单体迁移到 oekit：路径映射、API 变更、版本对照。

## 路径映射

| 旧 | 新 | 状态 |
|---|---|---|
| git.enjoye.top/enjoydream/ekit/ | github.com/oekit/<module> | 单体冻结维护，仅安全修复 |
| github.com/oekit/（16 微库） | github.com/oekit/pkg/ | 微仓已删除；旧版本经 proxy 缓存仍可解析 |
| github.com/oekit/redis | github.com/oekit/redisx | 2026-10-16 更名（消 go-redis 包名撞车）；旧路径重定向 ≤ v0.4.0 |
| github.com/oekit/gorm | github.com/oekit/gormx | 2026-10-16 更名（避 gorm.io/gorm 混淆）；旧路径重定向 ≤ v0.2.1 |

### 一条命令完成 import 改写

```bash
# 单体微库：pkg/* → oekit/pkg/*（16 个包同理，逐包替换）
sed -E 's,git\.enjoye\.top/enjoydream/ekit/pkg/(errors|stringx),github.com/oekit/pkg/\1,g' main.go
# 门面：observability/logx → oekit/logx（逐仓对照见上表）
```

> [!WARNING] 注意
> > **类型同一性**：同一进程内所有模块必须使用**同一个** `oekit/pkg/errors`。 混用旧 `oekit/errors` 会导致 BizError 的 As/Is 互相不识别（Not Found 变 500）。

## API 变更对照（相对 ekit 单体）

| 旧（ekit 单体） | 新（oekit） | 说明 |
|---|---|---|
| middleware 包（含 contrib） | oekit/middleware（包名 `mw`）+ contrib 子包 | Round-2 拆出，Round-3 成独立仓 |
| handler/crudh·validatorh（在 hertz 仓） | oekit/handler | Round-3 拆出；hertz 主仓不再依赖 gorm |
| nns.MakeHTTPEndpoint / MakeGRPCEndpoint | oekit/nns-endpoint：`endpoint.NewHTTPEndpointFactory(nnsClient.ServiceClient())` | Round-4 分家，工厂生命周期由调用方管理 |
| observability/logx · metrics · tracing | oekit/logx · oekit/metrics · oekit/tracing | Round-2 解散 observability |
| workflow（在单体） | oekit/workflow | 依赖 logx，独立成仓 |
| examples/kitex（在单体） | oekit/kitex-examples | kitex 主仓 shed bootstrap 链 |

## 版本对照（2026-10-16 快照）

| 模块 | 版本 | 模块 | 版本 |
|---|---|---|---|
| pkg | v0.3.0 | registry | v0.3.0 |
| concurrency | v0.3.1 | timertask | v0.1.4 |
| logx | v0.2.0 | nns / nns-endpoint | v0.3.3 / v0.1.3 |
| metrics / tracing | v0.1.5 / v0.2.0 | middleware | v0.4.0 |
| core / istio | v0.5.0 / v0.1.4 | gormx / redisx / data | v0.3.0 / v0.5.1 / v0.4.1 |
| httpx | v0.1.6 | bootstrap / handler | v0.4.2 / v0.1.11 |
| hertz / kitex | v0.4.1 / v0.4.1 | workflow / kitex-examples | v0.2.5 / v0.1.7 |

各模块以各自 tag 为准（`go get github.com/oekit/<mod>@latest`），上表仅作迁移快照。

## 归档仓去向

- ekit 单体（git.enjoye.top）— 冻结维护，完整历史与架构文档（docs/PLATFORM_CONTRACT.md）
- oekit/observability — Round-2 解散（仓已删除）：logx→oekit/logx，metrics→oekit/metrics，tracing→oekit/tracing
- oekit/{errors,validator,stringx,slicex,enumx,convert,encoding,jsonrepair,httpjson,mathx,pathx,pagination,ptrx,timex,uidgen,cache} — Round-4 微库，已并入 oekit/pkg（仓已删除）
