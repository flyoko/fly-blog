# 自选股雷达 P2A 设计

- 日期：2026-08-23
- 基线：`feature/market-radar-p0` 隔离 worktree
- 上游设计：`docs/superpowers/specs/2026-08-23-market-data-provider-p1-design.md`
- 范围：最多 30 只私有自选股、批量实时报价、5 分钟真实快照、单股质量降级、`/market` 自选工作区
- 非目标：全市场扫描、分钟 K/逐笔、Level2、持仓账本、成本价、自动交易、RSI/MACD/KDJ、复杂 T 信号、完整行业/概念映射

## 1. 背景与目标

P0/P1 已经完成 `/market` 黑金终端骨架、财经多源、三大指数、市场宽度、行业/概念资金以及统一 `live/degraded/stale/unavailable` 质量语义。当前“自选”工作区仍是占位状态。

P2A 的目标不是把博客扩成完整证券行情站，而是解决一个更小且更有价值的问题：

> 对最多 30 只用户主动关注的 A 股，在打开 `/market` 自选工作区时快速看到当前真实行情、与关注价的距离、数据质量和最近相关事件；同时以低成本保存 5 分钟真实快照，为后续 P2B 盘中异常/T 信号提供可靠基线。

核心原则：

1. **只扫描自选，不扫描全 A 股。** 上限硬限制为 30 只。
2. **自选是私有数据。** 不通过公开 `/api/market/*` 暴露。
3. **页面实时读与后台历史写分离。** 页面 45 秒级刷新不制造 D1 写放大；只有 5 分钟后台任务写历史快照。
4. **单股独立降级。** 1 只缺失不能拖垮其余 29 只。
5. **没有真实报价就显示 stale/unavailable。** 不允许静态示例值、随机数或模拟行情混入真实 UI。
6. **复用 P1 质量模型和交易时间语义。** 不创建第二套行情状态定义。
7. **P2A 与 P2B 分离。** P2A 只负责可靠数据与雷达展示，不提前实现异常放量、突破、T 信号。

## 2. 方案选择

比较过三条路线：

### 2.1 方案 A：纯 5 分钟后台快照

- `*/5` 任务获取自选报价并写 D1。
- 页面只读取 D1。
- 优点：稳定、上游请求少。
- 缺点：盘中查看最多滞后约 5 分钟，不适合作为“现在值得看什么”的入口。

### 2.2 方案 B：页面按需批量报价 + 5 分钟后台快照（采用）

- 页面进入自选工作区后，对 0–30 股执行单批或极少批请求。
- 页面可见且自选工作区活跃时默认每 45 秒刷新。
- 现有 `*/5` Queue 另行写入 5 分钟真实快照。
- 实时报价失败时使用对应股票最后成功快照并标记 stale；无快照则 unavailable。
- 优点：盘中体验和成本平衡最好，且直接为 P2B 留下可靠历史。

### 2.3 方案 C：纯页面实时

- 只有页面打开时请求报价，不保存后台历史。
- 优点：最轻。
- 缺点：P2B 需要连续 5 分钟基线时必须再次重构。

结论：采用方案 B。

## 3. 架构与私有边界

```text
/market 自选工作区
        │
        │ 登录态
        ▼
Private Market BFF
/api/admin/market/watchlist/*
        │
        ├── watchlist CRUD
        ├── batch quote
        └── last-good snapshot
        │
        ▼
D1
├── market_watchlist
├── market_watchlist_quote_5m
└── market_source_health（复用/扩展 capability）

页面打开
└── 每 45 秒 → Worker 批量查询最多 30 股
                     │
                     ├── 成功 → 直接返回 live
                     └── 缺失/失败 → D1 last-good → stale/unavailable

现有 */5 Queue
└── market-watchlist-sync
        └── 仅扫描当前私有自选 0–30 股
             └── 写 5 分钟真实快照
```

私有边界：

