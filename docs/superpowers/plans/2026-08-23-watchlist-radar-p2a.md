# 自选股雷达 P2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `/market` P1 基础上实现最多 30 只的私有自选股雷达：页面 45 秒按需批量真实报价、后台 5 分钟真实快照、单股独立降级、Private API、桌面/移动端 UI，并在通过 Cloudflare Remote Gate 与完整回归后部署生产。

**Architecture:** 保持 P1 的 Provider → Service → Route → Vue 分层；新增独立 `StockQuoteProvider` 和 `WatchlistService`，D1 持久化私人自选配置与 5 分钟真实快照。页面实时读与后台历史写完全分离，后台复用现有 `*/5` Queue；正常 30 股报价单批请求，失败按股票回退 last-good，不扫描全市场。

**Tech Stack:** Nuxt 4 + Vue 3 + TypeScript + Hono + Cloudflare Workers + D1 + Queues + Vitest `@cloudflare/vitest-pool-workers` + Wrangler + Playwright/AgentDock browser acceptance。

## Global Constraints

- 单管理员 P2A；全局自选总记录最多 30，`enabled=false` 仍计入容量。
- 自选配置与报价仅走 `/api/admin/market/watchlist*`；公开 `/api/market/*` 不得出现私人字段。
- 页面自选轮询精确周期 45,000ms，仅工作区 active + `document.visibilityState === 'visible'` + 交易时段持续；盘外不持续轮询。
- 页面实时报价默认不写 5 分钟历史；后台 `market-watchlist-sync` 才写 `market_watchlist_quote_5m`。
- 正常 30 股 primary 成功时上游请求数必须为 1；primary 失败后最多 2（含 fallback）。
- 无真实报价只允许 last-good / unavailable；`-`、空字符串、null、非法数不转 0。
- P2A 不实现 P2B 异常放量/T 信号，不做全 A 扫描，不存持仓/成本。
- Cloudflare Remote Instant Gate：batch success >=95%，valid stock return >=99%，P95 <2500ms。
- 全流程 TDD；测试文件不提交；生产代码/迁移/文档可提交。
- 用户已明确授权 commit、push、生产部署；不再保留此前“禁止提交/部署”的旧边界。
- 当前执行必须串行在本 Agent 内完成，不使用子 agent。

---

### Task 1: 固化 P2A 共享类型与 D1 schema

**Files:**
- Modify: `shared/market.ts`
- Create: `workers/api/migrations/0015_market_watchlist.sql`
- Test: `workers/api/test/market-watchlist.spec.ts`

**Interfaces:**
- Produces: `StockExchange`, `StockSymbol`, `WatchlistItem`, `StockQuote`, `WatchlistItemQuality`, `WatchlistRadarItem`, `WatchlistRadarResponse`。
- Produces D1 tables: `market_watchlist`, `market_watchlist_quote_5m`。

- [ ] **Step 1: 写红测锁定共享模型对应 schema**

在 `market-watchlist.spec.ts` 先写 migration smoke：

```ts
it('creates private watchlist tables', async () => {
  for (const table of ['market_watchlist', 'market_watchlist_quote_5m']) {
    const row = await testEnv.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .bind(table).first<{ name: string }>()
    expect(row?.name).toBe(table)
  }
})
```

- [ ] **Step 2: 运行红测**

Run: `pnpm --filter @fly-living/api-worker test -- market-watchlist.spec.ts`
Expected: FAIL，两个表不存在。

- [ ] **Step 3: 最小实现共享 DTO + migration**

`shared/market.ts` 增加：

```ts
export type StockExchange = 'SSE' | 'SZSE' | 'BSE'
export type StockSymbol = `${StockExchange}:${string}`
export type WatchlistItemQuality = 'live' | 'stale' | 'unavailable'

export interface WatchlistItem {
  symbol: StockSymbol
  exchange: StockExchange
  code: string
  name: string
  sortOrder: number
  note: string | null
  attentionPrice: number | null
  tags: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface StockQuote {
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

export interface WatchlistRadarItem {
  watchlist: WatchlistItem
  quote: StockQuote | null
  quality: WatchlistItemQuality
  staleAgeMs: number | null
  source: MarketSourceRef | null
}

export interface WatchlistRadarResponse {
  quality: MarketDataQuality
  fetchedAt: string | null
  items: WatchlistRadarItem[]
}
```

