# Watchlist Signal Radar P2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. This repository is currently in explicit single-agent mode, so execution stays serial in the current agent while preserving TDD/review/acceptance gates. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and production-deploy a private `balanced-v1` intraday signal desk for at most 30 watchlist stocks using only the real P2A 5-minute snapshots.

**Architecture:** Add a pure deterministic `MarketSignalEngine` for time-series validation/baselines/factors/scoring, a D1-backed `MarketSignalService` for batched history/cooldown/idempotency/query/retention, and wire evaluation immediately after successful P2A snapshot writes inside the existing `market-watchlist-sync`. Expose only a session-protected admin signal endpoint and render it through a focused `MarketSignalDesk.vue` component; do not add an upstream provider, Cron trigger, full-market scanner, auto-trading action, or fake signal.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers/D1/Queues, Vue 3/Nuxt 4, Vitest, Wrangler, existing AgentDock browser acceptance.

## Global Constraints

- Engine version is exactly `balanced-v1`; production threshold changes require a future version, not silent mutation.
- At most 30 global private watchlist rows; P2B evaluates enabled rows only.
- `turnover` and `volume` are daily cumulative values. A 5-minute flow delta requires exactly adjacent 5-minute buckets in the same Shanghai trading session.
- Cross-day, lunch-gap, missing-bucket, repeated/backward `marketAt`, null cumulative fields, and negative cumulative deltas fail closed.
- 30-minute range uses max/min of the previous six consecutive snapshot `price` values. P2A daily cumulative `high/low` must not be used for local range.
- No new Cloudflare Cron, no new market Provider, no full-A-share scan, no Level2/tick dependency, no automatic buy/sell recommendation.
- Signal API is private `requireSession` + `private, no-store`; public `/api/market/*` must not expose signals or private watchlist fields.
- UI polling reads only the private D1-backed signal API every 60,000ms while signal workspace is active, visible, authenticated, and in the normal trading window.
- Tests remain local/untracked per current repository test-file policy; production source/docs/migrations are committed.
- User has authorized autonomous TDD, commit, push, migration, Workers/Pages deploy and production smoke after all immediate gates pass.

---

## File Structure

**Create**
- `workers/api/migrations/0016_market_watchlist_signals.sql` — signal persistence/indexes.
- `workers/api/src/features/market/signal-engine.ts` — pure deterministic time-series and `balanced-v1` engine.
- `workers/api/src/features/market/signal-service.ts` — batched D1 history, cooldown/idempotency, list/retention/delete.
- `workers/api/test/market-signal-engine.spec.ts` — engine boundary TDD.
- `workers/api/test/market-signal-service.spec.ts` — D1/service TDD.
- `app/components/market/MarketSignalDesk.vue` — focused private signal UI and presentation.
- `scripts/replay-market-signals.ts` — read-only replay report from exported SELECT data; never connects to D1 itself.

**Modify**
- `shared/market.ts` — public-to-app private DTO contracts for signal desk.
- `workers/api/src/features/market/watchlist-service.ts` — call SignalService after snapshot persistence; delete signals on watchlist delete.
- `workers/api/src/features/market/admin-routes.ts` — private `GET /signals`.
- `workers/api/src/scheduled-tasks.ts` — add signal retention to existing content maintenance only.
- `workers/api/test/market-watchlist.spec.ts` — snapshot→signal sequencing/partial/failure TDD.
- `workers/api/test/market-watchlist-routes.spec.ts` — private signal route/auth/validation TDD.
- `workers/api/test/scheduled.spec.ts` — no new `*/5` job; maintenance cleanup regression.
- `app/pages/market/index.vue` — wire session/workspace to `MarketSignalDesk`, update P2A build label to P2B.
- `test/nuxt/market-terminal.spec.ts` — Signal Desk contract/lifecycle/source guards.
- `docs/superpowers/acceptance/2026-08-23-watchlist-signal-radar-p2b.md` — append actual evidence only after verification.

---

### Task 1: Shared contracts and D1 schema

**Files:**
- Modify: `shared/market.ts`
- Create: `workers/api/migrations/0016_market_watchlist_signals.sql`
- Test: `workers/api/test/market-signal-service.spec.ts`

**Interfaces:**
- Produces `MarketSignalDirection`, `MarketSignalSeverity`, `MarketSignalType`, `MarketSignalEvidence`, `MarketSignalItem`, `MarketSignalBaselineSummary`, `MarketSignalDeskResponse`.
- Produces table `market_watchlist_signal` with deterministic uniqueness `(owner_id, symbol, bucket_at, signal_type, engine_version)`.

- [ ] **Step 1: Write the schema/DTO failing tests**

Add a migration contract test in `market-signal-service.spec.ts` that applies migrations and asserts a signal can be inserted once but the same unique tuple cannot be inserted twice. Add a compile-time fixture using the exact response shape:

