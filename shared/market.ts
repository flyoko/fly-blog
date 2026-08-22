export const marketIndexCodes = ['000001', '399001', '399006'] as const
export type MarketIndexCode = typeof marketIndexCodes[number]

export const sectorKinds = ['industry', 'concept'] as const
export type SectorKind = typeof sectorKinds[number]

export const sectorWindowDays = [1, 3, 5, 10, 20] as const
export type SectorWindowDays = typeof sectorWindowDays[number]

export type MarketDataQuality = 'live' | 'degraded' | 'stale' | 'unavailable'

export interface MarketSourceRef {
	sourceId: string
	sourceName: string
	endpoint: string
}

export interface MarketIndexQuote {
	code: MarketIndexCode
	name: string
	value: number
	change: number
	changePct: number
	turnover: number | null
	marketAt: string
}

export interface MarketBreadth {
	advancing: number
	declining: number
	flat: number
	total: number
	limitUp: number | null
	limitDown: number | null
	marketAt: string
}

export interface MarketOverview {
	indices: MarketIndexQuote[]
	breadth: MarketBreadth | null
}

export interface SectorFlowQuote {
	code: string
	name: string
	kind: SectorKind
	changePct: number | null
	mainNetInflow: number | null
	mainNetInflowRatio: number | null
	leaderStockCode: string | null
	leaderStockName: string | null
	marketAt: string
}

export interface SectorFlowWindow {
	days: SectorWindowDays
	netInflow: number | null
	availableDays: number
	complete: boolean
}

export interface SectorFlowItem extends SectorFlowQuote {
	windows: SectorFlowWindow[]
}

export interface MarketEnvelope<T> {
	data: T | null
	source: MarketSourceRef[]
	fetchedAt: string | null
	marketAt: string | null
	stale: boolean
	staleAgeMs: number | null
	quality: MarketDataQuality
}

export type StockExchange = 'SSE' | 'SZSE' | 'BSE'
export type StockSymbol = `${StockExchange}:${string}`
export type WatchlistItemQuality = 'live' | 'stale' | 'unavailable'

export interface WatchlistItem {
	symbol: StockSymbol
	exchange: StockExchange
	code: string
	name: string
	sortOrder: number
	note: string | null
	attentionPrice: number | null
	tags: string[]
	enabled: boolean
	createdAt: string
	updatedAt: string
}

export interface StockQuote {
	symbol: StockSymbol
	code: string
	name: string
	price: number
	change: number
	changePct: number
	open: number | null
	high: number | null
	low: number | null
	previousClose: number | null
	volume: number | null
	turnover: number | null
	turnoverRate: number | null
	marketAt: string
}

export interface WatchlistRadarItem {
	watchlist: WatchlistItem
	quote: StockQuote | null
	quality: WatchlistItemQuality
	staleAgeMs: number | null
	source: MarketSourceRef | null
}

export interface WatchlistRadarResponse {
	quality: MarketDataQuality
	fetchedAt: string | null
	items: WatchlistRadarItem[]
}