Migration 按批准 spec 创建两个表；为 `market_watchlist_quote_5m(owner_id, symbol, market_at DESC)` 建索引。

- [ ] **Step 4: 运行专项测试 + typecheck**

Run: `pnpm --filter @fly-living/api-worker test -- market-watchlist.spec.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5: Commit 生产文件**

```bash
git add shared/market.ts workers/api/migrations/0015_market_watchlist.sql
git commit -m "feat: add watchlist market schema"
```

---

### Task 2: 实现 StockSymbol 规范化与 EastMoney 批量个股 Provider

**Files:**
- Modify: `workers/api/src/features/market/contracts.ts`
- Create: `workers/api/src/features/market/eastmoney-stock.ts`
- Test: `workers/api/test/market-eastmoney-stock.spec.ts`

**Interfaces:**
- Produces: `StockQuoteProvider`, `StockQuoteProviderResult`。
- Produces: `parseStockSymbol(value)`, `toEastMoneySecid(symbol)`, `EastMoneyStockQuoteProvider.fetchQuotes(symbols)`。

- [ ] **Step 1: 写 provider 红测**

覆盖：SSE/SZSE/BSE 编码、1/30 股单批、乱序返回、部分 missing、`-`/null、primary 4xx/5xx/timeout、HTTP 200+`data=null` fallback、双 host 失败、正确 Worker fetch wrapper。

核心断言：

```ts
expect(fetchImpl).toHaveBeenCalledTimes(1)
expect(new URL(String(fetchImpl.mock.calls[0]![0])).searchParams.get('secids'))
  .toContain('0.300308')
expect(result.quotes.get('SZSE:300308')?.price).toBe(158.72)
```

- [ ] **Step 2: 运行红测**

Run: `pnpm --filter @fly-living/api-worker test -- market-eastmoney-stock.spec.ts`
Expected: FAIL，provider/types 尚不存在。

- [ ] **Step 3: 最小实现 Provider**

合同：

```ts
export interface StockQuoteProviderResult {
  quotes: Map<StockSymbol, StockQuote>
  missing: StockSymbol[]
  source: MarketSourceRef
  fetchedAt: string
  latencyMs: number
}

export interface StockQuoteProvider {
  sourceId?: () => string
  fetchQuotes: (symbols: StockSymbol[]) => Promise<StockQuoteProviderResult>
}
```

实现使用 `push2.eastmoney.com` → `push2delay.eastmoney.com`，每 host 2500ms timeout，`/api/qt/ulist.np/get` 一次 `secids` 获取最多 30 股；parser 放在每 host attempt 内。

- [ ] **Step 4: 运行 provider tests**

Run: `pnpm --filter @fly-living/api-worker test -- market-eastmoney-stock.spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit 生产文件**

```bash
git add workers/api/src/features/market/contracts.ts workers/api/src/features/market/eastmoney-stock.ts
git commit -m "feat: add batched stock quote provider"
```

---

### Task 3: 实现 WatchlistService CRUD、last-good 与 5 分钟同步

**Files:**
- Create: `workers/api/src/features/market/watchlist-service.ts`
- Test: `workers/api/test/market-watchlist.spec.ts`

**Interfaces:**
- Produces: `WatchlistService.list(ownerId)`、`add(ownerId,input)`、`update(ownerId,symbol,input)`、`remove(ownerId,symbol)`、`quotes(ownerId)`、`syncScheduled()`。

- [ ] **Step 1: 写 Service 红测**

必须覆盖：30 只上限、disabled 计数、并发第 31 只、owner 隔离、空列表 zero-fetch、live/stale/unavailable、28+1+1 degraded、页面 quotes 不写 5m、后台 bucket upsert、单股失败不回滚、盘外 zero-fetch、异常全局 >30 fail-closed。

- [ ] **Step 2: 运行红测**

Run: `pnpm --filter @fly-living/api-worker test -- market-watchlist.spec.ts`
Expected: FAIL，Service 尚不存在。

- [ ] **Step 3: 实现 CRUD 与数据校验**

固定校验常量：

