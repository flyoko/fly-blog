import type { MarketSourceRef, StockExchange, StockQuote, StockSymbol } from '../../../../../shared/market'
import type { StockQuoteProvider, StockQuoteProviderResult } from './contracts'

export type StockFetch = typeof fetch

const workerFetch: StockFetch = (input, init) => fetch(input, init)
const PUSH2_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com'] as const
const REQUEST_TIMEOUT_MS = 2_500
const SOURCE_NAME = '东方财富'
const SOURCE_ID = 'eastmoney-stock-push2'

const stockPatterns: Record<StockExchange, RegExp> = {
	SSE: /^6\d{5}$/u,
	SZSE: /^(?:00[0-3]|30[01])\d{3}$/u,
	BSE: /^[489]\d{5}$/u,
}

export interface ParsedStockSymbol {
	symbol: StockSymbol
	exchange: StockExchange
	code: string
}

export function parseStockSymbol(value: string): ParsedStockSymbol {
	const normalized = value.trim().toUpperCase()
	const match = /^(SSE|SZSE|BSE):(\d{6})$/u.exec(normalized)
	if (!match)
		throw new Error('Stock symbol is invalid')
	const exchange = match[1] as StockExchange
	const code = match[2]!
	if (!stockPatterns[exchange].test(code))
		throw new Error('Stock symbol exchange or code is invalid')
	return { symbol: `${exchange}:${code}` as StockSymbol, exchange, code }
}

export function toEastMoneySecid(symbol: StockSymbol): string {
	const parsed = parseStockSymbol(symbol)
	return `${parsed.exchange === 'SSE' ? '1' : '0'}.${parsed.code}`
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null
}

function text(value: unknown): string | null {
	if (typeof value !== 'string')
		return null
	const normalized = value.trim()
	return normalized && normalized !== '-' ? normalized : null
}

function numberOrNull(value: unknown): number | null {
	if (typeof value === 'number')
		return Number.isFinite(value) ? value : null
	if (typeof value !== 'string')
		return null
	const normalized = value.trim()
	if (!normalized || normalized === '-')
		return null
	const parsed = Number(normalized)
	return Number.isFinite(parsed) ? parsed : null
}

