import type { StockExchange, StockSymbol, WatchlistItem } from '../shared/market'
import type { MarketSignalCooldownRecord, SignalSnapshot } from '../workers/api/src/features/market/signal-engine'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
	BALANCED_SIGNAL_ENGINE_VERSION,
	computeTurnoverInterval,
	evaluateMarketSignal,
	marketSignalCooldownAllows,
} from '../workers/api/src/features/market/signal-engine'

interface RawReplayRow {
	owner_id: string
	symbol: string
	bucket_at: string
	market_at: string
	price: number
	previous_close: number | null
	turnover: number | null
	source_id: string
	stock_code: string
	stock_name: string
	attention_price: number | null
	enabled: number | boolean
}

interface ReplaySignal extends MarketSignalCooldownRecord {
	bucketAt: string
	factors: string[]
	flowDelta: number | null
}

interface ReplayReport {
	engineVersion: typeof BALANCED_SIGNAL_ENGINE_VERSION
	rowCount: number
	invalidRowCount: number
	stockCount: number
	tradeDayCount: number
	stockDayCount: number
	signals: number
	strongSignals: number
	averageSignalsPerStockDay: number | null
	maxSignalsPerStockDay: number
	cooldownSuppressed: number
	duplicateSuppressed: number
	ordinaryFlowOnlySignals: number
	invalidCrossDayFlowSignals: number
	invalidLunchFlowSignals: number
	invalidGapFlowSignals: number
	invalidNegativeDeltaSignals: number
	noiseGate: 'pass' | 'fail' | 'insufficient-sample'
	perStockDay: Array<{ alias: string, date: string, signals: number, strong: number }>
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const FIVE_MINUTES_MS = 5 * 60 * 1000

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function candidateRows(payload: unknown): unknown[] {
	if (Array.isArray(payload)) {
		if (payload.every(item => asRecord(item)?.owner_id !== undefined))
			return payload
		return payload.flatMap((item) => {
			const record = asRecord(item)
			return Array.isArray(record?.results) ? record.results : []
		})
	}
	const record = asRecord(payload)
	return Array.isArray(record?.results) ? record.results : []
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseReplayRow(value: unknown): RawReplayRow | null {
	const row = asRecord(value)
	if (!row)
		return null
	const ownerId = typeof row.owner_id === 'string' ? row.owner_id : ''
	const symbol = typeof row.symbol === 'string' ? row.symbol : ''
	const bucketAt = typeof row.bucket_at === 'string' ? row.bucket_at : ''
	const marketAt = typeof row.market_at === 'string' ? row.market_at : ''
	const sourceId = typeof row.source_id === 'string' ? row.source_id : ''
	const code = typeof row.stock_code === 'string' ? row.stock_code : ''
	const name = typeof row.stock_name === 'string' ? row.stock_name : ''
	const price = finiteNumber(row.price)
	if (!ownerId || !/^(?:SSE|SZSE|BSE):\d{6}$/.test(symbol) || !sourceId || !code || !name || price === null || price <= 0)
		return null
	if (!Number.isFinite(Date.parse(bucketAt)) || !Number.isFinite(Date.parse(marketAt)))
		return null
	const previousClose = row.previous_close === null ? null : finiteNumber(row.previous_close)
	const turnover = row.turnover === null ? null : finiteNumber(row.turnover)
	const attentionPrice = row.attention_price === null ? null : finiteNumber(row.attention_price)
	if (row.previous_close !== null && previousClose === null)
		return null
	if (row.turnover !== null && turnover === null)
		return null
	if (row.attention_price !== null && attentionPrice === null)
		return null
	return {
		owner_id: ownerId,
		symbol,
		bucket_at: bucketAt,
		market_at: marketAt,
		price,
		previous_close: previousClose,
		turnover,
		source_id: sourceId,
		stock_code: code,
		stock_name: name,
		attention_price: attentionPrice,
		enabled: row.enabled === true || row.enabled === 1 || row.enabled === '1',
	}
}

function groupKey(row: RawReplayRow) {
	return `${row.owner_id}\u0000${row.symbol}`
}

function exchangeFrom(symbol: string): StockExchange {
	return symbol.split(':')[0] as StockExchange
}

function watchlistFrom(row: RawReplayRow): WatchlistItem {
	return {
		symbol: row.symbol as StockSymbol,
		exchange: exchangeFrom(row.symbol),
		code: row.stock_code,
		name: row.stock_name,
		sortOrder: 0,
		note: null,
		attentionPrice: row.attention_price,
		tags: [],
		enabled: Boolean(row.enabled),
		createdAt: row.market_at,
		updatedAt: row.market_at,
	}
}

function snapshotFrom(row: RawReplayRow): SignalSnapshot {
	return {
		bucketAt: row.bucket_at,
		marketAt: row.market_at,
		price: row.price,
		previousClose: row.previous_close,
		turnover: row.turnover,
		sourceId: row.source_id,
	}
}

function shanghaiParts(value: string) {
	const parsed = Date.parse(value)
	if (!Number.isFinite(parsed))
		return null
	const date = new Date(parsed + SHANGHAI_OFFSET_MS)
	return {
		date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
		minuteOfDay: date.getUTCHours() * 60 + date.getUTCMinutes(),
	}
}

function session(minuteOfDay: number) {
	if (minuteOfDay >= 9 * 60 + 30 && minuteOfDay <= 11 * 60 + 30)
		return 'am'
	if (minuteOfDay >= 13 * 60 && minuteOfDay <= 15 * 60)
		return 'pm'
	return null
}

function invalidFlowReason(previous: SignalSnapshot | null, current: SignalSnapshot) {
	if (!previous)
		return 'gap' as const
	const previousParts = shanghaiParts(previous.bucketAt)
	const currentParts = shanghaiParts(current.bucketAt)
	if (!previousParts || !currentParts)
		return 'gap' as const
	if (previousParts.date !== currentParts.date)
		return 'cross-day' as const
	if (session(previousParts.minuteOfDay) !== session(currentParts.minuteOfDay))
		return 'lunch' as const
	if (Date.parse(current.bucketAt) - Date.parse(previous.bucketAt) !== FIVE_MINUTES_MS)
		return 'gap' as const
	if (previous.turnover !== null && current.turnover !== null && current.turnover < previous.turnover)
		return 'negative' as const
	return computeTurnoverInterval(previous, current) ? null : 'gap' as const
}

function rounded(value: number) {
	return Math.round(value * 100) / 100
}

async function main() {
	const path = process.argv[2]
	if (!path)
		throw new Error('Usage: replay-market-signals <wrangler-json-file>')
	const payload = JSON.parse(await readFile(path, 'utf8')) as unknown
	const raw = candidateRows(payload)
	const rows = raw.map(parseReplayRow).filter((row): row is RawReplayRow => Boolean(row))
	const groups = new Map<string, RawReplayRow[]>()
	for (const row of rows) {
		if (!row.enabled)
			continue
		const key = groupKey(row)
		const values = groups.get(key) ?? []
		values.push(row)
		groups.set(key, values)
	}
	for (const values of groups.values())
		values.sort((left, right) => Date.parse(left.bucket_at) - Date.parse(right.bucket_at) || Date.parse(left.market_at) - Date.parse(right.market_at))

	const aliases = new Map([...groups.keys()].sort().map((key, index) => [key, `stock-${String(index + 1).padStart(2, '0')}`]))
	const persisted = new Map<string, ReplaySignal[]>()
	const uniqueKeys = new Set<string>()
	const perStockDay = new Map<string, { alias: string, date: string, signals: number, strong: number }>()
	const tradeDays = new Set<string>()
	const stockDays = new Set<string>()
	let cooldownSuppressed = 0
	let duplicateSuppressed = 0
	let ordinaryFlowOnlySignals = 0
	let invalidCrossDayFlowSignals = 0
	let invalidLunchFlowSignals = 0
	let invalidGapFlowSignals = 0
	let invalidNegativeDeltaSignals = 0

	for (const [key, values] of groups) {
		const alias = aliases.get(key)!
		const snapshots: SignalSnapshot[] = []
		for (const row of values) {
			const current = snapshotFrom(row)
			snapshots.push(current)
			const day = shanghaiParts(current.marketAt)?.date
			if (day) {
				tradeDays.add(day)
				const stockDayKey = `${alias}|${day}`
				stockDays.add(stockDayKey)
				if (!perStockDay.has(stockDayKey))
					perStockDay.set(stockDayKey, { alias, date: day, signals: 0, strong: 0 })
			}
			const evaluation = evaluateMarketSignal({ watchlist: watchlistFrom(row), snapshots })
			const candidate = evaluation.candidate
			if (!candidate)
				continue
			const uniqueness = `${candidate.bucketAt}|${candidate.signalType}|${candidate.engineVersion}`
			if (uniqueKeys.has(`${key}|${uniqueness}`)) {
				duplicateSuppressed += 1
				continue
			}
			const prior = persisted.get(key) ?? []
			if (!marketSignalCooldownAllows(candidate, prior)) {
				cooldownSuppressed += 1
				continue
			}
			uniqueKeys.add(`${key}|${uniqueness}`)
			const replaySignal: ReplaySignal = {
				marketAt: candidate.marketAt,
				signalType: candidate.signalType,
				direction: candidate.direction,
				severity: candidate.severity,
				score: candidate.score,
				bucketAt: candidate.bucketAt,
				factors: candidate.evidence.factors,
				flowDelta: candidate.evidence.flowDelta,
			}
			prior.push(replaySignal)
			persisted.set(key, prior)
			if (candidate.evidence.factors.length === 1 && candidate.evidence.factors[0] === 'TURNOVER_SURGE')
				ordinaryFlowOnlySignals += 1
			if (candidate.evidence.factors.includes('TURNOVER_SURGE')) {
				const currentBucket = Date.parse(candidate.bucketAt)
				const previous = snapshots.findLast(snapshot => Date.parse(snapshot.bucketAt) === currentBucket - FIVE_MINUTES_MS) ?? null
				const reason = invalidFlowReason(previous, current)
				if (reason === 'cross-day') {
					invalidCrossDayFlowSignals += 1
				}
				if (reason === 'lunch') {
					invalidLunchFlowSignals += 1
				}
				if (reason === 'gap') {
					invalidGapFlowSignals += 1
				}
				if (reason === 'negative') {
					invalidNegativeDeltaSignals += 1
				}
			}
			if (day) {
				const stockDayKey = `${alias}|${day}`
				const entry = perStockDay.get(stockDayKey) ?? { alias, date: day, signals: 0, strong: 0 }
				entry.signals += 1
				if (candidate.severity === 'strong')
					entry.strong += 1
				perStockDay.set(stockDayKey, entry)
			}
		}
	}

	const signalRows = [...persisted.values()].flat()
	const perDay = [...perStockDay.values()].sort((left, right) => left.alias.localeCompare(right.alias) || left.date.localeCompare(right.date))
	const averageSignalsPerStockDay = stockDays.size ? rounded(signalRows.length / stockDays.size) : null
	const maxSignalsPerStockDay = perDay.reduce((max, item) => Math.max(max, item.signals), 0)
	const invalidFlowSignals = invalidCrossDayFlowSignals + invalidLunchFlowSignals + invalidGapFlowSignals + invalidNegativeDeltaSignals
	const enoughNoiseHistory = tradeDays.size >= 3 && stockDays.size > 0
	const noiseGate = !enoughNoiseHistory
		? 'insufficient-sample'
		: averageSignalsPerStockDay !== null && averageSignalsPerStockDay <= 6 && invalidFlowSignals === 0 && ordinaryFlowOnlySignals === 0
			? 'pass'
			: 'fail'
	const report: ReplayReport = {
		engineVersion: BALANCED_SIGNAL_ENGINE_VERSION,
		rowCount: rows.length,
		invalidRowCount: raw.length - rows.length,
		stockCount: groups.size,
		tradeDayCount: tradeDays.size,
		stockDayCount: stockDays.size,
		signals: signalRows.length,
		strongSignals: signalRows.filter(item => item.severity === 'strong').length,
		averageSignalsPerStockDay,
		maxSignalsPerStockDay,
		cooldownSuppressed,
		duplicateSuppressed,
		ordinaryFlowOnlySignals,
		invalidCrossDayFlowSignals,
		invalidLunchFlowSignals,
		invalidGapFlowSignals,
		invalidNegativeDeltaSignals,
		noiseGate,
		perStockDay: perDay,
	}
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : 'Replay failed'}\n`)
	process.exitCode = 1
})