```ts
const WATCHLIST_LIMIT = 30
const NOTE_MAX_LENGTH = 240
const TAG_LIMIT = 8
const TAG_MAX_LENGTH = 24
```

新增时先验证总条数 `<30`、normalize symbol、通过 Provider 获取可信名称；所有写路径只作用于 `owner_id`。

- [ ] **Step 4: 实现 quote merge 与 5m sync**

`quotes(ownerId)`：批量请求 enabled，逐股合并 last-good；空自选返回 `items: []`。`syncScheduled()`：交易窗口内读取全局记录数，`>30` fail-closed；仅 enabled 批量取价；按 `marketAt` 归一 5 分钟 bucket 并逐股 upsert。

- [ ] **Step 5: 跑 Service tests**

Run: `pnpm --filter @fly-living/api-worker test -- market-watchlist.spec.ts`
Expected: PASS。

- [ ] **Step 6: Commit 生产文件**

```bash
git add workers/api/src/features/market/watchlist-service.ts
git commit -m "feat: add private watchlist service"
```

---

### Task 4: 接入 Private API、Session/CSRF/read limiter

**Files:**
- Modify: `workers/api/src/env.ts`
- Create: `workers/api/src/features/market/admin-routes.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/wrangler.jsonc`
- Test: `workers/api/test/market-watchlist-routes.spec.ts`

**Interfaces:**
- Exposes `/api/admin/market/watchlist` CRUD + `/quotes`。
- Adds binding `MARKET_READ_RATE_LIMITER`，建议 6 req/min/session。

- [ ] **Step 1: 写 Route/Auth 红测**

覆盖 401 `UNAUTHENTICATED`、写请求 CSRF、跨 owner 不可见、validation 400、read limiter 429、所有成功/失败 admin 响应 `Cache-Control: private, no-store`、公开 `/api/market/*` 不含私人字段。

- [ ] **Step 2: 运行红测**

Run: `pnpm --filter @fly-living/api-worker test -- market-watchlist-routes.spec.ts`
Expected: FAIL，route/binding 未实现。

- [ ] **Step 3: 实现 admin routes**

Route 结构：

```ts
export const adminMarketRoutes = new Hono<AppEnvironment>()
adminMarketRoutes.use('*', requireSession)
adminMarketRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'private, no-store')
})
```

GET `/quotes` 使用 `${session.sessionId}:market-watchlist-quotes` read limiter；POST/PATCH/DELETE 使用 existing write limiter + CSRF。

- [ ] **Step 4: 注册 binding 与 route**

`wrangler.jsonc` 新 ratelimit namespace，`env.ts` 增加 `MARKET_READ_RATE_LIMITER`；`index.ts` 注册 `/api/admin/market`。

- [ ] **Step 5: 跑 Route/Auth tests + typecheck**

Run: `pnpm --filter @fly-living/api-worker test -- market-watchlist-routes.spec.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 6: Commit 生产文件**

```bash
git add workers/api/src/env.ts workers/api/src/features/market/admin-routes.ts workers/api/src/index.ts workers/api/wrangler.jsonc
git commit -m "feat: expose private watchlist api"
```

---

### Task 5: 复用 5 分钟 Queue 接入 watchlist sync

**Files:**
- Modify: `workers/api/src/scheduled-tasks.ts`
- Test: `workers/api/test/scheduled.spec.ts`
- Test: `workers/api/test/market-watchlist.spec.ts`

**Interfaces:**
- Adds job `market-watchlist-sync` and service `syncWatchlistMarket`。

- [ ] **Step 1: 修改 scheduled 红测**

期望 `*/5 * * * *` 精确返回：

```ts
['news-sync', 'finance-sync', 'market-sync', 'market-watchlist-sync']
```

并验证 queue delivery 只调用 `syncWatchlistMarket`。

- [ ] **Step 2: 运行红测**

Run: `pnpm --filter @fly-living/api-worker test -- scheduled.spec.ts`
Expected: FAIL，job 未注册。

- [ ] **Step 3: 最小实现 scheduled integration**

`defaultServices()` 增加 `new WatchlistService(env).syncScheduled()`；不新增 Cron。

- [ ] **Step 4: 跑 scheduled + watchlist tests**

Run: `pnpm --filter @fly-living/api-worker test -- scheduled.spec.ts market-watchlist.spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit 生产文件**