function epochIso(value: unknown): string | null {
	const parsed = numberOrNull(value)
	if (parsed === null)
		return null
	const milliseconds = parsed >= 1_000_000_000_000 ? parsed : parsed * 1000
	const date = new Date(milliseconds)
	return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function rows(payload: unknown): Array<Record<string, unknown>> {
	const data = record(record(payload)?.data)
	const diff = data?.diff
	const values = Array.isArray(diff)
		? diff
		: record(diff)
			? Object.values(diff as Record<string, unknown>)
			: []
	return values.map(record).filter((item): item is Record<string, unknown> => Boolean(item))
}

export function parseEastMoneyStockQuotes(
	payload: unknown,
	requested: StockSymbol[],
	_fetchedAt: string,
): { quotes: Map<StockSymbol, StockQuote>, missing: StockSymbol[] } {
	const requestedByCode = new Map<string, StockSymbol>()
	for (const symbol of requested) {
		const parsed = parseStockSymbol(symbol)
		requestedByCode.set(parsed.code, parsed.symbol)
	}

	const quotes = new Map<StockSymbol, StockQuote>()
	for (const row of rows(payload)) {
		const code = text(row.f12)
		if (!code)
			continue
		const symbol = requestedByCode.get(code)
		if (!symbol)
			continue
		const name = text(row.f14)
		const price = numberOrNull(row.f2)
		const changePct = numberOrNull(row.f3)
		const change = numberOrNull(row.f4)
		const marketAt = epochIso(row.f124)
		if (!name || price === null || changePct === null || change === null || !marketAt)
			continue
		quotes.set(symbol, {
			symbol,
			code,
			name,
			price,
			change,
			changePct,
			open: numberOrNull(row.f17),
			high: numberOrNull(row.f15),
			low: numberOrNull(row.f16),
			previousClose: numberOrNull(row.f18),
			volume: numberOrNull(row.f5),
			turnover: numberOrNull(row.f6),
			turnoverRate: numberOrNull(row.f8),
			marketAt,
		})
	}

	return {
		quotes: new Map(requested.filter(symbol => quotes.has(symbol)).map(symbol => [symbol, quotes.get(symbol)!])),
		missing: requested.filter(symbol => !quotes.has(symbol)),
	}
}

function safeNetworkError(error: unknown): string {
	if (error instanceof Error)
		return `${error.name}: ${error.message}`.replace(/[\r\n\t]+/gu, ' ').slice(0, 180)
	return String(error).replace(/[\r\n\t]+/gu, ' ').slice(0, 180)
}

function parsePayloadText(raw: string): unknown {
	const value = raw.trim()
	if (!value)
		throw new Error('empty response')
	if (value.startsWith('{') || value.startsWith('['))
		return JSON.parse(value)
	const open = value.indexOf('(')
	const close = value.lastIndexOf(')')
	if (open < 1 || close <= open)
		throw new Error('invalid JSON or JSONP response')
	return JSON.parse(value.slice(open + 1, close))
}

export class EastMoneyStockQuoteProvider implements StockQuoteProvider {
	constructor(
		private readonly fetchImpl: StockFetch = workerFetch,
		private readonly now: () => Date = () => new Date(),
	) {}

	sourceId(): string {
		return SOURCE_ID
	}

	async fetchQuotes(symbols: StockSymbol[]): Promise<StockQuoteProviderResult> {
		const normalized = symbols.map(symbol => parseStockSymbol(symbol).symbol)
		if (normalized.length > 30)
			throw new Error('Stock quote batch exceeds the 30 symbol limit')
		if (!normalized.length) {
			return {
				quotes: new Map(),
				missing: [],
				source: {
					sourceId: SOURCE_ID,
					sourceName: SOURCE_NAME,
					endpoint: 'none:empty-batch',
				},
				fetchedAt: this.now().toISOString(),
				latencyMs: 0,
			}
		}

		const fetchedAt = this.now().toISOString()
		const params = new URLSearchParams({
			secids: normalized.map(toEastMoneySecid).join(','),
			fields: 'f2,f3,f4,f5,f6,f8,f12,f13,f14,f15,f16,f17,f18,f124',
			fltt: '2',
			invt: '2',
			ut: 'bd1d9ddb04089700cf9c27f6f7426281',
		})
		const failures: string[] = []
		for (const host of PUSH2_HOSTS) {
			const url = new URL('/api/qt/ulist.np/get', host)
			url.search = params.toString()
			const startedAt = Date.now()
			try {
				const response = await this.fetchImpl(url, {
					headers: {
						'accept': 'application/json,text/plain,*/*',
						'user-agent': 'fly-living-market/1.0 (+https://flyovo.cc.cd)',
					},
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				})
				const latencyMs = Math.max(0, Date.now() - startedAt)
				if (!response.ok) {
					failures.push(`${url.hostname}: HTTP ${response.status}`)
					await response.body?.cancel().catch(() => undefined)
					continue
				}
				const parsed = parseEastMoneyStockQuotes(parsePayloadText(await response.text()), normalized, fetchedAt)
				if (!parsed.quotes.size)
					throw new Error('stock quote payload contains no usable rows')
				const source: MarketSourceRef = {
					sourceId: SOURCE_ID,
					sourceName: SOURCE_NAME,
					endpoint: `${url.origin}${url.pathname}`,
				}
				return { ...parsed, source, fetchedAt, latencyMs }
			}
			catch (error) {
				failures.push(`${url.hostname}: ${safeNetworkError(error)}`)
			}
		}
		throw new Error(`EastMoney stock quote request failed: ${failures.join(' | ')}`)
	}
}
