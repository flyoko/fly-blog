import type { FinanceFlashDto } from '../../../shared/admin/finance'
import { describe, expect, it } from 'vitest'
import { groupFinanceEvents } from '../src/features/finance/dedupe'

function item(overrides: Partial<FinanceFlashDto> & Pick<FinanceFlashDto, 'id' | 'sourceId' | 'title' | 'publishedAt'>): FinanceFlashDto {
	return {
		id: overrides.id,
		sourceId: overrides.sourceId,
		title: overrides.title,
		summary: overrides.summary ?? null,
		publishedAt: overrides.publishedAt,
		category: overrides.category ?? 'market',
		categoryLabel: overrides.categoryLabel ?? '市场',
		topic: overrides.topic ?? null,
		important: overrides.important ?? false,
		importanceOrigin: overrides.importanceOrigin ?? 'upstream',
		importanceScore: overrides.importanceScore ?? null,
		sourceName: overrides.sourceName ?? overrides.sourceId,
		sourceUrl: overrides.sourceUrl ?? null,
	}
}

describe('finance event dedupe', () => {
	it('merges equivalent cross-source events and exposes all source metadata', () => {
		const grouped = groupFinanceEvents([
			item({
				id: 'wallstreetcn-7x24:1',
				sourceId: 'wallstreetcn-7x24',
				sourceName: '华尔街见闻',
				title: '加拿大9月8日起对美国商品加征等额反制关税',
				publishedAt: '2026-08-22T16:14:22.000Z',
				category: 'macro',
				categoryLabel: '宏观',
			}),
			item({
				id: 'cls-telegraph-7x24:2',
				sourceId: 'cls-telegraph-7x24',
				sourceName: '财联社',
				title: '对美国商品加征等额反制关税，加拿大9月8日起实施',
				publishedAt: '2026-08-22T16:17:00.000Z',
				category: 'macro',
				categoryLabel: '宏观',
			}),
		])

		expect(grouped).toHaveLength(1)
		expect(grouped[0]).toMatchObject({
			sourceId: 'cls-telegraph-7x24',
			sourceCount: 2,
			publishedAt: '2026-08-22T16:14:22.000Z',
		})
		expect(grouped[0]?.sources?.map(source => source.sourceId)).toEqual([
			'cls-telegraph-7x24',
			'wallstreetcn-7x24',
		])
	})

	it('uses Jin10 as the canonical event when an equivalent public event is available from multiple sources', () => {
		const grouped = groupFinanceEvents([
			item({
				id: 'wallstreetcn-7x24:1',
				sourceId: 'wallstreetcn-7x24',
				sourceName: '华尔街见闻',
				title: '中信建投：海外风险可控 科技等待出清',
				publishedAt: '2026-08-23T12:25:10.000Z',
			}),
			item({
				id: 'jin10-mcp-7x24:2',
				sourceId: 'jin10-mcp-7x24',
				sourceName: '金十数据',
				title: '【中信建投：海外风险可控 科技等待出清】',
				publishedAt: '2026-08-23T12:25:28.000Z',
			}),
		])

		expect(grouped).toHaveLength(1)
		expect(grouped[0]).toMatchObject({
			sourceId: 'jin10-mcp-7x24',
			sourceName: '金十数据',
			sourceCount: 2,
		})
		expect(grouped[0]?.sources?.map(source => source.sourceId)).toEqual([
			'jin10-mcp-7x24',
			'wallstreetcn-7x24',
		])
	})

	it('does not merge events with opposite market directions', () => {
		const grouped = groupFinanceEvents([
			item({ id: 'a:1', sourceId: 'a', title: '沪指午后上涨1.2%', publishedAt: '2026-08-22T06:00:00.000Z' }),
			item({ id: 'b:1', sourceId: 'b', title: '沪指午后下跌1.2%', publishedAt: '2026-08-22T06:03:00.000Z' }),
		])

		expect(grouped).toHaveLength(2)
	})

	it('does not merge events when material numbers conflict', () => {
		const grouped = groupFinanceEvents([
			item({ id: 'a:1', sourceId: 'a', title: '公司上半年净利润增长50%', publishedAt: '2026-08-22T08:00:00.000Z', category: 'company', categoryLabel: '公司' }),
			item({ id: 'b:1', sourceId: 'b', title: '公司上半年净利润增长30%', publishedAt: '2026-08-22T08:02:00.000Z', category: 'company', categoryLabel: '公司' }),
		])

		expect(grouped).toHaveLength(2)
	})

	it('does not collapse two similar updates from the same source', () => {
		const grouped = groupFinanceEvents([
			item({ id: 'a:1', sourceId: 'a', title: '美联储维持利率不变', publishedAt: '2026-08-22T18:00:00.000Z', category: 'macro', categoryLabel: '宏观' }),
			item({ id: 'a:2', sourceId: 'a', title: '美联储维持利率不变，鲍威尔稍后讲话', publishedAt: '2026-08-22T18:05:00.000Z', category: 'macro', categoryLabel: '宏观' }),
		])

		expect(grouped).toHaveLength(2)
	})

	it('does not merge similar events outside the 120-minute window', () => {
		const grouped = groupFinanceEvents([
			item({ id: 'a:1', sourceId: 'a', title: '美联储维持利率不变', publishedAt: '2026-08-22T12:00:00.000Z', category: 'macro', categoryLabel: '宏观' }),
			item({ id: 'b:1', sourceId: 'b', title: '美联储维持利率不变', publishedAt: '2026-08-22T14:01:00.000Z', category: 'macro', categoryLabel: '宏观' }),
		])

		expect(grouped).toHaveLength(2)
	})

	it('preserves decimal and percent boundaries when comparing material numbers', () => {
		const grouped = groupFinanceEvents([
			item({ id: 'a:1', sourceId: 'a', title: '指数午后上涨3.5%', publishedAt: '2026-08-22T06:00:00.000Z' }),
			item({ id: 'b:1', sourceId: 'b', title: '指数午后上涨35%', publishedAt: '2026-08-22T06:02:00.000Z' }),
		])

		expect(grouped).toHaveLength(2)
	})

	it('does not chain equivalent events into a group spanning more than 120 minutes', () => {
		const grouped = groupFinanceEvents([
			item({ id: 'a:1', sourceId: 'a', title: '美联储维持利率不变', publishedAt: '2026-08-22T12:00:00.000Z', category: 'macro', categoryLabel: '宏观' }),
			item({ id: 'b:1', sourceId: 'b', title: '美联储维持利率不变', publishedAt: '2026-08-22T13:40:00.000Z', category: 'macro', categoryLabel: '宏观' }),
			item({ id: 'c:1', sourceId: 'c', title: '美联储维持利率不变', publishedAt: '2026-08-22T15:20:00.000Z', category: 'macro', categoryLabel: '宏观' }),
		])

		expect(grouped).toHaveLength(2)
		expect(grouped.map(event => event.sourceCount)).toEqual([1, 2])
	})
})