```ts
const desk: MarketSignalDeskResponse = {
  engineVersion: 'balanced-v1',
  marketAt: '2026-08-24T02:35:00.000Z',
  baseline: { enabledCount: 1, readyCount: 1, warmingCount: 0 },
  items: [{
    id: 'signal-1',
    symbol: 'SZSE:300308',
    code: '300308',
    name: '中际旭创',
    signalType: 'momentum_up',
    direction: 'up',
    severity: 'watch',
    score: 65,
    title: '放量上冲',
    marketAt: '2026-08-24T02:35:00.000Z',
    detectedAt: '2026-08-24T02:35:05.000Z',
    engineVersion: 'balanced-v1',
    evidence: {
      factors: ['TURNOVER_SURGE', 'PRICE_ACCELERATION', 'DIRECTION_ALIGNMENT'],
      priceMove5mPct: 1.2,
      priceMove10mPct: null,
      flowBasis: 'turnover',
      flowDelta: 18_200_000,
      flowRatio: 2.4,
      rangeHigh: null,
      rangeLow: null,
      attentionPrice: null,
    },
  }],
}
expect(desk.items[0]?.severity).toBe('watch')
```

- [ ] **Step 2: Run the test to prove RED**

Run:

```bash
pnpm --filter @fly-living/api-worker test -- market-signal-service.spec.ts
```

Expected: FAIL because signal DTOs/table do not exist.

- [ ] **Step 3: Add exact shared DTOs**

Append to `shared/market.ts`:

```ts
export type MarketSignalDirection = 'up' | 'down' | 'neutral'
export type MarketSignalSeverity = 'watch' | 'strong'
export type MarketSignalType
  = | 'momentum_up' | 'momentum_down'
    | 'breakout_up' | 'breakdown_down'
    | 'attention_cross_up' | 'attention_cross_down'
    | 'price_spike_up' | 'price_spike_down'

export interface MarketSignalEvidence {
  factors: string[]
  priceMove5mPct: number | null
  priceMove10mPct: number | null
  flowBasis: 'turnover' | null
  flowDelta: number | null
  flowRatio: number | null
  rangeHigh: number | null
  rangeLow: number | null
  attentionPrice: number | null
}

export interface MarketSignalItem {
  id: string
  symbol: StockSymbol
  code: string
  name: string
  signalType: MarketSignalType
  direction: MarketSignalDirection
  severity: MarketSignalSeverity
  score: number
  title: string
  marketAt: string
  detectedAt: string
  engineVersion: 'balanced-v1'
  evidence: MarketSignalEvidence
}

export interface MarketSignalBaselineSummary {
  enabledCount: number
  readyCount: number
  warmingCount: number
}

export interface MarketSignalDeskResponse {
  engineVersion: 'balanced-v1'
  marketAt: string | null
  baseline: MarketSignalBaselineSummary
  items: MarketSignalItem[]
}
```

- [ ] **Step 4: Add migration 0016**

Create the signal table and indexes. `evidence_json` is the only JSON payload and stores only the DTO evidence whitelist. Include:

```sql
CREATE TABLE IF NOT EXISTS market_watchlist_signal (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bucket_at TEXT NOT NULL,
  market_at TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('up','down','neutral')),
  severity TEXT NOT NULL CHECK(severity IN ('watch','strong')),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  title TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, symbol, bucket_at, signal_type, engine_version),
  FOREIGN KEY(owner_id, symbol) REFERENCES market_watchlist(owner_id, symbol) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_market_signal_owner_time
  ON market_watchlist_signal(owner_id, market_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_signal_owner_symbol_time
  ON market_watchlist_signal(owner_id, symbol, market_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_signal_owner_direction_time
  ON market_watchlist_signal(owner_id, direction, market_at DESC);
```

- [ ] **Step 5: Run focused tests/typecheck and commit**

Run:

```bash
pnpm --filter @fly-living/api-worker test -- market-signal-service.spec.ts
pnpm --filter @fly-living/api-worker typecheck
```

Expected: PASS. Then commit production files only:

```bash
git add shared/market.ts workers/api/migrations/0016_market_watchlist_signals.sql
git commit -m "feat: add watchlist signal contracts"
```

---

### Task 2: Pure `balanced-v1` Signal Engine

**Files:**
- Create: `workers/api/src/features/market/signal-engine.ts`
- Test: `workers/api/test/market-signal-engine.spec.ts`

**Interfaces:**
- Produces `BALANCED_SIGNAL_ENGINE_VERSION = 'balanced-v1'`.
- Produces `SignalSnapshot`, `SignalCandidate`, `SignalEvaluation` and `evaluateMarketSignal()`.
- Consumes `WatchlistItem` and shared signal types; never accesses D1/fetch/global time.

