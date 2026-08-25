# 资金观察连续流向 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在“资金观察 → 板块资金”中基于每日主力净流入显示可信的连续流入/流出交易日数，并完成生产发布。

**Architecture:** 复用 `MarketService.decorateSectorWindows()` 已读取的最近 20 个板块日资金值，在后端按 A 股实际交易日计算 streak，扩展 `SectorFlowItem` API 契约；前端只格式化并显示 streak。遇到缺日、null 或历史范围边界时用 `complete=false` 表达“至少 N 天”，不跨缺口推断。

**Tech Stack:** TypeScript、Vue 3/Nuxt、Cloudflare Workers/D1、Vitest、Playwright、GitHub Actions、Cloudflare Wrangler。

## Global Constraints

- 连续方向只由 `mainNetInflow` 正负决定；0 或 null 不属于流入/流出。
- 缺失交易日和 null 不得被跳过。
- 不新增 D1 表，不新增行情源，不修改现有周/窗口累计口径。
- UI 使用现有红涨/绿跌语义和横向滚动表格。
- 历史范围内未观察到 streak 边界时必须使用 `≥N 天`，不得制造精确值。

---

### Task 1: 扩展 SectorFlowItem 契约并计算 streak

**Files:**
- Modify: `shared/market.ts:46-78`
- Modify: `workers/api/src/features/market/service.ts:1-20, 168-205, 487-540`
- Test: `workers/api/test/market.spec.ts:83-103, 383-434`

**Interfaces:**
- Consumes: `Map<string, number | null>` 的每日 `main_net_inflow`，`anchorDate`，`isChinaAShareTradingDate()`。
- Produces: `SectorFlowItem.streak: { direction: 'inflow' | 'outflow' | 'neutral'; days: number; complete: boolean }`。

- [ ] **Step 1: 写失败的后端测试**

在 `workers/api/test/market.spec.ts` 的 sector history describe 中新增场景，至少断言：

```ts
expect(item?.streak).toEqual({ direction: 'inflow', days: 3, complete: true })
expect(outflowItem?.streak).toEqual({ direction: 'outflow', days: 2, complete: true })
expect(zeroItem?.streak).toEqual({ direction: 'neutral', days: 0, complete: true })
expect(gappedItem?.streak).toEqual({ direction: 'inflow', days: 2, complete: false })
```

其中历史数据通过现有 `market_sector_flow_daily` seed/UPDATE/DELETE 方式构造，明确覆盖方向反转、0、null、缺失交易日和只有最新日的场景。

- [ ] **Step 2: 运行定向测试确认先失败**

Run: `pnpm --dir workers/api test -- market.spec.ts`
Expected: FAIL，原因是 `SectorFlowItem` 尚无 `streak` 或返回值缺失。

- [ ] **Step 3: 扩展共享类型**

在 `shared/market.ts` 增加：

```ts
export type SectorFlowStreakDirection = 'inflow' | 'outflow' | 'neutral'

export interface SectorFlowStreak {
  direction: SectorFlowStreakDirection
  days: number
  complete: boolean
}

export interface SectorFlowItem extends SectorFlowQuote {
  windows: SectorFlowWindow[]
  weeks: SectorFlowWeek[]
  streak: SectorFlowStreak
}
```

- [ ] **Step 4: 实现交易日序列与 streak 纯函数**

在 `workers/api/src/features/market/service.ts` 引入 `SectorFlowStreak`，增加最近交易日生成与计算函数。核心规则必须等价于：

```ts
function sectorRecentTradingDates(anchorDate: string, limit: number): string[] {
  const parsed = Date.parse(`${anchorDate}T00:00:00.000Z`)
  if (!Number.isFinite(parsed) || limit < 1)
    return []
  const dates: string[] = []
  for (let offset = 0; dates.length < limit && offset < 64; offset += 1) {
    const dateKey = new Date(parsed - offset * DAY_MS).toISOString().slice(0, 10)
    if (isChinaAShareTradingDate(new Date(`${dateKey}T04:00:00.000Z`)))
      dates.push(dateKey)
  }
  return dates
}

function sectorFlowStreak(values: Map<string, number | null>, anchorDate: string, limit = 20): SectorFlowStreak {
  const dates = sectorRecentTradingDates(anchorDate, limit)
  const first = values.get(anchorDate) ?? null
  if (first === null || first === 0)
    return { direction: 'neutral', days: 0, complete: true }

  const direction = first > 0 ? 'inflow' : 'outflow'
  let days = 0
  for (const date of dates) {
    if (!values.has(date) || values.get(date) === null)
      return { direction, days, complete: false }
    const value = values.get(date)!
    if (value === 0 || (value > 0) !== (first > 0))
      return { direction, days, complete: true }
    days += 1
  }
  return { direction, days, complete: false }
}
```

实现可以在类型细节上微调，但不得跳过缺口，也不得在遍历完整历史范围后把结果标为精确。

- [ ] **Step 5: 把 streak 接入现有装饰流程**

`decorateSectorWindows()` 在 `values.set(anchorDate, item.mainNetInflow)` 后，将：

```ts
streak: sectorFlowStreak(values, anchorDate),
```

与现有 `windows`、`weeks` 一并返回，live/fallback 自动共享同一逻辑。

- [ ] **Step 6: 运行后端定向测试**

Run: `pnpm --dir workers/api test -- market.spec.ts`
Expected: PASS，新增 streak 场景全部通过，现有窗口累计测试保持通过。

