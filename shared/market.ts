export const marketIndexCodes = ['000001', '000688', '399006'] as const
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

export const financialReportPeriods = ['q1', 'semiannual', 'q3', 'annual'] as const
export type FinancialReportPeriod = typeof financialReportPeriods[number]

export const financialTrendFilters = ['up', 'any'] as const
export type FinancialTrendFilter = typeof financialTrendFilters[number]

export interface MarketFinancialScreenerFilters {
	period: FinancialReportPeriod
	reportDate: string | null
	minNetProfitYoY: number
	grossMarginTrend: FinancialTrendFilter
	inventoryTrend: FinancialTrendFilter
	keyword: string
	limit: number
}

export interface MarketFinancialScreenerItem {
	securityCode: string
	secucode: string
	securityName: string
	industryName: string | null
	reportDate: string
	noticeDate: string
	netProfitYoY: number | null
	grossMargin: number | null
	previousGrossMargin: number | null
	grossMarginYoYChange: number | null
	inventory: number | null
	previousInventory: number | null
	inventoryYoYChange: number | null
	inventoryYoYPct: number | null
}

export interface MarketFinancialScreenerData {
	period: FinancialReportPeriod
	reportDate: string
	comparisonReportDate: string
	totalAvailable: number
	matchedCount: number
	filters: MarketFinancialScreenerFilters
	items: MarketFinancialScreenerItem[]
}

export const citicFuturesProducts = ['IF', 'IH', 'IC', 'IM'] as const
export type CiticFuturesProduct = typeof citicFuturesProducts[number]
export const citicFuturesSeries = ['ALL', ...citicFuturesProducts] as const
export type CiticFuturesSeries = typeof citicFuturesSeries[number]

export interface CiticFuturesPositionPoint {
	tradeDate: string
	product: CiticFuturesSeries
	longPosition: number
	longChange: number
	shortPosition: number
	shortChange: number
	netPosition: number
	netChange: number
	contractCount: number
	longRankedContractCount: number
	shortRankedContractCount: number
	complete: boolean
}

export interface CiticFuturesPositionHistory {
	product: CiticFuturesSeries
	productName: string
	brokerName: '中信期货(代客)'
	sourceName: '中国金融期货交易所'
	sourceUrl: string
	fetchedAt: string | null
	quality: MarketDataQuality
	items: CiticFuturesPositionPoint[]
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

export type MarketSignalDirection = 'up' | 'down' | 'neutral'
export type MarketSignalSeverity = 'watch' | 'strong'
export type MarketSignalType
	= | 'momentum_up'
		| 'momentum_down'
		| 'breakout_up'
		| 'breakdown_down'
		| 'attention_cross_up'
		| 'attention_cross_down'
		| 'price_spike_up'
		| 'price_spike_down'

export type MarketSignalFactor
	= | 'TURNOVER_SURGE'
		| 'PRICE_ACCELERATION'
		| 'RANGE_BREAK'
		| 'ATTENTION_CROSS'
		| 'DIRECTION_ALIGNMENT'

export interface MarketSignalEvidence {
	factors: MarketSignalFactor[]
	priceMove5mPct: number | null
	priceMove10mPct: number | null
	flowBasis: 'turnover' | null
	flowDelta: number | null
	flowRatio: number | null
	rangeHigh: number | null
	rangeLow: number | null
	attentionPrice: number | null
}

export interface MarketSignalItem {
	id: string
	symbol: StockSymbol
	code: string
	name: string
	signalType: MarketSignalType
	direction: MarketSignalDirection
	severity: MarketSignalSeverity
	score: number
	title: string
	marketAt: string
	detectedAt: string
	engineVersion: 'balanced-v1'
	evidence: MarketSignalEvidence
}

export interface MarketSignalBaselineSummary {
	enabledCount: number
	readyCount: number
	warmingCount: number
}

export interface MarketSignalSummary {
	totalCount: number
	strongCount: number
}

export interface MarketSignalDeskResponse {
	engineVersion: 'balanced-v1'
	marketAt: string | null
	baseline: MarketSignalBaselineSummary
	summary?: MarketSignalSummary
	items: MarketSignalItem[]
}

export type MarketObservationCapability = 'indices' | 'breadth' | 'sector-industry' | 'sector-concept' | 'watchlist-sync'
export type MarketObservationStatus = 'success' | 'partial' | 'failed'
export type MarketObservationVerdict = 'pass' | 'fail' | 'incomplete' | 'observe'

export interface MarketObservationEndpointCount {
	endpoint: string
	count: number
}

export interface MarketObservationMetric {
	capability: MarketObservationCapability
	attemptCount: number
	expectedAttemptCount: number | null
	successCount: number
	partialCount: number
	failureCount: number
	batchSuccessRate: number | null
	itemCount: number
	expectedItemCount: number | null
	missingCount: number
	validReturnRate: number | null
	p50LatencyMs: number | null
	p95LatencyMs: number | null
	observedTradingDays: number
	complete: boolean
	endpoints: MarketObservationEndpointCount[]
	targetBatchSuccessRate: number | null
	targetValidReturnRate: number | null
	verdict: MarketObservationVerdict
}

export interface MarketObservabilityReport {
	calendarVersion: string
	generatedAt: string
	window: {
		requestedTradingDays: number
		expectedTradingDates: string[]
		observedTradingDates: string[]
		complete: boolean
	}
	metrics: MarketObservationMetric[]
}
