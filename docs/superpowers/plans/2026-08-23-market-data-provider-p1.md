# Market Data Provider P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. In this conversation the user requires the current Agent to execute serially without sub-agents.

**Goal:** 在现有 `/market` P0 骨架中接入可验证的三大指数、市场宽度与行业/概念资金数据，并用 D1 last-good + Cloudflare 远端探针保证“真实或 unavailable”。

**Architecture:** 新增独立 `market` feature。Provider 只负责第三方协议，`MarketService` 负责质量状态、D1 last-good、日快照和窗口累计，Hono route 只做参数校验/公共缓存，Nuxt `/market` 只消费本站 API。复用现有 `*/5` Cron/Queue 增加 `market-sync`，不新增 Cron，不保存 Tick/分钟 K。

**Tech Stack:** TypeScript、Hono、Cloudflare Workers、D1、Queues、Vitest Workers pool、Nuxt 4/Vue 3、现有 `publicCacheData`。

## Global Constraints

- 不生成 prototype、随机或静态模拟行情；无真实数据时使用 `unavailable`。
- 不 commit、不 push、不部署生产；所有实现留在 `feature/market-radar-p0` 隔离 worktree。
- 不新增常驻服务器、Python Worker、MySQL、Element Plus。
- Provider 单 host 请求超时约 2500ms，总 host fallback 预算不超过约 5000ms。
- D1 只保存每日最近成功快照；不保存全市场 Tick/分钟 K。
- `/market` 维持 P0 黑金局部主题和红涨绿跌语义。
- Cloudflare remote probe 未通过的 capability 不能被宣称 production-ready。

---

## File Map

**Create**

- `shared/market.ts`：浏览器/API 共用 DTO 与枚举。
- `workers/api/src/features/market/contracts.ts`：Provider interface、内部结果、交易时间工具。
- `workers/api/src/features/market/eastmoney.ts`：指数、宽度、行业/概念资金 EastMoney Adapter。
- `workers/api/src/features/market/service.ts`：D1、live/degraded/stale/unavailable、scheduled sync、滚动窗口。
- `workers/api/src/features/market/routes.ts`：`/overview`、`/sector-flows`。
- `workers/api/migrations/0014_market_data.sql`：市场日快照、板块日快照、来源健康。
- `workers/api/test/market-eastmoney.spec.ts`：Provider fixture tests。
- `workers/api/test/market.spec.ts`：service/API/schedule tests。

**Modify**

- `workers/api/src/index.ts`：注册 `/api/market`。
- `workers/api/src/scheduled-tasks.ts`：新增 `market-sync`。
- `workers/api/test/scheduled.spec.ts`：更新 5 分钟 job 合同。
- `app/pages/market/index.vue`：接入 overview / sector flows，只替换 P0 占位区。
- `test/nuxt/market-terminal.spec.ts`：扩展真实/不可用数据语义合同。

---

### Task 1: Shared contracts + D1 schema

**Files:**
- Create: `shared/market.ts`
- Create: `workers/api/src/features/market/contracts.ts`
- Create: `workers/api/migrations/0014_market_data.sql`
- Test: `workers/api/test/market.spec.ts`

**Interfaces:**

```ts
export type MarketDataQuality = 'live' | 'degraded' | 'stale' | 'unavailable'
export type SectorKind = 'industry' | 'concept'
export type SectorWindowDays = 1 | 3 | 5 | 10 | 20

export interface MarketSourceRef {
  sourceId: string
  sourceName: string
  endpoint: string
}

export interface MarketEnvelope<T> {
  data: T | null
  source: MarketSourceRef[]
  fetchedAt: string | null
  marketAt: string | null
  stale: boolean
  staleAgeMs: number | null
  quality: MarketDataQuality
}
```

Internal provider contract:

```ts
export interface MarketProviderResult<T> {
  data: T
  source: MarketSourceRef
  fetchedAt: string
  marketAt: string
  latencyMs: number
}

export interface MarketDataProvider {
  fetchIndices(): Promise<MarketProviderResult<MarketIndexQuote[]>>
  fetchBreadth(): Promise<MarketProviderResult<MarketBreadth>>
  fetchSectorFlows(kind: SectorKind): Promise<MarketProviderResult<SectorFlowQuote[]>>
}
```

- [ ] **Step 1: 写失败的迁移/类型合同测试**

