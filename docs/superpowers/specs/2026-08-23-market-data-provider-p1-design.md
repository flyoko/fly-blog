# 市场数据 Provider P1 设计

- 日期：2026-08-23
- 基线：`feature/market-radar-p0` 隔离 worktree
- 上游设计：`docs/superpowers/specs/2026-08-23-market-radar-finance-aggregation-design.md`
- 范围：三大指数、市场宽度、行业/概念资金、统一质量语义、Cloudflare 远端出口验证
- 非目标：Level2、逐笔/盘口、全市场分钟 K、自动交易、复杂回测、持仓账本、Python Worker

## 1. 为什么 P1 先做数据层

P0 已经完成 `/market` 黑金终端骨架与财经多源链路，但指数、市场宽度、板块/概念资金仍是显式 Provider Gate。下一阶段不能先填 UI 数字，再倒推数据源；必须先证明 Cloudflare Worker 能稳定访问候选源，并把失败语义固化为 `degraded/stale/unavailable`。

P1 的核心原则：

1. **没有真实数据就显示 unavailable，不允许 prototype、随机数或静态“看起来像行情”的数字。**
2. **Cloudflare 远端可达性是生产准入条件，本机 curl/Node 成功只能作为开发证据。**
3. **Provider 与 UI 解耦。** `/market` 只读取本站 `/api/market/*`，不直接请求第三方。
4. **最后成功快照可用，但必须明确 stale。**
5. **不把全市场 Tick/分钟 K 写进 D1。** D1 只存每天最终/最近一次市场快照与板块日快照。
6. **不新增 Cron。** 复用现有 `*/5 * * * *` 调度，通过 Queue 增加 `market-sync` job。

## 2. P1 能力边界

### 2.1 三大指数

固定输出：

- 上证指数 `000001`
- 深证成指 `399001`
- 创业板指 `399006`

字段：

```ts
interface MarketIndexQuote {
  code: '000001' | '399001' | '399006'
  name: string
  value: number
  change: number
  changePct: number
  turnover?: number | null
  marketAt: string
}
```

P1 不增加可配置任意指数列表，避免扩张成完整行情终端。

### 2.2 市场宽度

输出：

```ts
interface MarketBreadth {
  advancing: number
  declining: number
  flat: number
  total: number
  limitUp?: number | null
  limitDown?: number | null
  marketAt: string
}
```

市场宽度只做 A 股整体温度，不做每个行业内部宽度。

### 2.3 行业/概念资金

P1 同时支持：

- `industry`
- `concept`

单条当前快照：

```ts
interface SectorFlowQuote {
  code: string
  name: string
  kind: 'industry' | 'concept'
  changePct: number | null
  mainNetInflow: number | null
  mainNetInflowRatio: number | null
  leaderStockCode: string | null
  leaderStockName: string | null
  marketAt: string
}
```

历史聚合只基于本站已经成功写入 D1 的日快照计算 `1/3/5/10/20` 日累计，不为“凑够 20 天”回填虚构历史。

```ts
interface SectorFlowWindow {
  days: 1 | 3 | 5 | 10 | 20
  netInflow: number | null
  availableDays: number
  complete: boolean
}
```

刚上线时 20 日窗口可能 `availableDays < 20`，UI 必须展示“数据积累中”，不能把部分窗口冒充完整 20 日。

## 3. Provider 策略

所有第三方端点都被视为**候选数据源**，只有通过 Cloudflare 远端探针后才能标记为 production-ready。

### 3.1 指数候选

主候选：东方财富 `push2` 指数列表接口，一次请求取三大指数。

- Host A：`push2.eastmoney.com`
- Host B：`push2delay.eastmoney.com`

两个 host 使用同一解析器，Host B 只作为 Host A 网络/5xx 回退，不被当成独立供应商。

P1 暂不把新浪/腾讯指数接口加入默认链路。原因：需要新增 GBK/文本协议解析，但不能提高行业/概念资金的可用性；先验证 EastMoney 单一协议是否足够，再决定是否增加独立报价源。

### 3.2 市场宽度候选

主候选：东方财富 `push2ex` 涨跌分布接口，单请求返回分布桶，聚合为上涨/下跌/平盘/涨停/跌停家数。

P1 **不**在公开请求路径中使用“下载 5000+ 全市场行情再本地统计”作为兜底：这会放大 Worker CPU、响应体、上游压力和 Free 计划风险。`push2ex` 失败时优先返回最后成功快照；无快照则 `unavailable`。

### 3.3 行业/概念资金候选

主候选：东方财富 `push2` 板块资金排行。

- 行业：`fs=m:90+t:2`
- 概念：`fs=m:90+t:3`
- 主排序字段：主力净流入
- Host A：`push2.eastmoney.com`
- Host B：`push2delay.eastmoney.com`

P1 不把同花顺网页抓取加入 Worker：其即时资金链路依赖反爬/v-code，不适合作为 Cloudflare Worker 的稳定基础。

