---
last_verified_commit: 82b43997cf1a097b6a682c2052c223135dbb3398
---

# 不要让统计 Cookie 绕过公共缓存

## 问题特征

公开页面会自动写入访问统计 Cookie，随后同源公共 API 在真实浏览器里全部显示 `X-Fly-Cache: BYPASS`。接口直连测试可能经常是 200，但页面运行一段时间后会出现间歇性 5xx、加载明显变慢，多个独立公共接口还可能在同一轮一起失败。

这种故障很容易被误判为数据源不稳定、API Worker 宕机或某个新接口写坏，因为不带 Cookie 的命令行探针能够正常命中缓存，而真实浏览器天然携带统计 Cookie。

## 非显然根因

公共缓存 helper 把“存在任意 Cookie”等价成“请求包含用户状态”。但 analytics Cookie 只用于访问统计，并不会改变市场、财经、天气等公共响应内容。

一旦把它们也视为有状态 Cookie，所有正常访客都会绕过 Workers Cache，迫使每次请求重新执行 D1 查询甚至访问外部数据源。公共页面的自动统计能力因此反向放大上游延迟和故障率。

## 可执行规则

1. 公共缓存判定必须区分“缓存中性 Cookie”和“会改变响应语义的状态 Cookie”，禁止使用 `if (cookieHeader) BYPASS` 这类粗粒度规则。
2. 缓存中性 Cookie 必须采用显式白名单；当前仅允许 `fly_analytics_visitor` 与 `fly_analytics_session`。任何未知 Cookie 默认继续 BYPASS。
3. `Authorization`、管理员会话、CSRF、访客去重等可能影响身份或响应内容的状态必须始终绕过公共缓存。
4. 新增站点 Cookie 时，必须同时评估它是否会改变公共 API 响应；如果不会，也不能自动加入缓存中性白名单，必须有测试和审查证据。
5. 公共缓存回归测试至少覆盖：仅 analytics Cookie 的 `MISS -> HIT`、状态 Cookie 连续 `BYPASS`、Authorization `BYPASS`。
6. 生产故障排查公共接口时，既要测无 Cookie 直连，也要用真实浏览器或带实际站点 Cookie 的请求检查 `X-Fly-Cache`，避免只验证理想路径。

## 诊断步骤

- 在真实页面中捕获公共接口的 `X-Fly-Cache`、响应时间和 5xx 分布。
- 对比无 Cookie、仅 analytics Cookie、管理员/状态 Cookie 三种请求。
- 若仅 analytics Cookie 就触发 BYPASS，优先检查公共缓存 credential/cookie 判定。
- 查看多个接口是否同时变慢或失败；如果它们共享同一个缓存 helper，先排查公共层而不是逐个改 Provider。
- 修复后再次用新浏览器确认统计 Cookie 已存在，同时公共请求能够进入 MISS/HIT。

## 不适用场景

- Cookie 会影响语言、权限、个性化、点赞状态、访客去重或任何响应字段时，它不是缓存中性 Cookie，不能复用该规则直接缓存。
- 私有 API、管理员 API、写请求和携带 Authorization 的请求不应为了性能套用本规则。
- 如果响应本身通过 `Vary` 或独立 cache key 明确按 Cookie 内容安全分片，应按该接口合同设计，而不是简单套用 analytics 白名单。

## 证据

提交 `82b43997cf1a097b6a682c2052c223135dbb3398` 将两枚 analytics Cookie 从公共缓存的有状态判定中排除，同时保留未知 Cookie、管理员会话、瞬间访客 Cookie 与 Authorization 的 BYPASS 语义，并新增红绿回归测试。生产修复前真实浏览器曾捕获 `/api/finance/flash`、`/api/finance/themes/today`、`/api/market/sector-flows` 成组 502，且 analytics Cookie 请求长期为 `X-Fly-Cache: BYPASS`。