- [ ] **Step 1: Write RED tests for strict time-series validation**

Create deterministic fixture helpers with Shanghai timestamps. Tests must assert:

```ts
expect(computeIntervalDelta(prev0930, current0935)?.turnoverDelta).toBe(5_000_000)
expect(computeIntervalDelta(prev0930, current0940)).toBeNull() // missing 09:35
expect(computeIntervalDelta(am1130, pm1300)).toBeNull()
expect(computeIntervalDelta(day1, day2)).toBeNull()
expect(computeIntervalDelta(repeatedMarketAt, current)).toBeNull()
expect(computeIntervalDelta(largerCumulative, resetSmaller)).toBeNull()
```

Also prove 10m price requires three consecutive buckets.

- [ ] **Step 2: Run to prove RED**

```bash
pnpm --filter @fly-living/api-worker test -- market-signal-engine.spec.ts
```

Expected: FAIL because `signal-engine.ts` is absent.

- [ ] **Step 3: Implement pure timestamp/session primitives**

Use fixed UTC+8 arithmetic (China has no DST) rather than environment-local timezone:

```ts
const FIVE_MINUTES_MS = 300_000
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function shanghaiParts(iso: string) {
  const d = new Date(Date.parse(iso) + SHANGHAI_OFFSET_MS)
  return {
    date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}
```

`computeIntervalDelta()` returns null unless same Shanghai date/session, exact 5m `bucketAt`, strictly increasing `marketAt`, non-null cumulative fields and non-negative delta.

- [ ] **Step 4: Write RED baseline tests**

Cover historical same-slot median (>=3 days), intraday median (>=4 valid deltas), missing samples excluded, historical priority, and warming when neither exists.

- [ ] **Step 5: Implement baseline selection**

Expose a small internal result:

```ts
interface FlowBaseline {
  kind: 'historical-slot' | 'intraday' | 'unavailable'
  basis: 'turnover' | null
  value: number | null
  sampleCount: number
}
```

Use turnover only. If turnover cannot form a valid baseline, return unavailable; balanced-v1 does not fall back to provider-dependent volume units.

- [ ] **Step 6: Write RED factor/scoring tests**

Boundary tests cover 1.999/2.0/3.0 flow ratios, 2,999,999/3,000,000 absolute turnover, 0.999/1.0/1.8% 5m move, valid 1.5% 10m, normal ±0.2% range, strong ±0.5% range, attention cross and neutral direction. A turnover-null fixture must remain flow-unavailable even when volume is populated.

Critically, range fixture must prove daily `high/low` fields cannot influence it; engine `SignalSnapshot` should not even contain those fields.

- [ ] **Step 7: Implement factors and scoring exactly**

Centralize constants:

```ts
export const BALANCED_SIGNAL_ENGINE_VERSION = 'balanced-v1' as const
const SCORE = {
  turnover: { normal: 30, strong: 40 },
  price: { normal: 25, extreme: 50 },
  range: { normal: 25, strong: 35 },
  attention: 55,
  alignment: 10,
} as const
```

Map each symbol/bucket to at most one observation-only candidate. Use exact signalType precedence:

```ts
if (factors.attentionCross) type = direction === 'up' ? 'attention_cross_up' : 'attention_cross_down'
else if (factors.rangeBreak) type = direction === 'up' ? 'breakout_up' : 'breakdown_down'
else if (factors.turnoverSurge && direction !== 'neutral') type = direction === 'up' ? 'momentum_up' : 'momentum_down'
else if (factors.extremePrice) type = direction === 'up' ? 'price_spike_up' : 'price_spike_down'
else return noCandidate
```

All other factors remain in evidence/score. `score < 50` returns no user candidate. Never include buy/sell language.

- [ ] **Step 8: Verify engine and commit**

```bash
pnpm --filter @fly-living/api-worker test -- market-signal-engine.spec.ts
pnpm --filter @fly-living/api-worker typecheck
grep -RInE 'Math\.random|buy|sell|买点|卖点' workers/api/src/features/market/signal-engine.ts
```

Expected: all tests PASS; grep has no prohibited behavior. Commit:

```bash
git add workers/api/src/features/market/signal-engine.ts
git commit -m "feat: add balanced market signal engine"
```

### Task 3: D1-backed `MarketSignalService`

**Files:**
- Create: `workers/api/src/features/market/signal-service.ts`
- Test: `workers/api/test/market-signal-service.spec.ts`
- Modify test fixture DB setup as needed in that file only.

**Interfaces:**
- Consumes `evaluateMarketSignal()` and `BALANCED_SIGNAL_ENGINE_VERSION`.
- Produces:

```ts
export interface SignalWatchlistTarget {
  ownerId: string
  watchlist: WatchlistItem
}

export interface SignalEvaluationSummary {
  evaluatedCount: number
  readyCount: number
  warmingCount: number
  signalCount: number
  strongCount: number
}

export class MarketSignalService {
  constructor(private readonly env: Env, private readonly now: () => Date = () => new Date()) {}
  evaluateAffected(targets: SignalWatchlistTarget[]): Promise<SignalEvaluationSummary>
  list(ownerId: string, options?: { scope?: 'today' | 'recent', limit?: number, symbol?: StockSymbol }): Promise<MarketSignalDeskResponse>
  cleanupRetention(): Promise<{ deleted: number }>
}
```

- [ ] **Step 1: Write RED tests for one batched history read and owner isolation**

Seed two owners and multiple symbols. Instrument the fake D1 prepare/all calls so `evaluateAffected()` proves history is loaded through one bounded query for the target batch rather than one query per symbol. Include a target from owner A and a same-symbol row from owner B; owner B history must never influence A.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @fly-living/api-worker test -- market-signal-service.spec.ts
```

Expected: FAIL because MarketSignalService is absent.

- [ ] **Step 3: Implement bounded history loading**

Query only necessary columns and a fixed cutoff:

```sql
SELECT owner_id, symbol, bucket_at, market_at, price,
       previous_close, turnover, source_id
FROM market_watchlist_quote_5m
WHERE market_at >= ?
  AND owner_id IN (...)
  AND symbol IN (...)
ORDER BY owner_id, symbol, market_at, bucket_at
```

Use an 8-natural-day cutoff from `this.now()`. After query, filter by exact `(ownerId,symbol)` target pairs in memory before grouping. Do not select `high_price/low_price` for range logic.

- [ ] **Step 4: Write RED cooldown/idempotency tests**

Seed recent rows and assert:

```ts
// ordinary same direction inside 20m -> suppressed
// attention same direction inside 30m -> suppressed
// opposite direction -> allowed
// strong score >= prior watch + 15 -> allowed as a new row
// same unique bucket/type/version twice -> one persisted row
```

- [ ] **Step 5: Implement candidate persistence safely**

Load all recent same-owner/symbol signal rows needed for the 30-minute cooldown in one bounded query. Decide suppression in memory. Generate a stable opaque ID using SHA-256, never embedding ownerId into the API-visible ID:

```ts
async function stableSignalId(key: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return `sig_${[...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 32)}`
}
```

Persist with `INSERT OR IGNORE`; UNIQUE remains the final idempotency guard. `evidence_json` is constructed from `MarketSignalEvidence`, never spread from an upstream object.

- [ ] **Step 6: Write RED list/baseline/retention tests**

Cover:
- `scope=today` Shanghai day boundaries.
- `scope=recent` bounded 7 calendar days.
- limit ordering newest-first.
- owner/symbol filters.
- enabled/ready/warming counts.
- 30-day cleanup only deletes signal rows.
- deleting a `market_watchlist` row cascades its signals but leaves `market_watchlist_quote_5m` intact.

- [ ] **Step 7: Implement list and retention**

`list()` reuses the same bounded history loader to compute baseline readiness for enabled owner watchlist rows and separately queries persisted signals. Parse `evidence_json` through a whitelist parser; malformed evidence yields safe null fields/empty factors rather than throwing raw JSON into the response.

`cleanupRetention()` executes only:

```sql
DELETE FROM market_watchlist_signal WHERE market_at < ?
```

using `now - 30 days`.

- [ ] **Step 8: Verify service and commit**

```bash
pnpm --filter @fly-living/api-worker test -- market-signal-engine.spec.ts market-signal-service.spec.ts
pnpm --filter @fly-living/api-worker typecheck
```

Expected: PASS. Commit production service only:

```bash
git add workers/api/src/features/market/signal-service.ts
git commit -m "feat: persist private market signals"
```

---

### Task 4: Integrate signal evaluation with P2A snapshot sync and maintenance

**Files:**
- Modify: `workers/api/src/features/market/watchlist-service.ts`
- Modify: `workers/api/src/scheduled-tasks.ts`
- Test: `workers/api/test/market-watchlist.spec.ts`
- Test: `workers/api/test/scheduled.spec.ts`

**Interfaces:**
- `WatchlistService` receives an optional `MarketSignalService` dependency as the fourth constructor argument so existing three-argument tests remain valid.
- Existing `ScheduledJob` union and `scheduledJobsFor('*/5 * * * *')` must not change.

- [ ] **Step 1: Write RED sequencing tests**

Inject a signal-service stub:

```ts
const signals = { evaluateAffected: vi.fn().mockResolvedValue({
  evaluatedCount: 1, readyCount: 1, warmingCount: 0, signalCount: 1, strongCount: 0,
}) }
const service = new WatchlistService(env, provider(), now, signals as never)
```

Assert:
- a successful sync persists the quote before `evaluateAffected()` is called;
- provider failure calls it zero times;
- partial provider result evaluates only successfully persisted symbols;
- snapshot D1 failure calls it zero times;
- signal-service failure rejects the job so Queue retry can occur.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @fly-living/api-worker test -- market-watchlist.spec.ts scheduled.spec.ts
```