东方财富 `datacenter` 历史行业资金报表只作为后续 GitHub Actions/P2 回填候选，不进入 P1 实时请求链路。概念历史统一依赖本站上线后的 D1 日快照积累，保持行业/概念口径一致。

### 3.4 为什么不承诺单源稳定

2026 年 6–7 月仍有公开 AKShare issue 报告 `push2.eastmoney.com` 的资金流接口出现 `RemoteDisconnected`、ProxyError 和空字段。P1 因此把“Provider 能解析”与“Provider 生产可用”分开：

- 解析测试通过 != 生产可用。
- 本机访问通过 != Cloudflare 可用。
- Cloudflare 单次访问通过 != 稳定生产源。

远端探针必须记录成功率、延迟、HTTP 状态与空数据率。

## 4. 统一数据质量合同

新增共享类型：

```ts
type MarketDataQuality = 'live' | 'degraded' | 'stale' | 'unavailable'

interface MarketSourceRef {
  sourceId: string
  sourceName: string
  endpoint: string
}

interface MarketEnvelope<T> {
  data: T | null
  source: MarketSourceRef[]
  fetchedAt: string | null
  marketAt: string | null
  stale: boolean
  staleAgeMs: number | null
  quality: MarketDataQuality
}
```

规则：

- `live`：当前请求所有必需能力由实时 Provider 成功取得。
- `degraded`：部分能力实时成功，部分使用最后成功快照；数据仍可用。
- `stale`：本次实时 Provider 全失败，但 D1 有最后成功快照。
- `unavailable`：实时 Provider 失败且 D1 没有可信快照。

`staleAgeMs` 只按 `marketAt/fetchedAt` 与服务器当前时间计算，不根据 UI 自己猜测。

## 5. Worker 文件结构

新增：

```text
shared/market.ts
workers/api/src/features/market/contracts.ts
workers/api/src/features/market/eastmoney.ts
workers/api/src/features/market/service.ts
workers/api/src/features/market/routes.ts
workers/api/test/market-eastmoney.spec.ts
workers/api/test/market.spec.ts
workers/api/migrations/0014_market_data.sql
```

职责：

- `shared/market.ts`：浏览器/API 共用 DTO。
- `contracts.ts`：Provider interface、内部 source result、交易时间辅助函数。
- `eastmoney.ts`：纯解析 + fetch Adapter，只负责第三方协议。
- `service.ts`：实时组合、D1 last-good、质量判定、日快照、滚动累计。
- `routes.ts`：参数校验和 public HTTP contract。
- `market-eastmoney.spec.ts`：第三方 fixture/超时/host fallback 测试。
- `market.spec.ts`：D1、质量状态、API、调度语义测试。

不把 Provider 代码写进 `/market/index.vue`。

## 6. D1 设计

迁移：`workers/api/migrations/0014_market_data.sql`

### 6.1 `market_source_health`

```sql
CREATE TABLE market_source_health (
  capability TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (capability, source_id)
);
```

`capability` 取值：

- `indices`
- `breadth`
- `sector-industry`
- `sector-concept`

错误摘要最多 500 字符，不记录响应头、Cookie、Secret。

### 6.2 `market_daily_snapshot`

每天最多一行，盘中 upsert 当前日最后成功状态：

