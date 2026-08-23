import type { StockSymbol } from '../../../shared/market'
import { describe, expect, it, vi } from 'vitest'
import {
	EastMoneyStockQuoteProvider,
	parseEastMoneyStockQuotes,
	parseStockSymbol,
	toEastMoneySecid,
} from '../src/features/market/eastmoney-stock'

const fetchedAt = '2026-08-24T02:30:05.000Z'
const marketTimestamp = 1787538600
const symbols: StockSymbol[] = ['SZSE:300308', 'SZSE:300502', 'SSE:601899']

function stockPayload(rows: Array<Record<string, unknown>> = [
	{ f12: '300502', f14: '新易盛', f2: 82.41, f3: 1.87, f4: 1.51, f5: 123456, f6: 3768000000, f8: 3.12, f15: 83.10, f16: 80.21, f17: 80.90, f18: 80.90, f124: marketTimestamp },
	{ f12: '601899', f14: '紫金矿业', f2: 15.62, f3: 0.77, f4: 0.12, f5: 987654, f6: 4216000000, f8: 1.56, f15: 15.78, f16: 15.42, f17: 15.48, f18: 15.50, f124: marketTimestamp },
	{ f12: '300308', f14: '中际旭创', f2: 158.72, f3: 3.28, f4: 5.04, f5: 234567, f6: 5432000000, f8: 2.72, f15: 160.85, f16: 153.20, f17: 154.00, f18: 153.68, f124: marketTimestamp },
]) {
	return { data: { total: rows.length, diff: rows } }
}