- 所有自选配置和自选报价聚合接口都要求有效 Session。
- GET 响应使用 `Cache-Control: private, no-store`，不得进入公共 Cache API。
- 写操作继续使用现有 `requireSession + requireCsrf + write rate-limit`。
- 自选列表、备注、关注价、标签不得出现在公开 API、静态生成 payload、公开日志或 URL query 中。
- P2A 不保存持仓数量、仓位、市值、买入成本等账户级敏感投资信息。
- P2A 明确是**单管理员自选雷达**，不是多租户行情服务。数据库仍以 `owner_id = session.id` 做隔离，避免身份变化时数据串用，但这不代表 P2A 承诺支持多个用户各 30 只。
- 后台调度对所有 enabled watchlist 行执行**全局 30 只硬门禁**；如果异常数据导致总数超过 30，任务 fail-closed 并记录健康错误，不扩张成多用户/全市场扫描。未来若要支持多用户，必须重新做 Provider、Queue 与 D1 预算设计。

## 4. 股票身份模型

数据库内部不使用第三方 Provider 编码作为主身份，而使用本站标准股票身份：

```ts
type StockExchange = 'SSE' | 'SZSE' | 'BSE'

type StockSymbol = `${StockExchange}:${string}`

interface StockIdentity {
  symbol: StockSymbol
  exchange: StockExchange
  code: string
  name: string
}
```

示例：

- `SSE:600519`
- `SZSE:300308`

第三方适配器自行完成本站标准身份到上游身份的转换，例如 `SZSE:300308 -> 0.300308`。数据库不持久化东方财富等供应商的专有 secid 作为业务主键。

新增自选流程：

```text
用户输入股票代码
  ↓
服务端 normalize
  ↓
交易所/代码格式校验
  ↓
Provider 验证股票存在
  ↓
从可信返回中取得股票名称
  ↓
写入 watchlist
```

浏览器提交的 `stock_name` 不作为可信事实来源。

## 5. 自选配置模型

P2A 私有配置字段：

```ts
interface WatchlistItem {
  symbol: StockSymbol
  code: string
  exchange: StockExchange
  name: string
  sortOrder: number
  note: string | null
  attentionPrice: number | null
  tags: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}
```

字段语义：

- `attentionPrice` 是用户主动设置的“关注价”，不是成本价。
- `note` 只用于个人观察备注。
- `tags` 是用户自定义轻量标签，例如 `CPO`、`铜`、`半导体`。
- P2A 不为了显示行业/概念而新增第三套分类数据源；自动行业/概念归属延后。

服务端约束：

- P2A 总自选条目最多 30 只，`enabled=false` 也计入上限；disabled 只表示暂不参与报价/后台同步，不是绕过容量限制的手段。
- `attentionPrice` 为 `null` 或大于 0 的有限数值。
- `note`、tag 数量、单 tag 长度均设置有限上限，防止 D1/响应体滥用。
- `sortOrder` 由服务端规范化，不能依赖前端提供任意大整数维持顺序。

## 6. 实时报价合同

P2A 强制字段：

```ts
interface StockQuote {
  symbol: StockSymbol
  code: string
  name: string
  price: number
  change: number
  changePct: number
  open: number | null
  high: number | null
  low: number | null
  previousClose: number | null
  volume: number | null
  turnover: number | null
  turnoverRate: number | null
  marketAt: string
}
```

解析规则：

- `price/change/changePct/marketAt` 是有效实时报价的核心字段；缺失时该股票不能标记为 live。
- `open/high/low/previousClose/volume/turnover/turnoverRate` 可为 `null`。
- 上游的 `'-'`、空字符串、`null`、非法数字保持 `null`，绝不转换为 0。
- `marketAt` 必须来自可信行情时间；不能把浏览器/Worker `fetchedAt` 冒充交易所行情时间。

本站派生字段由 Service/UI 计算，不由 Provider 生成业务判断：

```text
距关注价 = (price - attentionPrice) / attentionPrice
日内位置 = price 在 low..high 区间的位置
```

P2A 不将量比列为强制字段。量比需要一致的历史/盘中基线，留到 P2B 基于本站 5 分钟数据统一计算。

## 7. Provider 边界

