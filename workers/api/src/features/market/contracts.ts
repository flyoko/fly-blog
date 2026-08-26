import type {
	MarketBreadth,
	MarketIndexQuote,
	MarketSourceRef,
	SectorFlowQuote,
	SectorKind,
} from '../../../../../shared/market'
import { isChinaAShareTradingDate } from '../../../../../shared/market-calendar'

export type MarketCapability = 'indices' | 'breadth' | 'sector-industry' | 'sector-concept'

export interface MarketProviderResult<T> {
	data: T
	source: MarketSourceRef
	fetchedAt: string
	marketAt: string
	latencyMs: number
}

export interface MarketDataProvider {
	sourceId?: (capability: MarketCapability) => string
	fetchIndices: () => Promise<MarketProviderResult<MarketIndexQuote[]>>
	fetchBreadth: () => Promise<MarketProviderResult<MarketBreadth>>
	fetchSectorFlows: (kind: SectorKind) => Promise<MarketProviderResult<SectorFlowQuote[]>>
}

const shanghaiPartsFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: 'Asia/Shanghai',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	weekday: 'short',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
})

export function shanghaiParts(date: Date): { date: string, weekday: string, minutes: number } {
	const parts = Object.fromEntries(
		shanghaiPartsFormatter
			.formatToParts(date)
			.filter(part => part.type !== 'literal')
			.map(part => [part.type, part.value]),
	)
	const hour = Number(parts.hour)
	const minute = Number(parts.minute)
	if (!parts.year || !parts.month || !parts.day || !parts.weekday || !Number.isInteger(hour) || !Number.isInteger(minute))
		throw new Error('Unable to resolve Asia/Shanghai market time')
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		weekday: parts.weekday,
		minutes: hour * 60 + minute,
	}
}

export const MARKET_SYNC_INTERVAL_MINUTES = 5
export const MARKET_SYNC_WINDOWS = [
	{ startMinute: 9 * 60 + 20, endMinute: 11 * 60 + 35 },
	{ startMinute: 12 * 60 + 55, endMinute: 15 * 60 + 15 },
] as const
export const MARKET_SECTOR_FINAL_CLOSE_WINDOW = {
	startMinute: 15 * 60 + 45,
	endMinute: 15 * 60 + 49,
} as const
export const MARKET_SYNC_SLOTS_PER_TRADING_DAY = MARKET_SYNC_WINDOWS.reduce(
	(total, window) => total + Math.floor((window.endMinute - window.startMinute) / MARKET_SYNC_INTERVAL_MINUTES) + 1,
	0,
)

export function isChinaMarketSyncWindow(date: Date): boolean {
	const { minutes } = shanghaiParts(date)
	if (!isChinaAShareTradingDate(date))
		return false
	return MARKET_SYNC_WINDOWS.some(window => minutes >= window.startMinute && minutes <= window.endMinute)
}

export function isChinaMarketSectorSyncWindow(date: Date): boolean {
	if (isChinaMarketSyncWindow(date))
		return true
	const { minutes } = shanghaiParts(date)
	if (!isChinaAShareTradingDate(date))
		return false
	return minutes >= MARKET_SECTOR_FINAL_CLOSE_WINDOW.startMinute
		&& minutes <= MARKET_SECTOR_FINAL_CLOSE_WINDOW.endMinute
}

export interface StockQuoteProviderResult {
	quotes: Map<import('../../../../../shared/market').StockSymbol, import('../../../../../shared/market').StockQuote>
	missing: import('../../../../../shared/market').StockSymbol[]
	source: MarketSourceRef
	fetchedAt: string
	latencyMs: number
}

export interface StockQuoteProvider {
	sourceId?: () => string
	fetchQuotes: (symbols: import('../../../../../shared/market').StockSymbol[]) => Promise<StockQuoteProviderResult>
}
