import { describe, expect, it } from 'vitest'
import { mapWallstreetCnFinanceItems } from '../src/features/finance/wallstreetcn'

describe('wallstreetcn finance adapter', () => {
	it('maps live items into the public finance contract', () => {
		const items = mapWallstreetCnFinanceItems({
			code: 20000,
			data: {
				items: [
					{
						id: 101,
						title: '',
						content_text: '美国7月PPI同比 4.7%，预期 4.9%。',
						display_time: 1_786_630_493,
						uri: 'https://wallstreetcn.com/livenews/101',
						channels: ['global-channel', 'us-stock-channel', 'forex-channel'],
						score: 3,
					},
					{
						id: 102,
						title: '某公司发布半年报',
						content_text: '公司上半年营收增长20%，净利润增长15%。',
						display_time: 1_786_630_400,
						uri: 'https://wallstreetcn.com/livenews/102',
						channels: ['global-channel'],
						score: 2,
					},
				],
			},
		})

		expect(items).toHaveLength(2)
		expect(items[0]).toMatchObject({
			category: 'macro',
			important: true,
			importanceOrigin: 'upstream',
			sourceName: '华尔街见闻',
		})
		expect(items[1]).toMatchObject({
			category: 'company',
			important: true,
			importanceOrigin: 'rule',
		})
		expect(items.every(item => item.sourceUrl?.startsWith('https://wallstreetcn.com/livenews/'))).toBe(true)
	})

	it('rejects malformed upstream payloads', () => {
		expect(() => mapWallstreetCnFinanceItems({ code: 50000 })).toThrow(/invalid/u)
	})
})
