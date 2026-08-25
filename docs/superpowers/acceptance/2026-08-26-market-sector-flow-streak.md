# 资金观察连续流向验收标准

## AC-1 连续流向口径

- 给定最新交易日 `mainNetInflow > 0`，返回 `streak.direction = inflow`。
- 给定最新交易日 `mainNetInflow < 0`，返回 `streak.direction = outflow`。
- 给定最新交易日 `mainNetInflow === 0` 或 `null`，返回 `streak.direction = neutral`、`days = 0`。

## AC-2 连续天数

- 从最新数据日开始按 A 股交易日逆序计数。
- 同方向连续值累加 `days`。
- 遇到反方向或明确 0 时停止，并返回 `complete = true`。
- 遇到缺失交易日或历史值为 `null` 时停止，不得跨过缺口拉取更早日，返回 `complete = false`。
- 如果当前查询历史范围内一直同方向且没有观察到边界，返回 `complete = false`。

## AC-3 API 契约

`SectorFlowItem` 必须稳定包含：

```ts
streak: {
  direction: 'inflow' | 'outflow' | 'neutral'
  days: number
  complete: boolean
}
```

live 与 stale/fallback 路径必须使用同一 streak 计算逻辑。

## AC-4 页面展示

“资金观察 → 板块资金”表格在“今日主力”之后新增“连续流向”列。

- `inflow + complete`：`连续流入 X 天`
- `outflow + complete`：`连续流出 X 天`
- `inflow + !complete`：`连续流入 ≥X 天`
- `outflow + !complete`：`连续流出 ≥X 天`
- `neutral`：`暂无连续`

流入、流出、中性分别使用现有正向、负向、弱化语义样式；新增列不能破坏桌面端 sticky 首列和移动端横向滚动。

## AC-5 不回归

- 现有 1/3/5/10/20 日窗口累计不变。
- 本周/上周/前 2 周/前 3 周累计不变。
- 行业/概念切换、搜索、分页、排序不回归。
- 无 D1 schema migration，无新增外部行情源。

## AC-6 发布

- source quality 通过。
- Pages build 通过。
- production mobile quality 中 generate、mobile performance、mobile E2E、mobile visual 全部通过。
- deploy_production 通过。
- 线上 `/market` HTTP 200，资金观察页面可见“连续流向”列及至少一个连续流入/流出或中性状态。
- 线上 `/api/market/sector-flows?kind=industry&limit=600` 至少一个数据项包含 `streak.direction`、`streak.days`、`streak.complete`。