Expected: new sequencing tests FAIL.

- [ ] **Step 3: Add optional SignalService dependency and call it after successful batch write**

Constructor becomes:

```ts
constructor(
  private readonly env: Env,
  private readonly provider: StockQuoteProvider = new EastMoneyStockQuoteProvider(),
  private readonly now: () => Date = () => new Date(),
  private readonly signals: Pick<MarketSignalService, 'evaluateAffected'> = new MarketSignalService(env, now),
) {}
```

After the quote D1 batch succeeds, map successful rows to `{ ownerId, watchlist: rowToItem(row) }` and call `evaluateAffected()`. Do not evaluate `missing` symbols.

- [ ] **Step 4: Prove delete cascade with a watchlist test**

Seed one watchlist row, one signal, one quote_5m snapshot, call `remove()`, and assert signal=0 rows while quote_5m remains. Do not add a second imperative signal delete in `WatchlistService`; the migration foreign key is the lifecycle mechanism.

- [ ] **Step 5: Write RED maintenance regression**

Update `ScheduledTaskServices` test stub only as needed to preserve current job routing. Add a service-level test that `content-maintenance` returns `{ news, finance, marketSignals }` while `scheduledJobsFor('*/5')` is still exactly:

```ts
['news-sync', 'finance-sync', 'market-sync', 'market-watchlist-sync']
```

- [ ] **Step 6: Wire retention into existing content maintenance**

In `scheduled-tasks.ts` import `MarketSignalService` and change only the content maintenance body:

```ts
const [news, finance, marketSignals] = await Promise.all([
  new NewsService(env).cleanupRetention(),
  new FinanceFlashService(env).cleanupRetention(),
  new MarketSignalService(env).cleanupRetention(),
])
return { news, finance, marketSignals }
```

No new ScheduledJob value and no new Cron mapping.

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter @fly-living/api-worker test -- market-watchlist.spec.ts market-signal-service.spec.ts scheduled.spec.ts
pnpm --filter @fly-living/api-worker typecheck
```

Expected: PASS. Commit source changes:

```bash
git add workers/api/src/features/market/watchlist-service.ts workers/api/src/scheduled-tasks.ts
git commit -m "feat: evaluate signals after watchlist snapshots"
```

---

### Task 5: Private signal API

**Files:**
- Modify: `workers/api/src/features/market/admin-routes.ts`
- Test: `workers/api/test/market-watchlist-routes.spec.ts`

**Interfaces:**
- Adds `GET /api/admin/market/signals?scope=today|recent&limit=1..100&symbol=<StockSymbol>`.
- Reuses existing route-wide `requireSession` and `Cache-Control: private, no-store`.
- Reads use `MARKET_READ_RATE_LIMITER`.

- [ ] **Step 1: Write RED route/auth tests**

Cover:
- unauthenticated GET -> 401 `UNAUTHENTICATED`;
- authenticated default args `{scope:'today', limit:50}`;
- `scope=recent`, explicit limit, strict symbol parsing;
- invalid scope/limit/symbol -> 400;
- limiter rejection uses current middleware contract;
- response has `private, no-store`;
- service receives `session.id`, never a client-provided owner.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @fly-living/api-worker test -- market-watchlist-routes.spec.ts
```

Expected: signal route tests FAIL.

- [ ] **Step 3: Add a second optional signal factory without breaking existing watchlist tests**

Keep the existing watchlist factory signature intact and add a separate optional factory:

```ts
type AdminMarketSignalService = Pick<MarketSignalService, 'list'>
type AdminMarketSignalServiceFactory = (env: Env) => AdminMarketSignalService

export function createAdminMarketRoutes(
  watchlistFactory: AdminMarketServiceFactory = env => new DefaultWatchlistService(env),
  signalFactory: AdminMarketSignalServiceFactory = env => new MarketSignalService(env),
) {
  // existing watchlist routes continue to call watchlistFactory(c.env)
}
```

This preserves all existing `createAdminMarketRoutes(() => stub)` tests and avoids a broad route refactor. Public market routes remain independent of SignalService.

- [ ] **Step 4: Implement strict query parsing**

Use Zod:

```ts
const signalQuerySchema = z.object({
  scope: z.enum(['today', 'recent']).default('today'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  symbol: z.string().trim().min(1).max(20).optional(),
})
```

If symbol exists, normalize with `parseStockSymbol()` before service call. The service itself still enforces owner filtering.

- [ ] **Step 5: Add route with read limiter**