P1 的 `EastMoneyMarketProvider` 继续负责指数、宽度和板块资金。P2A 新增独立个股报价抽象：

```ts
interface StockQuoteProvider {
  fetchQuotes(symbols: StockSymbol[]): Promise<StockQuoteProviderResult>
}
```

首个候选实现：`EastMoneyStockQuoteProvider`。

硬性要求：

1. 0 只时不上游请求。
2. 1–30 只必须使用批量行情请求；正常刷新不能一股一 fetch。
3. 正常单次刷新目标上游请求数为 1；主 Host 失败时最多增加一次 fallback。
4. HTTP 200 但 payload 无效/空数据也视为该 Host 失败并尝试 fallback。
5. Parser 必须在每个 Host attempt 内执行，复用 P1 已验证的 fallback 语义。
6. Provider 返回可用股票集合和缺失股票集合，不把部分缺失折叠成“整个批次失败”。

示意结果：

```ts
interface StockQuoteProviderResult {
  quotes: Map<StockSymbol, StockQuote>
  missing: StockSymbol[]
  source: MarketSourceRef
  fetchedAt: string
  latencyMs: number
}
```

## 8. 单股质量与整体质量

单股状态：

```ts
type WatchlistItemQuality = 'live' | 'stale' | 'unavailable'

interface WatchlistRadarItem {
  watchlist: WatchlistItem
  quote: StockQuote | null
  quality: WatchlistItemQuality
  staleAgeMs: number | null
  source: MarketSourceRef | null
}
```

规则：

- 当前批量 Provider 返回该股票有效报价：`live`。
- 当前 Provider 缺失/失败，但 D1 有该股票最后成功真实快照：`stale`。
- 当前 Provider 无有效报价且 D1 无可信快照：`unavailable`。

外层聚合继续使用 P1 `MarketDataQuality`：

- 全部有效项目 live：`live`。
- live 与 stale/unavailable 混合：`degraded`。
- 所有可展示项目都只能使用 last-good：`stale`。
- 所有项目均无可信报价：`unavailable`。
- 空自选列表不是上游故障，返回空 `items`，UI 显示空状态；不冒充 unavailable。

## 9. D1 设计

### 9.1 `market_watchlist`

```sql
CREATE TABLE market_watchlist (
  owner_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  attention_price REAL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, symbol)
);
```

30 只上限在 Service 事务/写路径做服务端校验，不能只依赖前端 disabled 按钮。

### 9.2 `market_watchlist_quote_5m`

```sql
CREATE TABLE market_watchlist_quote_5m (
  owner_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bucket_at TEXT NOT NULL,
  market_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  price REAL NOT NULL,
  change_value REAL NOT NULL,
  change_pct REAL NOT NULL,
  open_price REAL,
  high_price REAL,
  low_price REAL,
  previous_close REAL,
  volume REAL,
  turnover REAL,
  turnover_rate REAL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, symbol, bucket_at)
);
```

`bucket_at` 是本站按交易时区归一的 5 分钟桶，`market_at` 保留真实行情时间。

规模预算：30 股 × 约 48 个 5 分钟桶/交易日 ≈ 1440 行/交易日；20 个交易日约 2.9 万行，属于可接受的 D1 规模。

P2A 不保存页面 45 秒轮询产生的每次报价历史，防止无价值写放大。

### 9.3 Source health

优先复用 P1 `market_source_health`，新增 capability，例如：

- `stock-quotes`
- `watchlist-sync`

只记录成功/失败、item count、latency、最近成功时间和截断错误摘要；不得记录 Cookie、Session、Secret、完整响应体或完整私人自选列表。

## 10. 页面实时数据流

```text
用户进入 /market → 自选
        ↓
确认登录态
        ↓
GET /api/admin/market/watchlist/quotes
        ↓
读取该 owner 的 0–30 自选
        ↓
批量 Provider 实时取价
        ↓
逐股合并 D1 last-good
        ↓
返回 items + 聚合 quality
```

页面实时成功时默认**不写** `market_watchlist_quote_5m`。历史只由后台 5 分钟 job 负责。

原因：