在 `workers/api/test/market.spec.ts` 中先断言迁移后 3 张表可查询，并断言 `isChinaMarketSyncWindow()` 对交易时间/盘外时间返回正确布尔值。

- [ ] **Step 2: 运行红灯**

Run:

```bash
pnpm --filter @fly-living/api-worker exec vitest run test/market.spec.ts
```

Expected: FAIL，原因是 market 文件/表不存在。

- [ ] **Step 3: 创建共享 DTO 与 migration**

`0014_market_data.sql` 必须创建：

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

CREATE TABLE market_daily_snapshot (
  trade_date TEXT PRIMARY KEY,
  market_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  indices_json TEXT,
  breadth_json TEXT,
  sources_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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

CREATE INDEX idx_market_sector_flow_kind_date
  ON market_sector_flow_daily (sector_kind, trade_date DESC);
```

- [ ] **Step 4: 实现交易时段函数**

`contracts.ts` 暴露：

```ts
export function shanghaiParts(date: Date): { date: string, weekday: string, minutes: number }
export function isChinaMarketSyncWindow(date: Date): boolean
```

规则：周一至周五，09:20–11:35 或 12:55–15:15，北京时间。

- [ ] **Step 5: 跑绿灯与 typecheck**

```bash
pnpm --filter @fly-living/api-worker exec vitest run test/market.spec.ts
pnpm --filter @fly-living/api-worker typecheck
```

Expected: PASS。

---

### Task 2: EastMoney Provider TDD

**Files:**
- Create: `workers/api/src/features/market/eastmoney.ts`
- Create: `workers/api/test/market-eastmoney.spec.ts`

**Interfaces:**

```ts
export type MarketFetch = typeof fetch

export class EastMoneyMarketProvider implements MarketDataProvider {
  constructor(fetchImpl?: MarketFetch, now?: () => Date)
  fetchIndices(): Promise<MarketProviderResult<MarketIndexQuote[]>>
  fetchBreadth(): Promise<MarketProviderResult<MarketBreadth>>
  fetchSectorFlows(kind: SectorKind): Promise<MarketProviderResult<SectorFlowQuote[]>>
}
```

Pure parsers must be exported for fixture tests:

```ts
export function parseEastMoneyIndices(payload: unknown, fetchedAt: string): { data: MarketIndexQuote[], marketAt: string }
export function parseEastMoneyBreadth(payload: unknown, fetchedAt: string): { data: MarketBreadth, marketAt: string }
export function parseEastMoneySectorFlows(payload: unknown, kind: SectorKind, fetchedAt: string): { data: SectorFlowQuote[], marketAt: string }
```

- [ ] **Step 1: 写指数 fixture 红灯**

Fixture 最少包含 `f12/f14/f2/f3/f4/f124`，断言三大指数按固定代码排序；缺 `f2/f3/f4` 时必须抛解析错误，不把空值变 0。

- [ ] **Step 2: 写 sector 空值红灯**

Fixture 中包含：

```ts
{ f12: 'BK0001', f14: '半导体', f3: '-', f62: null, f184: '-', f204: '', f205: '', f124: 1787415600 }
```

Expected: `changePct/mainNetInflow/mainNetInflowRatio === null`。

- [ ] **Step 3: 写 host fallback 红灯**

用 `vi.fn()` fetch：第一次 Host A 返回 502/throw，第二次 Host B 返回合法 JSON；断言两次 URL host 顺序。Host A 200 时断言只调用一次。

- [ ] **Step 4: 写 breadth fixture 红灯**

`fenbu` 使用 `-11..11` 桶，断言负数桶求和为 declining、正数桶求和 advancing、`0` 为 flat、`11/-11` 为涨停/跌停。

- [ ] **Step 5: 实现最小 Provider**

统一 helper：

```ts
async function fetchJsonWithHostFallback<T>(path: string, search: URLSearchParams, hosts: string[]): Promise<{ payload: T, endpoint: string, latencyMs: number }>
```

行为：

- 每 host `AbortSignal.timeout(2500)`。
- 非 2xx / JSON 解析失败 / `data=null` 计失败。
- 错误只保留 host、HTTP status、错误类别，不复制响应正文。

- [ ] **Step 6: Provider 全绿**

```bash
pnpm --filter @fly-living/api-worker exec vitest run test/market-eastmoney.spec.ts
```

Expected: 所有 fixture/fallback/timeout 测试 PASS。

---

### Task 3: MarketService + D1 last-good

**Files:**
- Create: `workers/api/src/features/market/service.ts`
- Modify: `workers/api/test/market.spec.ts`

**Interfaces:**

```ts
export class MarketService {
  constructor(env: Env, provider?: MarketDataProvider, now?: () => Date)
  overview(): Promise<MarketEnvelope<MarketOverview>>
  sectorFlows(kind: SectorKind, limit?: number): Promise<MarketEnvelope<SectorFlowItem[]>>
  syncScheduled(): Promise<MarketSyncResult>
  listVersion(): Promise<string>
}
```

`MarketOverview`：

```ts
export interface MarketOverview {
  indices: MarketIndexQuote[]
  breadth: MarketBreadth | null
}
```

- [ ] **Step 1: live/degraded/stale/unavailable 红灯**

用 fake provider 精确构造四种状态：

1. indices + breadth 成功 → live。
2. indices 成功、breadth 失败且 D1 有 breadth → degraded。
3. 两者失败且 D1 有 snapshot → stale。
4. 两者失败且 D1 空 → unavailable。

- [ ] **Step 2: 实现 source health**

每 capability 请求后 upsert `market_source_health`：

```text
status=success|failed
item_count
latency_ms
last_attempt_at
last_success_at
last_error <= 500 chars
updated_at
```

- [ ] **Step 3: 实现 overview last-good**

`overview()` 并发 provider 请求；单能力失败时从最近 `market_daily_snapshot` JSON 补齐；不得覆盖成功实时能力。

- [ ] **Step 4: sector upsert 与窗口红灯**

构造 20 个不同 `trade_date`，验证：

- 同日同 sector 再写只更新一行。
- 3/5/10/20 日 sum 精确。
- 只有 4 天时 20 日窗口 `availableDays=4, complete=false`。

- [ ] **Step 5: 实现 `syncScheduled()`**

盘外：

```ts
return { status: 'skipped', reason: 'outside-market-window' }
```

且 fake provider fetch count=0。

盘中：四 capability 并发/分组执行，成功能力独立写 D1；来源失败不 throw，D1/解析基础设施异常才 throw。

- [ ] **Step 6: Service 全绿**

```bash
pnpm --filter @fly-living/api-worker exec vitest run test/market.spec.ts
```

---

### Task 4: Public routes + scheduled queue integration

**Files:**
- Create: `workers/api/src/features/market/routes.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/scheduled-tasks.ts`
- Modify: `workers/api/test/market.spec.ts`
- Modify: `workers/api/test/scheduled.spec.ts`

**Interfaces:**

```text
GET /api/market/overview
GET /api/market/sector-flows?kind=industry|concept&limit=1..50
```

- [ ] **Step 1: 路由红灯**

断言：

- overview 200 + `data.quality`。
- invalid kind → 400。
- limit=0/51/non-integer → 400。
- unavailable → 200，不是 502。

- [ ] **Step 2: 实现 routes**

沿用 `Finance` 路由模式：

```ts
const cached = await publicCacheData(c, await service.listVersion(), () => service.overview(), 20)
```

sector-flows TTL 30s；带 cookie/authorization 自动 BYPASS 已由 `publicCacheData` 处理。

- [ ] **Step 3: 注册路由**

`workers/api/src/index.ts`：

```ts
app.route('/api/market', publicMarketRoutes)
```

- [ ] **Step 4: 调度红灯**

`scheduledJobsFor('*/5 * * * *')` Expected:

```ts
['news-sync', 'finance-sync', 'market-sync']
```

- [ ] **Step 5: 实现 `market-sync`**

扩展：

```ts
export type ScheduledJob = 'analytics-maintenance' | 'content-maintenance' | 'finance-sync' | 'market-sync' | 'news-sync' | 'moment-backup'
```

`defaultServices` 新增 `syncMarket: () => new MarketService(env).syncScheduled()`。

- [ ] **Step 6: 路由/调度全绿**

```bash
pnpm --filter @fly-living/api-worker exec vitest run test/market.spec.ts test/scheduled.spec.ts
```

---

### Task 5: `/market` real-data UI

**Files:**
- Modify: `app/pages/market/index.vue`
- Modify: `test/nuxt/market-terminal.spec.ts`

**Interfaces consumed:**

```ts
$fetch<{ data: MarketEnvelope<MarketOverview> }>('/api/market/overview')
$fetch<{ data: MarketEnvelope<SectorFlowItem[]> }>('/api/market/sector-flows', { query: { kind, limit: 20 } })
```

- [ ] **Step 1: UI 合同红灯**

新增静态合同断言：

- Vue 文件引用 `/api/market/overview`、`/api/market/sector-flows`。
- 保留 `unavailable` 文案。
- 不含 `Math.random`。
- 不出现硬编码示例点位，例如 `3000.00`、`+1.23%`。
- 资金工作区包含 industry/concept 控件与 `1D/3D/5D/10D/20D`。

- [ ] **Step 2: overview 状态**

新增：

```ts
const marketOverview = ref<MarketEnvelope<MarketOverview> | null>(null)
const marketOverviewLoading = ref(true)
const marketOverviewError = ref('')
```

mounted 时加载；页面可见时每 60s 更新。卸载时清 timer。

- [ ] **Step 3: 替换指数占位卡**

当 `data?.indices.length === 3` 时渲染真实卡；否则渲染显式 unavailable。涨跌 class 只按 `changePct > 0 / < 0`。

- [ ] **Step 4: 资金工作区**

只有 activeWorkspace=`funds` 时请求；行业/概念切换重新请求。表格放在 `.market-table-scroll`，其自身 `overflow-x:auto`，外层页面不溢出。

- [ ] **Step 5: 质量标签**

映射：

```text
live -> 实时数据
degraded -> 部分数据降级
stale -> 最后成功快照
unavailable -> 暂无可信行情
```

不把 `marketAt=null` 格式化成当前时间。

- [ ] **Step 6: UI 单测/静态检查**

```bash
pnpm exec vitest run test/nuxt/market-terminal.spec.ts
pnpm exec eslint app/pages/market/index.vue test/nuxt/market-terminal.spec.ts
pnpm exec stylelint 'app/pages/market/index.vue'
```

---

### Task 6: Cloudflare remote probe + final gate

**Files:**
- No production source file required unless probe reveals compatibility issue.
- Record results in `docs/superpowers/acceptance/2026-08-23-market-data-provider-p1.md` under evidence section.

- [ ] **Step 1: Worker dry-run**

```bash
pnpm --filter @fly-living/api-worker exec wrangler deploy --dry-run
```

Record upload/gzip size and confirm no missing Node/Worker compatibility API.

- [ ] **Step 2: 远端 probe**

优先启动非生产 remote dev；probe 必须从 Cloudflare 执行环境运行同一 `EastMoneyMarketProvider`，不直接从本机脚本请求第三方。

每 capability 20 次：

```text
indices
breadth
sector-industry
sector-concept
```

记录 success/empty/4xx/5xx/network/p50/p95。

- [ ] **Step 3: 按门槛决定 capability**

- indices >=95% 且 P95<3000ms → 本分支 UI 可保持接线。
- sector industry/concept >=90% 且 P95<3000ms → 对应 capability 可保持接线。
- 未达标 → 增加代码级 candidate/disabled gate，UI 回到 unavailable；不得降低验收门槛。

- [ ] **Step 4: 完整门禁**

```bash
pnpm verify
git diff --check
pnpm --filter @fly-living/api-worker exec wrangler deploy --dry-run
```

Expected: 全部 exit 0；只有仓库既有第三方 sourcemap/chunk warning 可保留，无新增 error。

- [ ] **Step 5: 浏览器验收**

本地 QA fixture/真实本站 API 覆盖：

- 1440×900。
- 390×844。
- 320/360/430/768/1024/1280/1728 overflow 快扫。
- live/degraded/stale/unavailable。
- industry/concept。
- light/dark/dynamic。
- reduced-motion。
- SPA `/market` → `/`。
- browser errors/console。

- [ ] **Step 6: AC 收口**

逐条更新 `docs/superpowers/acceptance/2026-08-23-market-data-provider-p1.md`：只勾有证据的标准；5 个交易日正式生产 SLA 不是本地 P1 的伪通过项。

---

## Self-Review

- Spec coverage：Task 1–6 覆盖 Provider、D1、API、调度、UI、Cloudflare remote gate、最终验证。
- 占位词扫描：未发现实现占位、未定字段或跨任务模糊引用。
- Type consistency：`MarketEnvelope<T>`、`MarketDataProvider`、`MarketService`、`SectorKind` 在所有任务使用同一命名。
- Scope：不加入自选、T 信号、财报筛选、图表库；这些留给数据 Provider 通过后的后续阶段。
- User constraints：删除常规计划中的 commit 步骤；不 push、不部署生产、不使用子 Agent。