```ts
routes.get('/signals', async (c) => {
  const session = c.get('session')!
  const query = signalQuerySchema.safeParse(c.req.query())
  if (!query.success)
    throw new ApiError('VALIDATION_FAILED', 400, 'Signal query is invalid', query.error.flatten())
  return enforceRateLimit(c.env.MARKET_READ_RATE_LIMITER, `${session.sessionId}:market-signals`, async () => {
    const symbol = query.data.symbol ? parseStockSymbol(query.data.symbol).symbol : undefined
    return success(c, await signalFactory(c.env).list(session.id, { ...query.data, symbol }))
  })
})
```

Convert parser failures to `VALIDATION_FAILED` without exposing stack/raw input.

- [ ] **Step 6: Verify private/public boundaries and commit**

```bash
pnpm --filter @fly-living/api-worker test -- market-watchlist-routes.spec.ts market-routes.spec.ts
pnpm --filter @fly-living/api-worker typecheck
grep -RInE 'signal|attentionPrice|watchlist' workers/api/src/features/market/routes.ts
```

Expected: private tests PASS; public route file has no private signal serialization. Commit:

```bash
git add workers/api/src/features/market/admin-routes.ts
git commit -m "feat: expose private market signals"
```

### Task 6: Focused Signal Desk UI and 60-second lifecycle

**Files:**
- Create: `app/components/market/MarketSignalDesk.vue`
- Modify: `app/pages/market/index.vue`
- Test: `test/nuxt/market-terminal.spec.ts`

**Interfaces:**
- `MarketSignalDesk` props:

```ts
interface Props {
  authenticated: boolean
  sessionLoading: boolean
}
```

- Component owns only signal read/filter/poll state. It does not mutate watchlist, call a stock Provider, or own auth credentials.
- The page reuses existing `/api/auth/session` state and only ensures session loading when `activeWorkspace === 'signals'`.

- [ ] **Step 1: Write RED Nuxt source-contract tests**

Add assertions that:
- the signals placeholder `DESIGN READY` is gone;
- `MarketSignalDesk` is rendered only in the signals workspace;
- unauthenticated UI copy contains private/登录 semantics;
- signal API path exists only in the new component, not public market loading code;
- poll literal is exactly `60_000`;
- no `Math.random`/hard-coded fake signal prices exist.

Run:

```bash
pnpm test:unit -- market-terminal.spec.ts
```

Expected: FAIL before component exists.

- [ ] **Step 2: Create component state and locked/warming/empty states**

Use typed state:

```ts
const props = defineProps<Props>()
const data = ref<MarketSignalDeskResponse | null>(null)
const loading = ref(false)
const error = ref('')
const filter = ref<'all' | 'up' | 'down' | 'attention'>('all')
const requestInFlight = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let controller: AbortController | null = null
```

If `authenticated` is false, render the locked state and never call `/api/admin/market/signals`.

If authenticated with `baseline.warmingCount > 0` and zero items, show “基线积累中”. If baseline is ready and zero items, show the normal balanced-rule empty state.

- [ ] **Step 3: Implement strict signal trading window locally**

Do not reuse P2A's wider provider-sync window. The component's poll window is:

```ts
function isSignalTradingWindow(value = new Date()) {
  // Asia/Shanghai Mon-Fri
  // 09:30–11:30 or 13:00–15:00
}
```

Use `Intl.DateTimeFormat(... timeZone:'Asia/Shanghai')` or fixed +8 arithmetic. Weekend returns false.

- [ ] **Step 4: Implement fetch/poll concurrency and abort**

`loadSignals()` does one private GET with a fresh AbortController only when authenticated and no request is already in flight. `startPolling()` sets `setInterval(..., 60_000)` only while document is visible and inside `isSignalTradingWindow()`.

Watch `props.authenticated`; add/remove `visibilitychange`; on unmount clear timer and abort. A manual refresh button calls the same `loadSignals()` so automatic/manual requests cannot overlap.

- [ ] **Step 5: Implement Desktop/Mobile signal presentation**

Desktop shows summary counters and rows. Mobile uses cards through CSS media query rather than compressing a wide table. Filter logic is computed only:

```ts
const filtered = computed(() => data.value?.items.filter((item) => {
  if (filter.value === 'all') return true
  if (filter.value === 'attention') return item.signalType.startsWith('attention_cross_')
  return item.direction === filter.value
}) ?? [])
```

Use red for up, green for down, neutral muted. Render evidence labels from numeric fields only; never render raw JSON.

- [ ] **Step 6: Wire the page without duplicating session state**

Import `MarketSignalDesk`. In the active workspace watcher:

```ts
if (workspace === 'watchlist')
  void activateWatchlist()
else if (workspace === 'signals')
  void loadWatchlistSession()
else
  stopWatchlistPolling({ abort: true })
```

Ensure leaving watchlist still stops quote polling when entering signals. Replace the placeholder section with:

```vue
<MarketSignalDesk
  v-else-if="activeWorkspace === 'signals'"
  :authenticated="watchlistAuthenticated"
  :session-loading="watchlistSessionLoading"
/>
```

Update header build label `P2A` → `P2B` only after real Signal Desk exists.

- [ ] **Step 7: Run unit/source tests and commit**

```bash
pnpm test:unit -- market-terminal.spec.ts
pnpm typecheck
```

Expected: PASS. Commit production UI:

```bash
git add app/components/market/MarketSignalDesk.vue app/pages/market/index.vue
git commit -m "feat: add private market signal desk"
```

---

### Task 7: Read-only replay and noise gate

**Files:**
- Create: `scripts/replay-market-signals.ts`
- Test: `workers/api/test/market-signal-engine.spec.ts`
- Evidence append later: `docs/superpowers/acceptance/2026-08-23-watchlist-signal-radar-p2b.md`

**Interfaces:**
- Replay script consumes JSON exported by a read-only D1 `SELECT`; it never has Cloudflare credentials or D1 write logic.
- Output redacts real symbols to ordinal aliases while reporting per-stock/day counts and aggregate anomalies.

- [ ] **Step 1: Add a deterministic replay fixture mode**

The script accepts a file path and evaluates grouped rows with the same `evaluateMarketSignal()` used in production. It assigns `stock-01`, `stock-02`, … based on sorted symbol order and prints:

```ts
interface ReplayReport {
  engineVersion: 'balanced-v1'
  rowCount: number
  stockCount: number
  tradeDayCount: number
  signals: number
  strongSignals: number
  maxSignalsPerStockDay: number
  invalidCrossDayFlowSignals: number
  invalidLunchFlowSignals: number
  invalidGapFlowSignals: number
  invalidNegativeDeltaSignals: number
  perStockDay: Array<{ alias: string, date: string, signals: number, strong: number }>
}
```

Do not print owner IDs, raw symbol list, notes, attention prices, or upstream payload.

- [ ] **Step 2: Verify fixture replay locally**

```bash
pnpm exec unrun scripts/replay-market-signals.ts workers/api/test/fixtures/market-signal-replay.json
```

If a committed fixture file is undesirable under current test-file policy, generate it under `/private/tmp` during the test and keep it untracked. Expected: deterministic JSON report and zero invalid flow signals.

- [ ] **Step 3: Export production history with SELECT only**

Never run the SELECT without output redirection because raw rows include private symbols. Use:

```bash
pnpm --filter @fly-living/api-worker exec wrangler d1 execute DB --remote --json \
  --command "SELECT q.owner_id,q.symbol,q.bucket_at,q.market_at,q.price,q.previous_close,q.turnover,q.source_id,w.stock_code,w.stock_name,w.attention_price,w.enabled FROM market_watchlist_quote_5m q JOIN market_watchlist w ON w.owner_id=q.owner_id AND w.symbol=q.symbol WHERE q.market_at >= datetime('now','-8 days') ORDER BY q.owner_id,q.symbol,q.market_at,q.bucket_at" \
  > /private/tmp/p2b-signal-replay.json
```

This command is read-only by construction: exactly one `SELECT`, no migration/write flag, no redirect back to D1.

- [ ] **Step 4: Run production replay with redacted output**

```bash
pnpm exec unrun scripts/replay-market-signals.ts /private/tmp/p2b-signal-replay.json > /private/tmp/p2b-signal-report.json
cat /private/tmp/p2b-signal-report.json
```

Gate:
- invalid cross-day/lunch/gap/negative-delta flow signals = 0;
- ordinary single flow surge never persisted;
- cooldown duplication = 0;
- if enough history exists, average signals <=6/stock/trading-day;
- if fewer than the necessary history days exist, record “样本不足” rather than manufacturing a PASS for long-term density.

- [ ] **Step 5: Verify no production mutation happened**

Before/after replay, query only aggregate row counts from `market_watchlist_signal` if the migration is already local only; before production deploy it should not exist remotely, so the replay must not depend on that table. The exported source is only P2A `quote_5m` + watchlist metadata.

Delete `/private/tmp/p2b-signal-replay.json` after recording redacted evidence.

- [ ] **Step 6: Commit replay script**

```bash
pnpm exec eslint scripts/replay-market-signals.ts
git add scripts/replay-market-signals.ts
git commit -m "test: add market signal replay gate"
```

---

### Task 8: Full verification, browser acceptance, deploy and production smoke

**Files:**
- Modify evidence only: `docs/superpowers/acceptance/2026-08-23-watchlist-signal-radar-p2b.md`
- No new product scope in this task.

**Interfaces:**
- Completes AC N1–N18.
- Production target remains `main`, existing Workers Production and Pages Production workflows.