- 页面 45 秒刷新如果同步写 D1，会把“用户打开页面多久”与历史密度耦合。
- 多标签页会产生重复历史写。
- 后续 P2B 需要的是规则稳定的 5 分钟时间序列，而不是不均匀的页面访问采样。

## 11. 后台 5 分钟数据流

复用现有 `*/5 * * * *` 调度，不新增 Cron trigger：

```text
*/5 Cron
  ↓
Queue jobs
  ├── news-sync
  ├── finance-sync
  ├── market-sync
  └── market-watchlist-sync
          ↓
    交易窗口门禁
          ↓
    读取最多 30 自选
          ↓
    一次批量报价
          ↓
    按股票写入 quote_5m
```

规则：

- 非 A 股交易窗口：0 upstream fetch。
- 空自选：0 upstream fetch。
- 单股缺失不阻止其他股票快照写入。
- Provider 整体失败不写虚假 bucket；保留此前真实快照。
- 数据库基础设施错误可以失败并由调度日志/健康状态暴露，不把 DB 错误伪装成行情 stale。

## 12. Private API

所有路由位于登录态命名空间，不加入公开 `/api/market/*`：

| Method | Path | 用途 |
|---|---|---|
| `GET` | `/api/admin/market/watchlist` | 获取私人自选配置 |
| `POST` | `/api/admin/market/watchlist` | 新增并验证股票 |
| `PATCH` | `/api/admin/market/watchlist/:symbol` | 修改关注价、备注、标签、enabled 等 |
| `DELETE` | `/api/admin/market/watchlist/:symbol` | 删除自选 |
| `GET` | `/api/admin/market/watchlist/quotes` | 获取自选 + 当前/last-good 报价 |

安全策略：

- 整个 admin market route 使用 `requireSession`。
- POST/PATCH/DELETE 使用 `requireCsrf` 与现有 write rate limiter。
- quote GET 使用独立 read rate limiter，目标允许约 4–6 req/min/session；正常 45 秒轮询约 1.33 req/min，保留手动刷新余量。
- 响应使用 `private, no-store`。
- symbol route 参数严格 parse/normalize，不直接拼入上游 URL。

## 13. 页面刷新策略

默认轮询：45 秒。

生命周期：

- 进入“自选”工作区且页面可见：立即刷新一次，然后每 45 秒。
- 切到雷达/资金/信号/策略：停止轮询。
- `document.visibilityState !== 'visible'`：停止自动轮询。
- 回到可见状态并仍处于自选工作区：立即刷新一次，随后恢复 45 秒。
- 正常盘外：停止持续 45 秒 upstream 轮询，展示最后交易时间/last-good；允许用户手动刷新。
- 上一轮请求未结束：不启动新一轮，避免叠加。
- 离开工作区时使用 `AbortController` 中止未完成请求。

## 14. `/market` 自选工作区 UI

视觉方向沿用 `/market` 独立黑金证券终端主题，不改变博客其他页面主题。

### 14.1 Desktop

顶部：

- 标题 `自选雷达`。
- tabs：`雷达 / 资金 / 自选 / 信号 / 策略`，自选高亮。
- `私有自选 · 最多30只`。
- `自动刷新 45s` 与手动刷新按钮。

摘要区：

- 最新市场上下文：三大指数/市场宽度沿用 P1 数据。
- 数据质量：统计当前自选 `LIVE / STALE / UNAVAILABLE` 数量。
- 整体状态：`LIVE / DEGRADED / STALE / UNAVAILABLE`，附简短解释。

主体使用高信息密度表格：

| 股票 | 现价 | 涨跌幅 | 日内高低 | 成交额 | 距关注价 | 状态 |
|---|---:|---:|---|---:|---:|---|

交互：

