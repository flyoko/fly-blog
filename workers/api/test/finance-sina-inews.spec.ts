import { describe, expect, it, vi } from 'vitest'
import { mapSinaINewsFinanceItems, signSinaINewsParams, SinaINewsFinanceFlashAdapter } from '../src/features/finance/sina-inews'

describe('sina iNews finance adapter', () => {
	it('matches the official sorted http_build_query plus secret MD5 signing rule', () => {
		expect(signSinaINewsParams({
			typeid: '102,110,1',
			page: 1,
			app_key: 'demo-key',
			num: 10,
			ts: 1652347784,
			empty: '',
			nil: null,
		}, 'demo-secret')).toBe('5e633eea2e58086df96c70f7c21664f0')
	})

	it('maps official live7x24 fields into the finance domain', () => {
		const [item] = mapSinaINewsFinanceItems([{
			docid: '2668352',
			content: '〖世卫组织全球卫生筹资大使敦促增加低收入国家疫苗接种率〗全球卫生筹资大使表示需要提高疫苗接种率。',
			cTime: '1652347784',
			typeid: [102, 110],
		}])

		expect(item).toMatchObject({
			id: '2668352',
			title: '世卫组织全球卫生筹资大使敦促增加低收入国家疫苗接种率',
			publishedAt: '2022-05-12T09:29:44.000Z',
			category: 'overseas',
			sourceName: '新浪财经',
			sourceUrl: null,
			publicVisible: false,
		})
	})

	it('does not send a request when either official credential is missing', async () => {
		const fetchImpl = vi.fn()
		const adapter = new SinaINewsFinanceFlashAdapter({ appKey: 'demo-key' }, fetchImpl)

		expect(adapter.enabled).toBe(false)
		await expect(adapter.fetch()).rejects.toThrow(/missing credentials/i)
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it('calls the official live7x24 list endpoint with signed GET parameters when enabled', async () => {
		const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify([{
			docid: '3000001',
			content: '央行宣布开展公开市场操作。',
			cTime: '1787412000',
			typeid: [1, 7],
		}]), { status: 200, headers: { 'content-type': 'application/json' } }))
		const adapter = new SinaINewsFinanceFlashAdapter({
			appKey: 'demo-key',
			appSecret: 'demo-secret',
			typeIds: '1,3,5,7,9,10,102',
		}, fetchImpl, () => 1787412000)

		const items = await adapter.fetch()

		expect(items).toHaveLength(1)
		expect(fetchImpl).toHaveBeenCalledTimes(1)
		const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]))
		expect(requestUrl.origin + requestUrl.pathname).toBe('https://inews.finance.sina.com.cn/api/live7x24_list')
		expect(requestUrl.searchParams.get('app_key')).toBe('demo-key')
		expect(requestUrl.searchParams.get('typeid')).toBe('1,3,5,7,9,10,102')
		expect(requestUrl.searchParams.get('sign')).toMatch(/^[a-f0-9]{32}$/u)
	})
})
