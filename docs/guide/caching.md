---
title: 缓存指南（data）
---

面向数据访问的缓存三件套，全部来自 `github.com/oekit/data` 一个模块（≥ v0.8.1）：
`cache`（接口与后端）、`cached`（缓存 CRUD 编排）、`twolevel`（两级缓存 + 跨实例失效广播）。

## 三件套总览

| 子包 | 角色 | 一句话 |
|---|---|---|
| `cache` | 接口与后端 | `Cache`/`CacheAside`/`BatchGetter` 接口 + LocalCache/SingleFlightCache + 键构造 |
| `rediscache` | Redis 后端 | CacheAside 的 Redis 实现（管道化 MGet） |
| `cached` | 编排 | 把 cache-aside 语义套在 crud 仓储上：**增删改失效缓存，查询构建缓存** |
| `twolevel` | 组合 | L1 本地 + L2 远端读穿写透 + Redis pubsub 跨实例失效广播 |

## 手写 Cache-Aside：cache + rediscache

```go
import (
    "github.com/oekit/data/cache"
    "github.com/oekit/data/rediscache"
)

local := cache.NewLocalCache(cache.LocalConfig[HotConfig]{
    TTL: 30 * time.Second,
    Source: loadHotConfig, // 未命中回源
})
remote := rediscache.NewRedisCache(redisCli, rediscache.RedisConfig[HotConfig]{
    Prefix: "hot:", TTL: 24 * time.Hour, Source: loadHotConfig,
})
cfg, err := local.GetOrLoad(ctx, "tenant:acme")
```

- `GetOrLoad` 未命中回源并回填；Source 返回 `(nil, nil)` 会缓存 null marker（防穿透）
- 外面包一层 `cache.NewSingleFlightCache(backend)` 可防击穿（同 key 并发只回源一次）

## 三行接入缓存 CRUD：cached

把 cache-aside 语义套在 `gormx/crud` 仓储上，直接作为 `crud.NewBaseService` 的仓储：

```go
import (
    "github.com/oekit/data/cache"
    "github.com/oekit/data/cached"
    "github.com/oekit/data/crud"
)

repo := cached.NewRepository[User](rawRepo,
    // 后端工厂：装饰器注入回源函数，后端形态与 TTL 由你决定——TTL 必须有限，
    // 它是删缓存失败时的唯一安全网
    func(src cache.SourceFunc[User]) cache.CacheAside[User] {
        return cache.NewSingleFlightCache(cache.NewLocalCache(cache.LocalConfig[User]{
            TTL: 10 * time.Minute, Source: src,
        }))
    },
    cached.WithID[User](func(u *User) int64 { return u.ID }), // 嵌入 gormx.BaseModel 可省略
)
svc := crud.NewBaseService[User, CreateUserReq, UpdateUserReq](repo)
```

接入后每个操作自动获得编排：

| 操作 | 发生什么 |
|---|---|
| `GetByID` | 先查缓存；未命中回源回填（null marker 防穿透 + SingleFlight 防击穿） |
| `GetOne` / `List` | 默认直通；开启查询缓存后走「表级版本号 + 查询指纹」键 |
| Create / Update / Delete / Batch* | **先写库，成功后**删实体键 + bump 表级版本；失效失败不回滚写（错误走 `WithOnError`，TTL 兜底） |
| `RunInTx` | 事务内写只收集失效清单，**提交成功后**统一失效；回滚不失效；事务内读直通 |
| `GetByIDs` | 一次 MGet 批量往返拿真值，缺席键回退逐个 GetOrLoad |
| Exists / Count / GetByCondition | 永远直通 |

### 查询缓存（opt-in）

列表失效的语义是「改一行 → 该表全部列表缓存失效」（表级版本号方案），用命中率换一致性：

```go
entityQ := cache.NewLocalCache(cache.LocalConfig[User]{TTL: 5 * time.Minute})
page := cache.NewLocalCache(cache.LocalConfig[cached.QueryPage[User]]{TTL: 5 * time.Minute})
versions := cache.NewLocalCache(cache.LocalConfig[string]{TTL: 24 * time.Hour}) // 版本键配长 TTL

qc, err := cached.NewQueryCache[User](entityQ, page, versions, 5*time.Minute) // ttl 必须为正
repo := cached.NewRepository[User](rawRepo, factory,
    cached.WithID[User](idOf),
    cached.WithQueryCache[User](qc),
)
```

`ForUpdate` 读永不缓存；负结果不缓存；不可区分取值的查询参数拒绝指纹降级直通。

### bloom 防穿透（可选件，慎用）

```go
bf, _ := redisCli.NewBloomFilter(ctx, "cached:user:bloom", 0.001, 1_000_000)
cached.WithBloomFilter[User](bf) // 回源前先问布隆，"绝对不存在"零仓储调用
```

启用前提：**所有写入走本装饰器**（Create 自动 Add，事务提交后同样生效）+ 存量 ID 预热 +
ID 单调递增。违反会造成"数据消失"窗口（受 null marker TTL 约束）。读失败 fail-open。

## 多实例两级缓存：twolevel

L1 本地 + L2 Redis 读穿写透；多实例部署挂 `Bus`（Redis pubsub）广播失效，
驱逐所有实例的 L1 副本：

```go
import (
    "github.com/oekit/data/twolevel"
    redisx "github.com/oekit/redisx"
)

rdb, _ := redisx.NewClientFromAddr(addr, password, 0)
tlc, _ := twolevel.NewTwoLevelCache[User](localL1, redisL2With(src),
    twolevel.WithBus[User](twolevel.NewBus(rdb, "evict:user")))
_ = tlc.Start(ctx)   // 启动订阅循环
defer tlc.Close(ctx)
```

- 它实现 `CacheAside[T]`——直接放进 `cached.NewRepository` 的工厂，cached 写路径的
  失效会自动「双删两级 + 广播全部实例」
- Del **先远端后本地**（反序会让本地旧值活过整个 L1 TTL）；SetWithTTL 显式 TTL
  同时作用于两层；null 防穿透完全委托 L2 marker
- 只广播失效、不广播回填；发布 best-effort（远端实例 TTL 兜底）

## 务必知道的语义边界

> [!WARNING] 五条纪律
> > 1. **模式是 Cache-Aside（写后删缓存），不是双写**——删缓存 + TTL 兜底自愈，
> >    双写有部分失败与并发覆盖两类无法根治的不一致
> > 2. **TTL 必须为有限值**——它是失效失败时的唯一安全网；两级缓存场景禁止 TTL=0
> >    （丢一条广播即无界陈旧）
> > 3. **返回值一律只读**——缓存命中返回的是后端持有的引用（LocalCache 零拷贝），
> >    改写会污染缓存并与并发读构成 data race
> > 4. **失效是 best-effort**——写库成功后删缓存失败不回滚写，错误走 `WithOnError` 上报
> > 5. **并发回填存在窗口期竞态**（miss→回源旧值→并发写→回填旧值），cache-aside 固有，
> >    由 TTL 兜底

## 依赖版本

- `github.com/oekit/data` ≥ **v0.8.1**（MGet 快路径、Bus ctx 取消契约、bloom 降级门）
- 配套：pkg ≥ v0.6.0（BatchGetter）、redisx ≥ v0.7.0（RedisCache.MGet 管道化）