- A 股红涨绿跌。
- 日内高低使用轻量 range bar，不引入完整 K 线。
- `距关注价` 同时显示绝对值/百分比；未设置关注价时显示 `--`。
- 交易时段内，单股状态 pill 明确显示 `LIVE`、`STALE · Xm`、`UNAVAILABLE`；收盘后不继续使用 `LIVE` 作为用户可见文案，改为 `已收盘 · HH:mm` / `最近行情`，但后台仍保留质量字段用于区分“成功取得最后行情”和“Provider 故障”。
- 排序默认使用用户自定义顺序；允许切换涨跌幅、距关注价、成交额等纯前端排序，但不自动覆盖 `sortOrder`。

右侧辅助区：

- `最近相关事件`：复用本站财经数据做股票名/代码/用户 tag 的轻量关联；没有可信关联就显示空状态，不伪造事件。
- `关注设置`：显示关注价规则、备注、tags 入口。

底部固定提示：

> 无真实报价时显示 unavailable / last-good，不生成模拟行情。

### 14.2 Mobile

移动端改为单列股票卡片，不强行压缩 Desktop 表格。

每张卡显示：

- 股票名称 + 代码。
- 当前价、涨跌幅。
- 距关注价。
- 日内 high-low range bar。
- 成交额。
- `LIVE / STALE / UNAVAILABLE` 状态。

顶部保留紧凑质量条：

- `质量：Degraded` 等聚合状态。
- 最后更新时间。
- live/stale/unavailable 数量。

相关事件放在股票卡列表之后。触控目标保持可用，不依赖横向页面滚动。

## 15. 空状态、错误与降级

必须明确区分：

### 15.1 未登录

公开 `/market` 页面可以存在，但自选工作区不调用私人数据接口，只显示登录入口和说明：

> 自选雷达 · 私有。登录后查看你的 0–30 只自选股。

### 15.2 已登录但 0 只自选

显示空状态和“添加自选”入口；不是 `unavailable`。

### 15.3 部分股票 Provider 缺失

其余股票继续 live；缺失股票使用 last-good 或 unavailable；外层 quality 为 degraded。

### 15.4 Provider 全失败

- 有历史：逐股 stale，聚合 stale。
- 无历史：unavailable。

### 15.5 盘外

显示最后可信交易时间，不使用“实时”字样误导用户。盘外 last-good 不等同于网络故障；UI 可使用“最近行情/已收盘”等时间上下文，但数据质量仍基于真实来源和历史状态计算。

### 15.6 D1/内部错误

私有 API 返回明确服务错误，不把数据库故障包装成行情 stale。错误日志只记录 requestId、capability、计数和安全错误摘要。

## 16. Cloudflare Remote Provider Gate

P2A 在 UI 接真实报价前，必须先用 Cloudflare 真实 Worker 出口验证“30 股批量报价”。本机 curl/Node 成功不作为生产准入证据。

Instant Gate：

| 指标 | 门槛 |
|---|---:|
| 批量请求成功率 | `>= 95%` |
| 有效股票返回率 | `>= 99%` |
| P95 | `< 2500ms` |
| 正常 30 股刷新上游请求数 | `1` |
| 主 Host 故障后的最大请求数 | `2` |
| 30 股完整批量 fixture/remote | 必须通过 |
| `- / null / missing` | 保持缺失语义，禁止转 0 |
| 4xx / 5xx / timeout | 必须 fallback |
| HTTP 200 + 无效 payload | 必须 fallback |

若 Provider Gate 未通过：

- 不宣称 P2A 实时报价 production-ready。
- UI 只能展示真实 last-good 或 unavailable。
- 不使用 mock quote 规避门禁。

正式生产 SLA 观察可以在发布阶段继续补充；P2A 本地实现完成不等于已经满足连续多交易日生产稳定性。

## 17. P2A 与 P2B 边界

P2A 产出：

- 私有自选 CRUD。
- 最多 30 股批量真实报价。
- 45 秒页面按需刷新。
- 5 分钟后台真实快照。
- 单股质量/last-good。
- 自选雷达桌面/移动端展示。
- 与已有财经事件的轻量关联。

P2A 不产出：

- 异常放量信号。
- 价格突破/回撤信号。
- T 点提示。
- 自动买卖结论。
- 全市场机会扫描。

P2B 将基于 `market_watchlist_quote_5m` 做：

