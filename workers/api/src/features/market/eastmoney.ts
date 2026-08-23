import type {
	MarketBreadth,
	MarketIndexCode,
	MarketIndexQuote,
	SectorFlowQuote,
	SectorKind,
} from '../../../../../shared/market'
import type { MarketDataProvider, MarketProviderResult } from './contracts'
import { marketIndexCodes } from '../../../../../shared/market'

export type MarketFetch = typeof fetch

const workerFetch: MarketFetch = (input, init) => fetch(input, init)
const PUSH2_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com'] as const
const BREADTH_HOSTS = ['https://push2ex.eastmoney.com'] as const
const REQUEST_TIMEOUT_MS = 2_500
const SOURCE_NAME = '东方财富'
const SECTOR_PAGE_SIZE = 100
const MAX_SECTOR_PAGES = 10

const indexSecids: Record<MarketIndexCode, string> = {
	'000001': '1.000001',
	'399001': '0.399001',
	'399006': '0.399006',
}

const sectorFilters: Record<SectorKind, string> = {
	industry: 'm:90+t:2',
	concept: 'm:90+t:3',
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

function requiredNumber(value: unknown, label: string): number {
	const parsed = numberOrNull(value)
	if (parsed === null)
		throw new Error(`EastMoney ${label} is missing or invalid`)
	return parsed
}

function epochIso(value: unknown, label: string): string {
	const parsed = requiredNumber(value, label)
	const milliseconds = parsed >= 1_000_000_000_000 ? parsed : parsed * 1000
	const date = new Date(milliseconds)
	if (!Number.isFinite(date.getTime()))
		throw new Error(`EastMoney ${label} timestamp is invalid`)
	return date.toISOString()
}

function diffRows(payload: unknown, label: string): Array<Record<string, unknown>> {
	const data = record(record(payload)?.data)
	const diff = data?.diff
	const values = Array.isArray(diff)
		? diff
		: record(diff)
			? Object.values(diff as Record<string, unknown>)
			: []
	const rows = values.map(record).filter((item): item is Record<string, unknown> => Boolean(item))
	if (!rows.length)
		throw new Error(`EastMoney ${label} data is empty`)
	return rows
}

function latestIso(values: string[]): string {
	return values.slice().sort((left, right) => Date.parse(right) - Date.parse(left))[0]!
}

export function parseEastMoneyIndices(payload: unknown, _fetchedAt: string): { data: MarketIndexQuote[], marketAt: string } {
	const rows = diffRows(payload, 'index')
	const byCode = new Map(rows.map(row => [text(row.f12), row]))
	const data = marketIndexCodes.map((code) => {
		const row = byCode.get(code)
		if (!row)
			throw new Error(`EastMoney index ${code} is missing`)
		const name = text(row.f14)
		if (!name)
			throw new Error(`EastMoney index ${code} name is missing`)
		const marketAt = epochIso(row.f124, `index ${code}`)
		return {
			code,
			name,
			value: requiredNumber(row.f2, `index ${code} value`),
			change: requiredNumber(row.f4, `index ${code} change`),
			changePct: requiredNumber(row.f3, `index ${code} change percent`),
			turnover: numberOrNull(row.f6),
			marketAt,
		}
	})
	return {
		data,
		marketAt: latestIso(data.map(item => item.marketAt)),
	}
}

export function parseEastMoneyBreadth(payload: unknown, fetchedAt: string): { data: MarketBreadth, marketAt: string } {
	const data = record(record(payload)?.data)
	const fenbu = data?.fenbu
	const entries = Array.isArray(fenbu)
		? fenbu
		: record(fenbu)
			? [fenbu]
			: []
	const counts = new Map<number, number>()
	for (const entry of entries) {
		const item = record(entry)
		if (!item)
			continue
		for (const [key, rawCount] of Object.entries(item)) {
			const bucket = Number(key)
			const count = numberOrNull(rawCount)
			if (!Number.isInteger(bucket) || bucket < -11 || bucket > 11 || count === null || count < 0)
				continue
			counts.set(bucket, (counts.get(bucket) || 0) + count)
		}
	}
	if (!counts.size)
		throw new Error('EastMoney breadth data is empty')
	let advancing = 0
	let declining = 0
	let flat = 0
	for (const [bucket, count] of counts) {
		if (bucket > 0)
			advancing += count
		else if (bucket < 0)
			declining += count
		else
			flat += count
	}
	const total = advancing + declining + flat
	if (total <= 0)
		throw new Error('EastMoney breadth total is empty')
	return {
		data: {
			advancing,
			declining,
			flat,
			total,
			limitUp: counts.get(11) ?? null,
			limitDown: counts.get(-11) ?? null,
			marketAt: fetchedAt,
		},
		marketAt: fetchedAt,
	}
}

export function parseEastMoneySectorFlows(payload: unknown, kind: SectorKind, _fetchedAt: string): { data: SectorFlowQuote[], marketAt: string } {
	const rows = diffRows(payload, `${kind} sector flow`)
	const parsed: SectorFlowQuote[] = []
	for (const row of rows) {
		const code = text(row.f12)
		const name = text(row.f14)
		if (!code || !name)
			continue
		let marketAt: string
		try {
			marketAt = epochIso(row.f124, `${kind} sector ${code}`)
		}
		catch {
			continue
		}
		parsed.push({
			code,
			name,
			kind,
			changePct: numberOrNull(row.f3),
			mainNetInflow: numberOrNull(row.f62),
			mainNetInflowRatio: numberOrNull(row.f184),
			leaderStockName: text(row.f204),
			leaderStockCode: text(row.f205),
			marketAt,
		})
	}
	if (!parsed.length)
		throw new Error(`EastMoney ${kind} sector flow contains no usable rows`)
	return {
		data: parsed,
		marketAt: latestIso(parsed.map(item => item.marketAt)),
	}
}

function parseEastMoneySectorFlowPage(payload: unknown, kind: SectorKind, fetchedAt: string): { data: SectorFlowQuote[], marketAt: string, total: number } {
	const parsed = parseEastMoneySectorFlows(payload, kind, fetchedAt)
	const total = requiredNumber(record(record(payload)?.data)?.total, `${kind} sector total`)
	if (!Number.isInteger(total) || total < parsed.data.length)
		throw new Error(`EastMoney ${kind} sector total is invalid`)
	return { ...parsed, total }
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

function safeNetworkError(error: unknown): string {
	if (error instanceof Error)
		return `${error.name}: ${error.message}`.slice(0, 180)
	return String(error).slice(0, 180)
}

export class EastMoneyMarketProvider implements MarketDataProvider {
	sourceId(capability: 'indices' | 'breadth' | 'sector-industry' | 'sector-concept'): string {
		return capability === 'breadth' ? 'eastmoney-push2ex' : 'eastmoney-push2'
	}

	constructor(
		private readonly fetchImpl: MarketFetch = workerFetch,
		private readonly now: () => Date = () => new Date(),
	) {}

	private async request<T>(
		path: string,
		params: URLSearchParams,
		hosts: readonly string[],
		parse: (payload: unknown) => T,
	): Promise<{ parsed: T, endpoint: string, latencyMs: number }> {
		const failures: string[] = []
		for (const host of hosts) {
			const url = new URL(path, host)
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
				const payload = parsePayloadText(await response.text())
				const parsed = parse(payload)
				return {
					parsed,
					endpoint: `${url.origin}${url.pathname}`,
					latencyMs,
				}
			}
			catch (error) {
				failures.push(`${url.hostname}: ${safeNetworkError(error)}`)
			}
		}
		throw new Error(`EastMoney request failed: ${failures.join(' | ')}`)
	}

	async fetchIndices(): Promise<MarketProviderResult<MarketIndexQuote[]>> {
		const fetchedAt = this.now().toISOString()
		const params = new URLSearchParams({
			secids: marketIndexCodes.map(code => indexSecids[code]).join(','),
			fields: 'f2,f3,f4,f6,f12,f13,f14,f124',
			fltt: '2',
			invt: '2',
			ut: 'bd1d9ddb04089700cf9c27f6f7426281',
		})
		const response = await this.request(
			'/api/qt/ulist.np/get',
			params,
			PUSH2_HOSTS,
			payload => parseEastMoneyIndices(payload, fetchedAt),
		)
		return {
			...response.parsed,
			source: {
				sourceId: 'eastmoney-push2',
				sourceName: SOURCE_NAME,
				endpoint: response.endpoint,
			},
			fetchedAt,
			latencyMs: response.latencyMs,
		}
	}

	async fetchBreadth(): Promise<MarketProviderResult<MarketBreadth>> {
		const fetchedAt = this.now().toISOString()
		const params = new URLSearchParams({
			cb: 'flyMarketBreadth',
			ut: '7eea3edcaed734bea9cbfc24409ed989',
			dpt: 'wz.ztzt',
		})
		const response = await this.request(
			'/getTopicZDFenBu',
			params,
			BREADTH_HOSTS,
			payload => parseEastMoneyBreadth(payload, fetchedAt),
		)
		return {
			...response.parsed,
			source: {
				sourceId: 'eastmoney-push2ex',
				sourceName: SOURCE_NAME,
				endpoint: response.endpoint,
			},
			fetchedAt,
			latencyMs: response.latencyMs,
		}
	}

	async fetchSectorFlows(kind: SectorKind): Promise<MarketProviderResult<SectorFlowQuote[]>> {
		const fetchedAt = this.now().toISOString()
		const startedAt = Date.now()
		const paramsForPage = (page: number) => new URLSearchParams({
			pn: String(page),
			pz: String(SECTOR_PAGE_SIZE),
			po: '1',
			np: '1',
			ut: 'b2884a393a59ad64002292a3e90d46a5',
			fltt: '2',
			invt: '2',
			fid0: 'f62',
			fs: sectorFilters[kind],
			stat: '1',
			fields: 'f12,f14,f3,f62,f184,f204,f205,f124',
		})
		const first = await this.request(
			'/api/qt/clist/get',
			paramsForPage(1),
			PUSH2_HOSTS,
			payload => parseEastMoneySectorFlowPage(payload, kind, fetchedAt),
		)
		const pageCount = Math.max(1, Math.ceil(first.parsed.total / SECTOR_PAGE_SIZE))
		if (pageCount > MAX_SECTOR_PAGES)
			throw new Error(`EastMoney ${kind} sector page count exceeds safety bound`)
		const remaining = await Promise.all(
			Array.from({ length: pageCount - 1 }, (_, index) => index + 2).map(page => this.request(
				'/api/qt/clist/get',
				paramsForPage(page),
				PUSH2_HOSTS,
				payload => parseEastMoneySectorFlowPage(payload, kind, fetchedAt),
			)),
		)
		const pages = [first, ...remaining]
		const byCode = new Map<string, SectorFlowQuote>()
		for (const page of pages) {
			if (page.parsed.total !== first.parsed.total)
				throw new Error(`EastMoney ${kind} sector total changed during pagination`)
			for (const item of page.parsed.data)
				byCode.set(item.code, item)
		}
		return {
			data: [...byCode.values()],
			marketAt: latestIso(pages.map(page => page.parsed.marketAt)),
			source: {
				sourceId: 'eastmoney-push2',
				sourceName: SOURCE_NAME,
				endpoint: first.endpoint,
			},
			fetchedAt,
			latencyMs: Math.max(0, Date.now() - startedAt),
		}
	}
}