```bash
git add workers/api/src/scheduled-tasks.ts
git commit -m "feat: schedule watchlist market snapshots"
```

---

### Task 6: 实现 `/market` 自选状态机与 45 秒轮询

**Files:**
- Modify: `app/pages/market/index.vue`
- Test: `test/nuxt/market-terminal.spec.ts`

**Interfaces:**
- Browser consumes `GET /api/auth/session` 和 `/api/admin/market/watchlist/quotes`。
- Keeps one active `AbortController` + 45,000ms timer；离开 workspace/hidden/unmount 清理。

- [ ] **Step 1: 写 Nuxt 红测锁定数据纪律与生命周期源码合同**

至少断言页面包含 private endpoint、`45_000`、`visibilitychange`、`AbortController`，且自选区无随机数/示例股价；未登录不会主动请求 quote。

- [ ] **Step 2: 运行红测**

Run: `pnpm test:unit -- test/nuxt/market-terminal.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现登录态、数据状态与刷新生命周期**

增加 session/watchlist refs、`loadWatchlistQuotes()`、`start/stopWatchlistPolling()`；只有 active watchlist + authenticated + visible + 交易窗口才持续 45 秒；手动刷新复用 in-flight guard。

- [ ] **Step 4: 跑 Nuxt tests**

Run: `pnpm test:unit -- test/nuxt/market-terminal.spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit 生产文件**

```bash
git add app/pages/market/index.vue
git commit -m "feat: add watchlist radar polling"
```

---

### Task 7: 完成 Desktop/Mobile 自选雷达 UI 与 CRUD 交互

**Files:**
- Modify: `app/pages/market/index.vue`
- Test: `test/nuxt/market-terminal.spec.ts`

**Interfaces:**
- Desktop table: 股票/现价/涨跌幅/日内高低/成交额/距关注价/状态。
- Mobile cards: 同字段单列呈现。
- CRUD uses private endpoints and existing CSRF session contract。

- [ ] **Step 1: 写 UI 红测**

锁定：未登录私有占位、空状态、mixed quality、收盘文案、`unavailable` 不显示示例价、红涨绿跌、关注价不是成本价、移动端卡片类、无 document-level 强制宽表。

- [ ] **Step 2: 运行红测**

Run: `pnpm test:unit -- test/nuxt/market-terminal.spec.ts`
Expected: FAIL，新 UI 尚未渲染。

- [ ] **Step 3: 实现桌面/移动展示与添加/编辑/删除**

保持 `/market` 黑金主题；自选 active 时显示 `私有自选 · 最多30只`、质量统计、手动刷新。提供最小 CRUD：代码添加、关注价/备注/tags/启用状态编辑、删除；不引入持仓字段。

- [ ] **Step 4: 跑 unit + generate**

Run: `pnpm test:unit -- test/nuxt/market-terminal.spec.ts && pnpm generate`
Expected: PASS，无 invalid icon/hydration build error。

- [ ] **Step 5: Commit 生产文件**

```bash
git add app/pages/market/index.vue
git commit -m "feat: render private watchlist radar"
```

---

### Task 8: Cloudflare Remote Provider Gate 与必要修复

**Files:**
- Modify only if probe exposes runtime/protocol defects: `workers/api/src/features/market/eastmoney-stock.ts`
- Update evidence: `docs/superpowers/acceptance/2026-08-23-watchlist-radar-p2a.md`

- [ ] **Step 1: 用最新代码启动不带生产 D1/Queue/Secret 的 `wrangler dev --remote` 临时 probe**

Probe 30 只合法 SSE/SZSE 股票，至少 20 次完整批量请求；记录 attempts/success/valid stock count/4xx/5xx/network/P50/P95/endpoint/request count。

- [ ] **Step 2: 验证 Instant Gate**

必须满足：success >=95%、valid return >=99%、P95 <2500ms、正常请求=1、fallback 最大=2。

- [ ] **Step 3: 若发现 defect，先写本地红测再修复**

例如 remote 暴露 `Illegal invocation` 或 200-invalid-payload，必须先在 `market-eastmoney-stock.spec.ts` 增加复现测试，再最小修复，然后重复 remote gate。