```sql
CREATE TABLE market_daily_snapshot (
  trade_date TEXT PRIMARY KEY,
  market_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  indices_json TEXT,
  breadth_json TEXT,
  sources_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

不保存分钟历史；同一天只更新这一行。

### 6.3 `market_sector_flow_daily`

```sql
CREATE TABLE market_sector_flow_daily (
  trade_date TEXT NOT NULL,
  sector_kind TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  sector_name TEXT NOT NULL,
  change_pct REAL,
  main_net_inflow REAL,
  main_net_inflow_ratio REAL,
  leader_stock_code TEXT,
  leader_stock_name TEXT,
  market_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, sector_kind, sector_code)
);
```

即使 `main_net_inflow` 为空也允许保存该板块元信息；排行时默认把无法比较的空资金行放到末尾，不把 `-` 转成 0。

## 7. 服务行为

### 7.1 Public overview

`GET /api/market/overview`

流程：

1. 并发请求 `indices` 与 `breadth` Provider。
2. 每个 capability 单独记录 health。
3. 成功结果直接返回。
4. 单能力失败时尝试从 `market_daily_snapshot` 补该能力并返回 `degraded`。
5. 两者都失败且有快照时返回 `stale`。
6. 无快照时返回 `unavailable`，HTTP 仍为 200，避免前端把“数据暂不可用”误当本站服务崩溃。

Public route 不写分钟历史。

### 7.2 Public sector flows

`GET /api/market/sector-flows?kind=industry&limit=20`

- `kind` 只允许 `industry|concept`。
- `limit` 范围 `1..50`。
- 当前 Provider 成功时返回当前排名。
- Provider 失败时读取 D1 最近交易日快照并返回 `stale`。
- 无快照时 `unavailable`。
- 每行附带基于 D1 已有日数据计算的 `1/3/5/10/20` 日累计；不足完整窗口时 `complete=false`。

### 7.3 Scheduled sync

现有 `*/5 * * * *` 增加 `market-sync`：

```text
news-sync
finance-sync
market-sync
```

`MarketService.syncScheduled()`：

- 北京时间周一至周五才进入市场时间判断。
- 09:20–11:35、12:55–15:15 执行实时同步。
- 其他时间返回 `skipped`，不请求第三方。
- 中国法定休市日在 P1 不维护硬编码年历；如果工作日休市，Provider 返回的 `marketAt` 不更新时不会生成“新交易日”假数据。P2 再加入交易日历源。

一次 market-sync：

1. 指数 + 宽度并发。
2. 行业 + 概念资金并发。
3. 成功能力独立落 D1。
4. 单能力失败不回滚其他能力。
5. 全部失败时 job 可以完成但 health 记录 failed；只有基础设施/数据库错误才抛出让 Queue 重试。

## 8. `/market` P1 UI

只替换 P0 中三个明确占位能力：

### 8.1 指数/市场宽度

有数据：

- 上证、深证、创业板：点位、涨跌幅。
- 市场宽度：上涨/下跌/平盘家数。
- 红涨绿跌。
- `stale/degraded` 显示小型质量标签与更新时间。

无数据：保留 P0 的“行情源远端验收后开放/暂不可用”语义，不填静态数字。

### 8.2 板块资金

资金工作区展示：

- 行业/概念切换。
- 今日主力净流入排行。
- 1/3/5/10/20 日累计列。
- 不完整窗口显示 `x/20 日` 或“积累中”。
- 金色用于选中/主线，不用于涨跌。

### 8.3 今日主线

P1 可把“财经 topic 主线”和“资金流前列板块”并列展示，但不得把两者自动混成一个未经验证的 AI 结论。

## 9. 缓存与上游保护

- Provider 单请求超时：`2500ms`；Host fallback 总预算不超过 `5000ms`。
- public overview 页面轮询：`60s`。
- public sector flow 页面轮询：`60s`，只有资金工作区激活时请求。
- 同一 Worker isolate 内可以做 15–20 秒 promise/cache 去重作为优化，但正确性不得依赖 isolate 常驻。
- D1 last-good 是跨 isolate 的可信回退。
- 不在 P1 做每 5 秒或 Tick 级轮询。

## 10. Cloudflare 远端出口探针

远端验证优先使用**非生产持久部署**方式：

1. 首选 `wrangler dev --remote`/Cloudflare remote dev 运行同一 Adapter。
2. 如果 remote dev 无法覆盖目标请求，再建立独立临时 probe Worker，名字必须与 `fly-living-api` 不同，测试后删除。
3. 不修改生产 `fly-living-api`，不写正式 D1。

每个 capability 至少记录：

```text
source_id
capability
attempts
successes
empty_responses
http_4xx
http_5xx
network_errors
p50_ms
p95_ms
last_error
```

本轮即时门禁：

- 至少 20 次远端请求样本。
- 指数成功率 >= 95% 才允许本地 UI 接线；正式生产准入仍沿用总体设计的 >=99% / 5 个交易日标准。
- 板块资金即时样本成功率 >= 90% 才允许本地 UI 接线；正式生产准入仍为 >=98% / 5 个交易日。
- P95 < 3000ms。
- 任何 HTML/验证码/空 `data` 都计失败。

若即时门禁不通过：

- Provider 保留在代码和测试中但标为 `candidate`。
- `/market` 对该 capability 继续显示 unavailable。
- 不用“本机能访问”替代 Cloudflare 证据。

## 11. 测试要求

### Provider fixture

必须覆盖：

- 正常指数 payload。
- 缺字段/`data=null`。
- `'-'`、`null` 等板块资金空值。
- Host A 网络失败 → Host B 成功。
- 两 host 都失败。
- HTTP 4xx/5xx。
- 超时。
- 涨跌分布桶解析。

### Service/D1

必须覆盖：

- live。
- partial success → degraded。
- all failed + snapshot → stale。
- all failed + no snapshot → unavailable。
- 行业失败不删除概念快照，反之亦然。
- 同日 sector upsert 不产生重复行。
- 3/5/10/20 日累计 `availableDays/complete` 正确。
- 盘外 scheduled sync 不请求上游。

### UI

必须覆盖：

- 没数据不出现任何模拟指数/资金数字。
- stale/degraded 标签。
- 390px 无页面级横向溢出。
- 资金表自身可横向滚动但 `documentElement` 不横向滚动。
- light/dark/dynamic 下黑金局部域仍稳定。
- SPA 离开 `/market` 无样式残留。

## 12. 完成定义

P1 本地实现完成必须同时满足：

1. 真实 Provider contract + tests。
2. D1 migration + last-good 语义。
3. `/api/market/overview` 与 `/api/market/sector-flows`。
4. `/market` 只展示真实或 stale 数据，不展示模拟值。
5. Cloudflare 远端探针有证据；未通过源不会启用。
6. `pnpm verify`、Worker `wrangler deploy --dry-run`、浏览器验收通过。
7. 不 commit、不 push、不部署生产。
