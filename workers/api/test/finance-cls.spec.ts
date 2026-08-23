import { describe, expect, it, vi } from 'vitest'
import { ClsFinanceFlashAdapter, mapClsFinanceItems, signClsFinanceParams } from '../src/features/finance/cls'

describe('cls finance adapter', () => {
	it('matches the current CLS web signature algorithm', () => {
		expect(signClsFinanceParams({
			app: 'CailianpressWeb',
			category: 'announcement',
			last_time: 1787507729,
			os: 'web',
			refresh_type: 1,
			rn: 20,
			sv: '8.7.9',
		})).toBe('cb923f944fafc57d08c4543360e37ba9')
	})

	it('maps CLS telegraphs into the shared finance contract and preserves upstream red level', () => {
		const items = mapClsFinanceItems({
			errno: 0,
			msg: '',
			data: {
				roll_data: [
					{
						id: 2461779,
						ctime: 1787500456,
						level: 'B',
						title: '中际旭创：2027年1.6T和800G订单需求仍保持快速增长',
						brief: '【中际旭创：2027年1.6T和800G订单需求仍保持快速增长】财联社8月23日电，公司正在积极开发2.4T、NPO、XPO等新产品。',
						shareurl: 'https://api3.cls.cn/share/article/2461779?os=web',
						stock_list: [{ name: '中际旭创', StockID: 'sz300308' }],
						subjects: [{ subject_name: '机构调研动向', channel: 'stib,cls' }],
					},
					{
						id: 2461790,
						ctime: 1787509502,
						level: 'C',
						brief: '财联社8月24日电，日本据悉拟以1.25亿美元公私合作基金支持核聚变与回收初创企业。',
						shareurl: 'https://api3.cls.cn/share/article/2461790?os=web',
						subjects: [{ subject_name: '环球市场情报', channel: 'cls' }],
					},
				],
			},
		})

		expect(items).toHaveLength(2)
		expect(items[0]).toMatchObject({
			id: '2461779',
			category: 'company',
			categoryLabel: '公司',
			topic: '机构调研',
			important: true,
			importanceOrigin: 'upstream',
			importanceScore: 2,
			sourceName: '财联社',
			sourceUrl: 'https://api3.cls.cn/share/article/2461779?os=web',
		})
		expect(items[0]?.summary).toBe('公司正在积极开发2.4T、NPO、XPO等新产品。')
		expect(items[1]).toMatchObject({
			id: '2461790',
			category: 'tech',
			important: false,
			importanceScore: 1,
			sourceName: '财联社',
		})
		expect(items[1]?.title).toContain('核聚变')
	})

	it('does not rebind the native fetch function to the adapter instance', async () => {
		const responses = [
			{ errno: 0, data: { roll_data: [{ id: 9, ctime: 190, level: 'C', brief: '财联社1月1日电，绑定检查快讯。', shareurl: 'https://api3.cls.cn/share/article/9' }] } },
			{ errno: 0, data: { roll_data: [] } },
		]
		const nativeLikeFetch = vi.fn(function (this: unknown) {
			if (this !== undefined && this !== globalThis)
				throw new TypeError('Illegal invocation')
			return Promise.resolve(new Response(JSON.stringify(responses.shift()), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}))
		})
		vi.stubGlobal('fetch', nativeLikeFetch)
		try {
			const items = await new ClsFinanceFlashAdapter().fetch()
			expect(items.map(item => item.id)).toEqual(['9'])
			expect(nativeLikeFetch).toHaveBeenCalledTimes(2)
		}
		finally {
			vi.unstubAllGlobals()
		}
	})

	it('paginates with the oldest telegraph timestamp and sends a valid dynamic signature', async () => {
		const responses = [
			{
				errno: 0,
				data: {
					roll_data: [
						{ id: 2, ctime: 200, level: 'C', brief: '财联社1月1日电，第二条市场快讯。', shareurl: 'https://api3.cls.cn/share/article/2' },
						{ id: 1, ctime: 190, level: 'C', brief: '财联社1月1日电，第一条市场快讯。', shareurl: 'https://api3.cls.cn/share/article/1' },
					],
				},
			},
			{ errno: 0, data: { roll_data: [] } },
		]
		const fetchImpl = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify(responses.shift()), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		}))
		const adapter = new ClsFinanceFlashAdapter(fetchImpl)
		const items = await adapter.fetch()

		expect(items.map(item => item.id)).toEqual(['2', '1'])
		expect(fetchImpl).toHaveBeenCalledTimes(2)
		const firstUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]))
		const secondUrl = new URL(String(fetchImpl.mock.calls[1]?.[0]))
		expect(firstUrl.searchParams.get('app')).toBe('CailianpressWeb')
		expect(firstUrl.searchParams.get('sign')).toMatch(/^[a-f0-9]{32}$/u)
		expect(secondUrl.searchParams.get('last_time')).toBe('190')
	})
})
