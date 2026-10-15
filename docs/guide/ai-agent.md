---
title: AI Agent 使用指南
---

让人和 AI Agent 都能在 5 分钟内正确使用 oekit：机器可读入口、模块选型决策树、必须遵守的硬规则。

## 给 Agent 的三个入口

  
| 入口 | 地址 | 用途 |
|---|---|---|
| llms.txt | [oekit.github.io/llms.txt](https://oekit.github.io/llms.txt) | 全矩阵机器可读索引：23 个模块一句话说明 + 全部文档链接，一次抓取即建立全局认知 |
| AGENTS.md | 每个仓库根目录 | 该仓的权威开发规范：错误处理/日志/并发的硬规则 + 本仓包清单。改代码前必读 |
| go doc | `go doc github.com/oekit/` | 接口签名以源码为准；每仓均带测试，可疑用法直接看 _test.go |

  
## 模块选型决策树

  
```bash
需要字符串/切片/类型转换/时间/ID？
  └─ go get github.com/oekit/pkg     // 16 合 1，一个 module 全有
错误处理？也用 pkg/errors（BizError 双码）
需要日志？ ── github.com/oekit/logx      // WithService + Ctx* 方法
要发 HTTP 请求？
  ├─ 调内部服务（要发现/熔断/重试）→ oekit/httpx + oekit/nns
  └─ 只是带 JSON 解析的 HTTP      → pkg/httpjson（零依赖）
搭 HTTP 服务？ ── oekit/middleware + oekit/hertz + oekit/bootstrap
搭 RPC 服务？ ── oekit/kitex（+ oekit/nns + oekit/nns-endpoint）
要数据库？ ── oekit/gorm（CRUD Service）；要 Redis？ ── oekit/redis
```

  
## 硬规则红线（违反即产出错误代码）

  
1. **错误处理只用一套**：`github.com/oekit/pkg/errors`。混用旧 `oekit/errors`         会导致 BizError 的 As/Is 互不识别——Not Found 会断裂成 500（这是真实发生过的事故）。
1. **日志用 kv 风格**：`log.Info("msg", "key", val)`，不要 printf 风格；         带 ctx 用 `CtxInfo/CtxError`（自动携带 trace_id）。
1. **SDK 包声明包级 logger 必须用 `logx.Delegating("组件名")`**，         禁止 `logx.Default()`/`WithService`（init 时序导致消费方设置失效）。
1. **禁止裸 `go func`**：用 `concurrency/async` 的 GoSafe 系列（panic 自动 recover）。
1. **长驻服务的 bootstrap.Run 里必须 `@latest
3. 读该仓 AGENTS.md（硬规则）+ README 快速使用示例
4. 写代码；不确定的 API 用 go doc / 直接看源码与 _test.go
5. 测试规范：表驱动 + t.Run 子测试；文件名 xxx_test.go
```

  
> [!TIP] 提示
> > **给 Agent 的提示**：本矩阵模块升级频繁（0.x 阶段），写死版本号前先查最新 tag；   旧路径 `git.enjoye.top/enjoydream/ekit`（单体，冻结）、`yi-nology`、   `openekit` 均已迁移到 `github.com/oekit`，不要生成旧路径的代码。

  
## 人该怎么用

  同样的入口对人更简单：从 [首页](/) 的模块地图选仓 → README 顶部有可复制的最小示例 →
  深入看 [指南](/guide/getting-started.html)；每个模块的「矩阵总览」表告诉你它依赖谁、
  被谁依赖，避免引入不需要的层。