- [ ] **Step 1: Run focused P2B suite**

```bash
pnpm --filter @fly-living/api-worker test -- \
  market-signal-engine.spec.ts \
  market-signal-service.spec.ts \
  market-watchlist.spec.ts \
  market-watchlist-routes.spec.ts \
  scheduled.spec.ts
pnpm test:unit -- market-terminal.spec.ts
```

Expected: all P2B and touched regression tests PASS.

- [ ] **Step 2: Current-agent code review before integration**

Review production diff from `dc59547` to HEAD for:
- no daily high/low used as 30m range;
- no provider/Cron/full-market expansion;
- private owner filtering and no-store;
- no raw evidence spread/logging;
- exact score/cooldown thresholds;
- failure paths fail closed;
- no buy/sell language;
- no remaining Critical/Important.

Any Critical/Important issue returns to the relevant task with a red test before fix.

- [ ] **Step 3: Run total repository gate**

```bash
git diff --check
pnpm verify
```

Expected: exit 0, link checker 0 errors/warnings, smoke PASS, secret scan PASS.

- [ ] **Step 4: Cloudflare dry-run**

```bash
pnpm --filter @fly-living/api-worker exec wrangler deploy --dry-run
pnpm --filter @fly-living/edge-worker exec wrangler deploy --dry-run
```

Record upload/gzip sizes and bindings; no deploy yet.

- [ ] **Step 5: Local/preview browser acceptance**

Use the existing static/Nuxt preview and current AgentDock Chrome browser. Cover:
- unauthenticated signals -> locked and zero private signal request;
- fixture-authenticated warming, empty, watch, strong, up/down, attention filter;
- 60s fake/network lifecycle plus hidden/workspace stop;
- 320/360/390/430/768/1024/1280/1440/1728 no document overflow;
- 390×844 Mobile card and 1440×900 Desktop;
- light/dark/dynamic, reduced motion/transparency, SPA `/market -> /` cleanup;
- final console/page/network error = 0.

Use test fixtures only in the local preview path; do not seed production D1.

- [ ] **Step 6: Mark only evidenced AC items**

Update the 166-item AC checklist mechanically from real evidence. Long-term multi-trading-day density remains explicitly deferred if history is insufficient; do not mark it as a fake immediate PASS. Re-run:

```bash
python3 - <<'PY'
from pathlib import Path
s=Path('docs/superpowers/acceptance/2026-08-23-watchlist-signal-radar-p2b.md').read_text()
print('checked', s.count('- [x]'), 'unchecked', s.count('- [ ]'))
PY
```

Immediate deploy blockers must have zero unchecked items except criteria explicitly phrased as long-term observation with a documented honest status.

- [ ] **Step 7: Commit production candidate and push `main`**

Confirm no untracked test files are staged. Commit final production/evidence changes, fetch remote, ensure fast-forward, then:

```bash
git push origin HEAD:main
```

Record final production candidate SHA.

- [ ] **Step 8: Observe Workers Production to completion**

Require the final SHA workflow to PASS:
- install/frozen lockfile;
- typecheck;
- worker tests;
- D1 migration 0016;
- API Worker deploy;
- Edge Worker deploy;
- same-origin health.

Failure means read the failing job, fix with TDD, push a new SHA and wait again.

- [ ] **Step 9: Ensure Pages Production runs for the same final SHA**

If the final commit changes `app/**`, push will trigger Pages. If a final follow-up commit is docs/tests-only and paths-ignore skips Pages, dispatch Pages Production for the final SHA just as P2A did. Require source_quality/build/deploy/production probe PASS.

- [ ] **Step 10: Production API smoke**

Verify:

```text
GET /api/health                                  -> 200 JSON
GET /api/market/overview                         -> 200 JSON
GET /api/admin/market/signals (no session)       -> 401 UNAUTHENTICATED
GET /api/admin/market/watchlist (no session)     -> 401 UNAUTHENTICATED
```

Do not log authenticated private signal payload in public evidence.

- [ ] **Step 11: Production browser smoke**

Use real Chrome at 1440×900 and 390×844:
- `/market` loads P2B;
- switching to signals unauthenticated shows private locked state;
- no signal/watchlist private data is visible;
- public radar/funds still work;
- SPA return to `/` is clean;
- console/page/network errors = 0.

Authenticated production Signal Desk can be checked with an existing safe session if available; do not manufacture a session or seed fake signals solely for acceptance.

- [ ] **Step 12: Final acceptance record and task closeout**

Append final SHA, Workers/Pages run IDs, migration result, replay summary, total test counts, dry-run sizes and browser evidence. Explicitly state one of:
- `长期信号密度 SLA：样本足够并通过`; or
- `长期信号密度 SLA：样本不足，未宣称通过`.

Then final-review the AgentDock task with all immediate completion conditions, complete it only after production smoke is real.
