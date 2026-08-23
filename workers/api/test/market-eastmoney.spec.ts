import { describe, expect, it, vi } from 'vitest'
import {
	EastMoneyMarketProvider,
	parseEastMoneyBreadth,
	parseEastMoneyIndices,
	parseEastMoneySectorFlows,
} from '../src/features/market/eastmoney'

const fetchedAt = '2026-08-24T02:30:05.000Z'
const marketTimestamp = 1787538600

function indexPayload() {
	return {
		data: {
			diff: [
				{ f12: '399006', f14: '创业板指', f2: 2788.21, f3: -0.52, f4: -14.62, f6: 210000000000, f124: marketTimestamp },
				{ f12: '000001', f14: '上证指数', f2: 3666.12, f3: 0.34, f4: 12.51, f6: 520000000000, f124: marketTimestamp },
				{ f12: '399001', f14: '深证成指', f2: 11288.45, f3: 0, f4: 0, f6: 630000000000, f124: marketTimestamp },
			],
		},
	}
}

function sectorPayload() {
	return {
		data: {
			total: 2,
			diff: [
				{
					f12: 'BK1036',
					f14: '通信设备',
					f3: 1.23,
					f62: 5020000000,
					f184: 6.51,
					f204: '中际旭创',
					f205: '300308',
					f124: marketTimestamp,
				},
				{
					f12: 'BK1710',
					f14: '先进制造风格',
					f3: '-',
					f62: null,
					f184: '-',
					f204: '',
					f205: '',
					f124: marketTimestamp,
				},
			],
		},
	}
}

function sectorPagePayload(page: number, total: number, count: number) {
	return {
		data: {
			total,
			diff: Array.from({ length: count }, (_, index) => ({
				f12: `BK${page}${String(index).padStart(3, '0')}`,
				f14: `板块 ${page}-${index}`,
				f3: index / 100,
				f62: 1_000_000 - index,
				f184: 1.2,
				f204: '龙头',
				f205: '300001',
				f124: marketTimestamp,
			})),
		},
	}
}

function jsonResponse(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json' },
	})
}

describe('eastMoney market provider parsers', () => {
	it('parses and orders the three approved index quotes without inventing zero values', () => {
		const parsed = parseEastMoneyIndices(indexPayload(), fetchedAt)

		expect(parsed.data.map(item => item.code)).toEqual(['000001', '399001', '399006'])
		expect(parsed.data[0]).toMatchObject({
			name: '上证指数',
			value: 3666.12,
			change: 12.51,
			changePct: 0.34,
			turnover: 520000000000,
		})
		expect(parsed.data[1]?.changePct).toBe(0)
		expect(parsed.marketAt).toBe(new Date(marketTimestamp * 1000).toISOString())
	})

	it('rejects an index quote when a required market number is missing', () => {
		const payload = indexPayload()
		payload.data.diff[1]!.f2 = undefined as unknown as number
		expect(() => parseEastMoneyIndices(payload, fetchedAt)).toThrow(/index/i)
	})

	it('parses breadth buckets without assuming one object per response', () => {
		const parsed = parseEastMoneyBreadth({
			data: {
				fenbu: [
					{ '-11': 12, '-3': 80, '-1': 600 },
					{ 0: 108 },
					{ 1: 900, 4: 120, 11: 35 },
				],
			},
		}, fetchedAt)

		expect(parsed.data).toEqual({
			advancing: 1055,
			declining: 692,
			flat: 108,
			total: 1855,
			limitUp: 35,
			limitDown: 12,
			marketAt: fetchedAt,
		})
	})

	it('rejects empty breadth data instead of returning a synthetic zero market', () => {
		expect(() => parseEastMoneyBreadth({ data: { fenbu: [] } }, fetchedAt)).toThrow(/breadth/i)
	})

	it('keeps empty sector money fields null and preserves leader metadata', () => {
		const parsed = parseEastMoneySectorFlows(sectorPayload(), 'industry', fetchedAt)

		expect(parsed.data[0]).toMatchObject({
			code: 'BK1036',
			name: '通信设备',
			kind: 'industry',
			changePct: 1.23,
			mainNetInflow: 5020000000,
			mainNetInflowRatio: 6.51,
			leaderStockName: '中际旭创',
			leaderStockCode: '300308',
		})
		expect(parsed.data[1]).toMatchObject({
			changePct: null,
			mainNetInflow: null,
			mainNetInflowRatio: null,
			leaderStockName: null,
			leaderStockCode: null,
		})
	})
})