```text
连续 5m 快照
  ↓
成交量/成交额异常
价格突破/快速拉升/回撤
关注价接近/穿越
  ↓
T Radar Signal
```

因此 P2A 的 5 分钟存储必须保证时间语义稳定、数据真实和单股缺失可识别，但不提前加入信号判断。

## 18. 测试策略

实现阶段至少覆盖以下层次。

### 18.1 Provider 单测

- SSE/SZSE/BSE symbol 到上游编码。
- 1 股/30 股批量参数。
- 乱序返回仍正确映射 symbol。
- `-`/null/缺字段不转 0。
- 部分缺股。
- primary 4xx/5xx/timeout fallback。
- primary HTTP 200 但 payload 无效 fallback。
- fallback 也失败时安全错误摘要。
- Cloudflare `fetch` 绑定方式不触发 Illegal invocation。

### 18.2 Service/D1 单测

- 30 只上限服务端强制执行。
- owner 隔离。
- quote live/stale/unavailable 单股判定。
- 聚合 live/degraded/stale/unavailable。
- 空自选返回空状态。
- 页面实时读取不写 5m 历史。
- 5 分钟 job 正确 upsert bucket。
- 单股失败不回滚其他股票快照。
- 盘外/空自选不访问 Provider。

### 18.3 Route/Auth 测试

- 未登录无法访问私人列表/报价。
- 写请求必须 CSRF。
- quote read limiter 生效。
- admin 响应 `private, no-store`。
- 非法 symbol/attentionPrice/tag/note 拒绝。
- 第 31 只拒绝。

### 18.4 Nuxt/UI 测试

- 未登录私有占位。
- 空自选。
- mixed live/stale/unavailable。
- 无真实报价时没有示例价格。
- 关注价距离计算。
- 45 秒轮询生命周期。
- hidden tab/离开 workspace 停止轮询。
- mobile 不产生 document-level 横向溢出。
- 320/390/768/1024/1440/1728 响应式。
- reduced motion、主题隔离和 `/market -> /` SPA 清理继续符合 P1 基线。

### 18.5 远端与构建验证

- `wrangler dev --remote` 30 股 Provider probe。
- `pnpm verify`。
- Worker dry-run，不部署。
- Browser acceptance：桌面 + 移动、质量状态、SPA、console/errors。

## 19. 实施文件边界（设计级）

预计新增/修改集中在：

```text
shared/market.ts
workers/api/migrations/0015_market_watchlist.sql
workers/api/src/features/market/contracts.ts
workers/api/src/features/market/eastmoney-stock.ts
workers/api/src/features/market/watchlist-service.ts
workers/api/src/features/market/admin-routes.ts
workers/api/src/scheduled-tasks.ts
workers/api/src/index.ts
app/pages/market/index.vue
workers/api/test/market-eastmoney-stock.spec.ts
workers/api/test/market-watchlist.spec.ts
test/nuxt/market-terminal.spec.ts
```

具体文件名可在实施计划中根据现有模块大小微调，但必须保持：Provider、Service、Route、UI 各自职责清晰，不把第三方解析器或 D1 SQL 塞进 Vue 页面。

## 20. 完成定义

P2A 设计对应的实现只有同时满足以下条件才可称为完成：

1. 最多 30 只，自选只在私有登录态接口中可见。
2. 页面实时批量报价与 5 分钟后台快照职责分离。
3. 正常 30 股刷新不产生 30 次上游请求。
4. 单股可以独立 live/stale/unavailable，部分失败不拖垮全列表。
5. 无真实报价时只显示 last-good/unavailable，不生成模拟行情。
6. 页面不可见、离开自选工作区、盘外时停止不必要的持续轮询。
7. Cloudflare Remote Instant Gate 通过后才把 Provider 标记为可用。
8. P2A 不实现 P2B 的异常放量/T 信号，不做全市场扫描。
9. P0/P1 的响应式、主题隔离、质量语义、构建和无 hydration/console 错误基线不回退。
10. 本阶段不 commit、不 push、不生产部署；发布动作必须另行明确授权。