- [ ] **Step 4: 清理 probe 并写验收证据**

临时 Worker/目录不存在；AC I1–I10 依据真实证据更新。

- [ ] **Step 5: Commit 生产修复和证据**

```bash
git add workers/api/src/features/market/eastmoney-stock.ts docs/superpowers/acceptance/2026-08-23-watchlist-radar-p2a.md
git commit -m "test: verify watchlist provider remotely"
```

---

### Task 9: 完整自动化与浏览器验收

**Files:**
- Update evidence: `docs/superpowers/acceptance/2026-08-23-watchlist-radar-p2a.md`

- [ ] **Step 1: 完整自动化门禁**

Run: `git diff --check && pnpm verify`
Expected: exit 0。

- [ ] **Step 2: Worker dry-run**

Run: `pnpm --filter @fly-living/api-worker exec wrangler deploy --dry-run`
Expected: exit 0，记录 bundle/gzip。

- [ ] **Step 3: 本地 QA 浏览器验收**

用生成静态页 + fixture API 覆盖：1440×900、390×844；再 sweep 320/360/390/430/768/1024/1280/1440/1728；未登录、空自选、live/degraded/stale/unavailable、收盘语义、三主题、reduced motion、SPA `/market -> /`、console/errors。

- [ ] **Step 4: AC 全量打勾并填证据**

只把真实通过项从 `[ ]` 改 `[x]`；正式多交易日 SLA 如未完成必须保留“未宣称通过”。

- [ ] **Step 5: Commit 验收证据**

```bash
git add docs/superpowers/acceptance/2026-08-23-watchlist-radar-p2a.md
git commit -m "test: complete watchlist radar acceptance"
```

---

### Task 10: 生产迁移、推送、部署与线上验收

**Files:**
- No unplanned production code changes；若线上暴露 defect，回到对应任务执行 TDD 修复后重新过 Task 9。

- [ ] **Step 1: 确保工作树仅剩不应提交的测试文件改动/无意外脏文件**

Run: `git status --short && git log --oneline --decorate -12`
Expected: 生产改动全部有清晰 commit；测试文件按仓库规则保持不提交。

- [ ] **Step 2: 推送 feature 分支并 fast-forward/main 合并策略检查**

先 `git fetch origin`；确认 `origin/main` 未前进造成冲突。若可安全 fast-forward，更新 main；否则在当前 Agent 内 rebase/resolve，重新执行 Task 9。

- [ ] **Step 3: 推送 main 触发 GitHub Actions Pages + Workers Production**

Workers workflow 会先远端应用 D1 migrations，再部署 API/edge；Pages workflow 构建并部署 production branch `main`。

- [ ] **Step 4: 观察两个 production workflows 到 success**

使用 GitHub CLI/API 验证 `workers-production.yml` 与 `pages-production.yml` 对目标 SHA 均成功；失败则读取日志、TDD 修复、重新完整门禁后重试。

- [ ] **Step 5: 线上 smoke/安全验收**

检查：`https://flyovo.cc.cd/api/health` 200；`/market` 200；未登录 `/api/admin/market/watchlist` 为 401；公开 `/api/market/overview` 仍可用；页面无 console error、无私人数据泄漏、无模拟自选价。

- [ ] **Step 6: 最终状态记录**

记录 production commit SHA、Workers/Pages workflow run、D1 migration `0015` 已应用、线上 smoke 时间；若正式多交易日 Provider SLA 尚未积累，明确说明该持续观察项不阻塞本次功能上线但不宣称 SLA 已完成。

---

## Self-Review

- Spec coverage：A–J 的 101 个 AC 均映射到 Task 1–10；Private API、30 只硬门禁、单股降级、45 秒生命周期、Remote Gate、响应式和生产部署均有明确任务。
- Placeholder scan：无 TBD/TODO/“类似 Task N”占位；所有实现边界和测试命令明确。
- Type consistency：`StockSymbol` / `StockQuoteProviderResult` / `WatchlistRadarResponse` / `market-watchlist-sync` 名称在后续任务保持一致。
- Scope：P2A 仍不含 P2B T 信号、全市场扫描、持仓/成本；部署只发布 P0/P1/P2A 已验证功能。