- [ ] **Step 7: 提交后端契约与计算**

```bash
git add shared/market.ts workers/api/src/features/market/service.ts workers/api/test/market.spec.ts
git commit -m "feat: 增加板块资金连续流向计算"
```

### Task 2: 在资金观察表格展示连续流向

**Files:**
- Modify: `app/pages/market/index.vue:329-360, 1318-1355, 2697-2778, 4355-4369`
- Test: `test/nuxt/market-terminal.spec.ts:258-298`

**Interfaces:**
- Consumes: `SectorFlowItem.streak`。
- Produces: “连续流向”表格列和 `formatSectorFlowStreak()` 文案。

- [ ] **Step 1: 写失败的页面契约测试**

在 `test/nuxt/market-terminal.spec.ts` 增加断言：

```ts
expect(page).toContain('<th>连续流向</th>')
expect(page).toContain('formatSectorFlowStreak(item)')
expect(page).toContain("item.streak.direction")
expect(page).toContain('market-flow-streak')
expect(page).toContain('连续流入')
expect(page).toContain('连续流出')
expect(page).toContain('暂无连续')
```

同时更新表格最小宽度断言，保证移动端仍通过横向滚动承载新增列。

- [ ] **Step 2: 运行 Nuxt 定向测试确认先失败**

Run: `pnpm vitest run test/nuxt/market-terminal.spec.ts`
Expected: FAIL，页面尚无 streak 列。

- [ ] **Step 3: 增加 streak 文案格式化函数**

在 `app/pages/market/index.vue` 的资金格式化 helper 附近增加：

```ts
function formatSectorFlowStreak(item: SectorFlowItem) {
  const { streak } = item
  if (streak.direction === 'neutral' || streak.days < 1)
    return '暂无连续'
  const direction = streak.direction === 'inflow' ? '流入' : '流出'
  const days = streak.complete ? String(streak.days) : `≥${streak.days}`
  return `连续${direction} ${days} 天`
}
```

- [ ] **Step 4: 增加表头与单元格**

在“今日主力”后加入：

```vue
<th>连续流向</th>
```

每行加入：

```vue
<td class="market-flow-streak-cell">
  <b class="market-flow-streak" :data-direction="item.streak.direction">
    {{ formatSectorFlowStreak(item) }}
  </b>
</td>
```

并把搜索空状态 `colspan` 从 7 调整为 8。

- [ ] **Step 5: 增加语义样式并调整表宽**

桌面表格最小宽度从 `62rem` 增至约 `69rem`，移动端从 `54rem` 增至约 `61rem`；新增：

```css
.market-flow-streak-cell { min-width: 7rem; }
.market-flow-streak[data-direction='inflow'] { color: var(--market-up); }
.market-flow-streak[data-direction='outflow'] { color: var(--market-down); }
.market-flow-streak[data-direction='neutral'] { color: var(--market-text-3); }
```

项目已确认存在 `--market-up`、`--market-down` 与 `--market-text-3`，实现直接复用这些变量，不能新增重复色值。

- [ ] **Step 6: 运行页面定向测试**

Run: `pnpm vitest run test/nuxt/market-terminal.spec.ts`
Expected: PASS。

- [ ] **Step 7: 提交页面展示**

```bash
git add app/pages/market/index.vue test/nuxt/market-terminal.spec.ts
git commit -m "feat: 展示板块资金连续流向"
```

### Task 3: 全量验证与生产发布

**Files:**
- Verify only; no planned source changes unless验证发现真实缺陷。

**Interfaces:**
- Consumes: Task 1/2 的完整功能。
- Produces: 生产可访问的 `/market` 连续流向展示。

- [ ] **Step 1: 运行源代码质量门禁**

Run: `pnpm verify:pages-source`
Expected: exit 0，lint/typecheck/unit 无失败。

- [ ] **Step 2: 运行 Pages 构建门禁**

Run: `pnpm verify:pages`
Expected: exit 0，generate、link checker、smoke、secrets 检查全部通过。

- [ ] **Step 3: 检查最终差异**

Run: `git diff --check main...HEAD && git status --short`
Expected: 无 whitespace error；仅计划内文件发生修改/提交。当前宿主 worktree 无法挂载到执行容器，因此本轮本地命令执行不可用时，以 feature PR 的 GitHub Actions Quality + Pages Preview 作为合并前真实验证，不把未执行的本地命令报告为通过。

- [ ] **Step 4: 推送发布分支并触发 CI**

推送当前 feature branch；若仓库要求 PR，则创建 PR 并等待 Quality/Preview 绿灯。必要时使用现有 AgentDock Edge 登录态完成 GitHub UI 写操作，不暴露 cookie/token。

- [ ] **Step 5: 合并/更新 main 并等待 Pages Production**

确认 `main` 包含新提交后，等待 `.github/workflows/pages-production.yml`：

- `source_quality = success`
- `build_pages = success`
- `production_mobile_quality = success`
- `deploy_production = success`

- [ ] **Step 6: 线上 smoke**

检查 `https://flyovo.cc.cd/market`：

- HTTP 200。
- 页面包含“连续流向”。
- 加载 `/api/market/sector-flows?kind=industry&limit=600` 后，数据项包含 `streak.direction/days/complete`。
- 页面至少渲染一个 `连续流入`、`连续流出` 或 `暂无连续` 状态。

- [ ] **Step 7: 关闭任务**

只有生产 workflow 和线上 smoke 均通过后才标记 AgentDock 任务完成。