describe('eastMoney market provider network fallback', () => {
	it('falls back from push2 to push2delay on HTTP failure', async () => {
		const fetchImpl = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ error: 'upstream' }, 502))
			.mockResolvedValueOnce(jsonResponse(indexPayload()))
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		const result = await provider.fetchIndices()

		expect(result.data).toHaveLength(3)
		expect(fetchImpl).toHaveBeenCalledTimes(2)
		expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).hostname).toBe('push2.eastmoney.com')
		expect(new URL(String(fetchImpl.mock.calls[1]?.[0])).hostname).toBe('push2delay.eastmoney.com')
		expect(result.source.endpoint).toContain('push2delay.eastmoney.com')
	})

	it('falls back when the primary host returns a successful HTTP response with unusable data', async () => {
		const fetchImpl = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ data: null }))
			.mockResolvedValueOnce(jsonResponse(indexPayload()))
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		const result = await provider.fetchIndices()

		expect(result.data).toHaveLength(3)
		expect(fetchImpl).toHaveBeenCalledTimes(2)
		expect(result.source.endpoint).toContain('push2delay.eastmoney.com')
	})

	it('falls back on a 4xx primary response as well as 5xx', async () => {
		const fetchImpl = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ error: 'blocked' }, 403))
			.mockResolvedValueOnce(jsonResponse(indexPayload()))
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		await expect(provider.fetchIndices()).resolves.toMatchObject({ data: expect.any(Array) })
		expect(fetchImpl).toHaveBeenCalledTimes(2)
	})

	it('configures a 2500ms abort signal for every host attempt', async () => {
		const controller = new AbortController()
		const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
		const fetchImpl = vi.fn<typeof fetch>()
			.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
			.mockResolvedValueOnce(jsonResponse(indexPayload()))
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		await provider.fetchIndices()

		expect(timeout).toHaveBeenCalledTimes(2)
		expect(timeout).toHaveBeenNthCalledWith(1, 2500)
		expect(timeout).toHaveBeenNthCalledWith(2, 2500)
		timeout.mockRestore()
	})

	it('does not hit the fallback host after a successful primary response', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(indexPayload()))
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		await provider.fetchIndices()

		expect(fetchImpl).toHaveBeenCalledTimes(1)
		expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).hostname).toBe('push2.eastmoney.com')
	})

	it('uses the correct industry and concept filters and throws after both hosts fail', async () => {
		const fetchImpl = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse(sectorPayload()))
			.mockResolvedValueOnce(jsonResponse(sectorPayload()))
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		await provider.fetchSectorFlows('industry')
		await provider.fetchSectorFlows('concept')

		expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).searchParams.get('fs')).toBe('m:90+t:2')
		expect(new URL(String(fetchImpl.mock.calls[1]?.[0])).searchParams.get('fs')).toBe('m:90+t:3')

		const failingFetch = vi.fn<typeof fetch>()
			.mockRejectedValueOnce(new Error('primary disconnected'))
			.mockResolvedValueOnce(jsonResponse({ error: 'fallback failed' }, 503))
		await expect(new EastMoneyMarketProvider(failingFetch, () => new Date(fetchedAt)).fetchIndices())
			.rejects
			.toThrow(/push2.*push2delay/i)
	})

	it('paginates sector flows until the upstream total is fully covered', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const page = Number(new URL(String(input)).searchParams.get('pn'))
			return jsonResponse(sectorPagePayload(page, 205, page < 3 ? 100 : 5))
		})
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		const result = await provider.fetchSectorFlows('industry')

		expect(result.data).toHaveLength(205)
		expect(fetchImpl).toHaveBeenCalledTimes(3)
		expect(fetchImpl.mock.calls.map(call => new URL(String(call[0])).searchParams.get('pn'))).toEqual(['1', '2', '3'])
	})

	it('fails the whole sector batch when a required page fails on both hosts', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = new URL(String(input))
			const page = Number(url.searchParams.get('pn'))
			if (page === 2)
				return jsonResponse({ error: 'page unavailable' }, 503)
			return jsonResponse(sectorPagePayload(page, 205, page < 3 ? 100 : 5))
		})
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		await expect(provider.fetchSectorFlows('concept')).rejects.toThrow(/EastMoney request failed/i)
		const failedPageHosts = fetchImpl.mock.calls
			.map(call => new URL(String(call[0])))
			.filter(url => url.searchParams.get('pn') === '2')
			.map(url => url.hostname)
		expect(failedPageHosts).toEqual(['push2.eastmoney.com', 'push2delay.eastmoney.com'])
	})

	it('requests the dedicated breadth endpoint and handles JSONP safely', async () => {
		const payload = JSON.stringify({ data: { fenbu: [{ '-11': 3, '0': 8, '11': 5 }] } })
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(`jQuery123(${payload});`, { status: 200 }))
		const provider = new EastMoneyMarketProvider(fetchImpl, () => new Date(fetchedAt))

		const result = await provider.fetchBreadth()

		expect(result.data.total).toBe(16)
		expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).hostname).toBe('push2ex.eastmoney.com')
	})
})