function jsonResponse(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

describe('stock symbol normalization', () => {
	it('accepts strict SSE/SZSE/BSE symbols and maps provider secids', () => {
		expect(parseStockSymbol('SSE:601899')).toEqual({ symbol: 'SSE:601899', exchange: 'SSE', code: '601899' })
		expect(parseStockSymbol('SZSE:300308')).toEqual({ symbol: 'SZSE:300308', exchange: 'SZSE', code: '300308' })
		expect(parseStockSymbol('BSE:920001')).toEqual({ symbol: 'BSE:920001', exchange: 'BSE', code: '920001' })
		expect(toEastMoneySecid('SSE:601899')).toBe('1.601899')
		expect(toEastMoneySecid('SZSE:300308')).toBe('0.300308')
		expect(toEastMoneySecid('BSE:920001')).toBe('0.920001')
	})

	it.each(['300308', 'NYSE:300308', 'SZSE:../300308', 'SSE:300308', 'SZSE:601899', 'BSE:300308'])('rejects unsafe or exchange-inconsistent symbol %s', (value) => {
		expect(() => parseStockSymbol(value)).toThrow(/symbol/i)
	})
})

describe('eastMoney stock quote parser', () => {
	it('maps an out-of-order response back to requested standard symbols', () => {
		const parsed = parseEastMoneyStockQuotes(stockPayload(), symbols, fetchedAt)
		expect([...parsed.quotes.keys()]).toEqual(symbols)
		expect(parsed.quotes.get('SZSE:300308')).toMatchObject({
			name: '中际旭创',
			price: 158.72,
			change: 5.04,
			changePct: 3.28,
			turnover: 5432000000,
			turnoverRate: 2.72,
			marketAt: new Date(marketTimestamp * 1000).toISOString(),
		})
		expect(parsed.missing).toEqual([])
	})

	it('keeps optional dash/null fields null instead of zero', () => {
		const payload = stockPayload([{ f12: '300308', f14: '中际旭创', f2: 158.72, f3: 3.28, f4: 5.04, f5: '-', f6: null, f8: '-', f15: '-', f16: null, f17: '', f18: '-', f124: marketTimestamp }])
		const parsed = parseEastMoneyStockQuotes(payload, ['SZSE:300308'], fetchedAt)
		expect(parsed.quotes.get('SZSE:300308')).toMatchObject({
			open: null,
			high: null,
			low: null,
			previousClose: null,
			volume: null,
			turnover: null,
			turnoverRate: null,
		})
	})

	it('marks a row missing when a required quote field is absent', () => {
		const payload = stockPayload([{ f12: '300308', f14: '中际旭创', f2: '-', f3: 3.28, f4: 5.04, f124: marketTimestamp }])
		const parsed = parseEastMoneyStockQuotes(payload, ['SZSE:300308'], fetchedAt)
		expect(parsed.quotes.size).toBe(0)
		expect(parsed.missing).toEqual(['SZSE:300308'])
	})

	it('supports partial success without failing the whole batch', () => {
		const payload = stockPayload().data.diff.filter(row => row.f12 !== '300502')
		const parsed = parseEastMoneyStockQuotes(stockPayload(payload), symbols, fetchedAt)
		expect(parsed.quotes.size).toBe(2)
		expect(parsed.missing).toEqual(['SZSE:300502'])
	})
})

describe('eastMoney stock quote provider network behavior', () => {
	it('uses one upstream request for a valid batch and does not hit fallback', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(stockPayload()))
		const provider = new EastMoneyStockQuoteProvider(fetchImpl, () => new Date(fetchedAt))
		const result = await provider.fetchQuotes(symbols)

		expect(result.quotes.size).toBe(3)
		expect(fetchImpl).toHaveBeenCalledTimes(1)
		const url = new URL(String(fetchImpl.mock.calls[0]?.[0]))
		expect(url.hostname).toBe('push2delay.eastmoney.com')
		expect(url.searchParams.get('secids')).toBe('0.300308,0.300502,1.601899')
	})

	it('returns zero fetches for an empty request', async () => {
		const fetchImpl = vi.fn<typeof fetch>()
		const provider = new EastMoneyStockQuoteProvider(fetchImpl, () => new Date(fetchedAt))
		const result = await provider.fetchQuotes([])
		expect(result.quotes.size).toBe(0)
		expect(result.missing).toEqual([])
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it.each([403, 502])('falls back after HTTP %s', async (status) => {
		const fetchImpl = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ error: true }, status))
			.mockResolvedValueOnce(jsonResponse(stockPayload()))
		const result = await new EastMoneyStockQuoteProvider(fetchImpl, () => new Date(fetchedAt)).fetchQuotes(symbols)
		expect(result.quotes.size).toBe(3)
		expect(fetchImpl).toHaveBeenCalledTimes(2)
		expect(new URL(String(fetchImpl.mock.calls[1]?.[0])).hostname).toBe('push2.eastmoney.com')
	})

	it('falls back after HTTP 200 with unusable payload', async () => {
		const fetchImpl = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ data: null }))
			.mockResolvedValueOnce(jsonResponse(stockPayload()))
		const result = await new EastMoneyStockQuoteProvider(fetchImpl, () => new Date(fetchedAt)).fetchQuotes(symbols)
		expect(result.quotes.size).toBe(3)
		expect(fetchImpl).toHaveBeenCalledTimes(2)
	})

	it('applies 2500ms timeout to every host attempt and throws bounded error after both fail', async () => {
		const controller = new AbortController()
		const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
		const fetchImpl = vi.fn<typeof fetch>()
			.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
			.mockResolvedValueOnce(jsonResponse({ error: true }, 503))
		const provider = new EastMoneyStockQuoteProvider(fetchImpl, () => new Date(fetchedAt))

		await expect(provider.fetchQuotes(symbols)).rejects.toThrow(/push2delay.*push2/i)
		expect(timeout).toHaveBeenCalledTimes(2)
		expect(timeout).toHaveBeenNthCalledWith(1, 2500)
		expect(timeout).toHaveBeenNthCalledWith(2, 2500)
		timeout.mockRestore()
	})

	it('rejects more than 30 symbols before any network request', async () => {
		const many = Array.from({ length: 31 }, (_, index) => `SZSE:${String(1 + index).padStart(6, '0')}` as StockSymbol)
		const fetchImpl = vi.fn<typeof fetch>()
		const provider = new EastMoneyStockQuoteProvider(fetchImpl, () => new Date(fetchedAt))
		await expect(provider.fetchQuotes(many)).rejects.toThrow(/30/)
		expect(fetchImpl).not.toHaveBeenCalled()
	})
})
