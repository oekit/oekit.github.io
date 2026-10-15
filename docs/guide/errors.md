---
title: 错误处理指南
---

pkg/errors 一套贯穿存储层到 HTTP 响应的错误链：Wrap/Cause、BizError 双码、统一 Fail 出口。

## 包装与解包

```go
import "github.com/oekit/pkg/errors"

if err := db.Query(...); err != nil {
    // nil-safe（避免 fmt.Errorf 的 %!w() 歧义），kv 用于结构化日志关联
    return errors.Wrap(err, "query user", "user_id", uid)
}
// 判定仍走标准库 errors.Is / errors.As；解包到最底层用 Cause
if errors.Is(err, sql.ErrNoRows) { ... }
root := errors.Cause(err)
```

## BizError：业务码与 HTTP 码双轨

```go
// BizCode 写入响应 body；HTTPCode 为 0 时经 StatusMapper 从 BizCode 推导
err := errors.NewBizError(40010, "库存不足")
// 显式双码
err := errors.NewBizErrorWithStatus(40010, 409, "库存不足")
// 命名工厂（同时设两码）：NewNotFoundError / NewBadRequestError / …
err := errors.NewNotFoundError("order not found")
```

- `ValidationError` 自动映射为 400
- Kitex RPC 的对端业务异常经 [oekit/kitex](https://github.com/oekit/kitex) 的   `WithBizErrorBridge()` 转成本地 BizError（timeout→50400/504、no-instance→50300/503、ACL→40301/403）

## 统一出口：middleware.Fail

```go
import mw "github.com/oekit/middleware/middleware"

func getOrder(ctx context.Context, c *app.RequestContext) {
    ord, err := svc.Get(ctx, id)
    if err != nil {
        mw.Fail(ctx, c, err) // BizError→对应码；crud.ErrNotFound→404；registry.ErrNoInstances→503；兜底 500
        return
    }
    mw.SuccessResp(c, ord)
}
```

500 路径自动记录结构化日志（`logx.CtxError`，携带 trace_id），错误细节不泄漏给客户端。

> [!WARNING] 注意
> > **类型同一性**：BizError 的 `errors.As/Is` 识别依赖 import 路径一致。 整条链路（存储层 → service → handler/middleware）必须使用**同一个** errors 包。 混用 `oekit/pkg/errors` 与旧 `oekit/errors` 会导致 404 判定断裂成 500（两套类型互不相认）。

## 规范清单

- 所有 error 必须处理，禁止 `_` 忽略
- 包装用 `errors.Wrap`（或 `fmt.Errorf("...: %w", err)`），保持链路可 Is/As
- 包级 sentinel 用 `var ErrXxx = errors.New(...)`
- Redis `redis.Nil` 视为缓存未命中，不是错误
- 业务错误一律 BizError，HTTP 层统一走 `mw.Fail`，禁止 handler 各写各的响应格式
