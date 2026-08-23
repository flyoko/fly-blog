import type {
	MarketSignalDeskResponse,
	MarketSignalDirection,
	MarketSignalEvidence,
	MarketSignalFactor,
	MarketSignalItem,
	MarketSignalSeverity,
	MarketSignalType,
	StockSymbol,
	WatchlistItem,
} from '../../../../../shared/market'
import type { Env } from '../../env'
import type { SignalCandidate, SignalSnapshot } from './signal-engine'
import { parseStockSymbol } from './eastmoney-stock'
import {
	BALANCED_SIGNAL_ENGINE_VERSION,
	evaluateMarketSignal,
	MARKET_SIGNAL_MAX_COOLDOWN_MS,
	marketSignalCooldownAllows,

} from './signal-engine'

const MAX_TARGETS = 30
const HISTORY_DAYS = 8
const RECENT_SCOPE_DAYS = 7
const RETENTION_DAYS = 30
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

const validDirections = new Set<MarketSignalDirection>(['up', 'down', 'neutral'])
const validSeverities = new Set<MarketSignalSeverity>(['watch', 'strong'])
const validSignalTypes = new Set<MarketSignalType>([
	'momentum_up',
	'momentum_down',
	'breakout_up',
	'breakdown_down',
	'attention_cross_up',
	'attention_cross_down',
	'price_spike_up',
	'price_spike_down',
])
const validFactors = new Set<MarketSignalFactor>([
	'TURNOVER_SURGE',
	'PRICE_ACCELERATION',
	'RANGE_BREAK',
	'ATTENTION_CROSS',
	'DIRECTION_ALIGNMENT',
])

interface HistoryRow {
	owner_id: string
	symbol: string
	bucket_at: string
	market_at: string
	price: number
	previous_close: number | null
	turnover: number | null
	source_id: string
}

interface WatchlistRow {
	owner_id: string
	symbol: string
	exchange: 'SSE' | 'SZSE' | 'BSE'
	stock_code: string
	stock_name: string
	sort_order: number
	attention_price: number | null
	enabled: number
	created_at: string
	updated_at: string
}

interface CooldownRow {
	owner_id: string
	symbol: string
	market_at: string
	signal_type: string
	direction: string
	severity: string
	score: number
}

interface SignalRow {
	id: string
	owner_id: string
	symbol: string
	stock_code: string
	stock_name: string
	market_at: string
	detected_at: string
	signal_type: string
	direction: string
	severity: string
	score: number
	title: string
	evidence_json: string
	engine_version: string
}

export interface SignalWatchlistTarget {
	ownerId: string
	watchlist: WatchlistItem
}

export interface SignalEvaluationSummary {
	evaluatedCount: number
	readyCount: number
	warmingCount: number
	signalCount: number
	strongCount: number
}

export interface MarketSignalListOptions {
	scope?: 'today' | 'recent'
	limit?: number
	symbol?: StockSymbol
}

interface EvaluatedCandidate {
	target: SignalWatchlistTarget
	candidate: SignalCandidate
}

function placeholders(count: number) {
	return Array.from({ length: count }).fill('?').join(', ')
}

function pairKey(ownerId: string, symbol: string) {
	return `${ownerId}\u0000${symbol}`
}

function rowToWatchlist(row: WatchlistRow): WatchlistItem | null {
	try {
		const parsed = parseStockSymbol(row.symbol)
		return {
			symbol: parsed.symbol,
			exchange: row.exchange,
			code: row.stock_code,
			name: row.stock_name,
			sortOrder: row.sort_order,
			note: null,
			attentionPrice: row.attention_price,
			tags: [],
			enabled: row.enabled === 1,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}
	}
	catch {
		return null
	}
}

function historyToSnapshot(row: HistoryRow): SignalSnapshot | null {
	if (!Number.isFinite(row.price) || row.price <= 0)
		return null
	return {
		bucketAt: row.bucket_at,
		marketAt: row.market_at,
		price: row.price,
		previousClose: row.previous_close,
		turnover: row.turnover,
		sourceId: row.source_id,
	}
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function safeEvidence(raw: string): MarketSignalEvidence {
	const empty: MarketSignalEvidence = {
		factors: [],
		priceMove5mPct: null,
		priceMove10mPct: null,
		flowBasis: null,
		flowDelta: null,
		flowRatio: null,
		rangeHigh: null,
		rangeLow: null,
		attentionPrice: null,
	}
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>
		const factors = Array.isArray(parsed.factors)
			? parsed.factors.filter((value): value is MarketSignalFactor => typeof value === 'string' && validFactors.has(value as MarketSignalFactor))
			: []
		return {
			factors,
			priceMove5mPct: finiteNumber(parsed.priceMove5mPct),
			priceMove10mPct: finiteNumber(parsed.priceMove10mPct),
			flowBasis: parsed.flowBasis === 'turnover' ? 'turnover' : null,
			flowDelta: finiteNumber(parsed.flowDelta),
			flowRatio: finiteNumber(parsed.flowRatio),
			rangeHigh: finiteNumber(parsed.rangeHigh),
			rangeLow: finiteNumber(parsed.rangeLow),
			attentionPrice: finiteNumber(parsed.attentionPrice),
		}
	}
	catch {
		return empty
	}
}

function signalRowToItem(row: SignalRow): MarketSignalItem | null {
	if (row.engine_version !== BALANCED_SIGNAL_ENGINE_VERSION)
		return null
	if (!validSignalTypes.has(row.signal_type as MarketSignalType))
		return null
	if (!validDirections.has(row.direction as MarketSignalDirection))
		return null
	if (!validSeverities.has(row.severity as MarketSignalSeverity))
		return null
	if (!Number.isInteger(row.score) || row.score < 0 || row.score > 100)
		return null
	try {
		const parsed = parseStockSymbol(row.symbol)
		return {
			id: row.id,
			symbol: parsed.symbol,
			code: row.stock_code,
			name: row.stock_name,
			signalType: row.signal_type as MarketSignalType,
			direction: row.direction as MarketSignalDirection,
			severity: row.severity as MarketSignalSeverity,
			score: row.score,
			title: row.title,
			marketAt: row.market_at,
			detectedAt: row.detected_at,
			engineVersion: BALANCED_SIGNAL_ENGINE_VERSION,
			evidence: safeEvidence(row.evidence_json),
		}
	}
	catch {
		return null
	}
}

async function stableSignalId(ownerId: string, symbol: StockSymbol, candidate: SignalCandidate) {
	const key = `${ownerId}|${symbol}|${candidate.bucketAt}|${candidate.signalType}|${candidate.engineVersion}`
	const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))
	const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
	return `sig_${hex.slice(0, 32)}`
}

function shanghaiDayBounds(value: Date) {
	const shifted = new Date(value.getTime() + SHANGHAI_OFFSET_MS)
	const localMidnightAsUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
	const startMs = localMidnightAsUtc - SHANGHAI_OFFSET_MS
	return {
		start: new Date(startMs).toISOString(),
		end: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
	}
}

export class MarketSignalService {
	constructor(
		private readonly env: Env,
		private readonly now: () => Date = () => new Date(),
	) {}

	private async loadHistory(targets: SignalWatchlistTarget[]): Promise<Map<string, SignalSnapshot[]>> {
		const result = new Map<string, SignalSnapshot[]>()
		for (const target of targets)
			result.set(pairKey(target.ownerId, target.watchlist.symbol), [])
		if (!targets.length)
			return result

		const ownerIds = [...new Set(targets.map(target => target.ownerId))]
		const symbols = [...new Set(targets.map(target => target.watchlist.symbol))]
		const allowedPairs = new Set(targets.map(target => pairKey(target.ownerId, target.watchlist.symbol)))
		const cutoff = new Date(this.now().getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString()
		const query = `
			SELECT owner_id, symbol, bucket_at, market_at, price, previous_close, turnover, source_id
			FROM market_watchlist_quote_5m
			WHERE market_at >= ?
				AND owner_id IN (${placeholders(ownerIds.length)})
				AND symbol IN (${placeholders(symbols.length)})
			ORDER BY owner_id, symbol, market_at, bucket_at
		`
		const rows = await this.env.DB.prepare(query)
			.bind(cutoff, ...ownerIds, ...symbols)
			.all<HistoryRow>()
		for (const row of rows.results) {
			const key = pairKey(row.owner_id, row.symbol)
			if (!allowedPairs.has(key))
				continue
			const snapshot = historyToSnapshot(row)
			if (snapshot)
				result.get(key)?.push(snapshot)
		}
		return result
	}

	private async loadCooldownRows(candidates: EvaluatedCandidate[]) {
		const result = new Map<string, CooldownRow[]>()
		for (const value of candidates)
			result.set(pairKey(value.target.ownerId, value.target.watchlist.symbol), [])
		if (!candidates.length)
			return result
		const ownerIds = [...new Set(candidates.map(value => value.target.ownerId))]
		const symbols = [...new Set(candidates.map(value => value.target.watchlist.symbol))]
		const allowedPairs = new Set(candidates.map(value => pairKey(value.target.ownerId, value.target.watchlist.symbol)))
		const earliest = Math.min(...candidates.map(value => Date.parse(value.candidate.marketAt)).filter(Number.isFinite))
		const cutoff = new Date(earliest - MARKET_SIGNAL_MAX_COOLDOWN_MS).toISOString()
		const query = `
			SELECT owner_id, symbol, market_at, signal_type, direction, severity, score
			FROM market_watchlist_signal
			WHERE market_at >= ?
				AND owner_id IN (${placeholders(ownerIds.length)})
				AND symbol IN (${placeholders(symbols.length)})
			ORDER BY market_at DESC
		`
		const rows = await this.env.DB.prepare(query).bind(cutoff, ...ownerIds, ...symbols).all<CooldownRow>()
		for (const row of rows.results) {
			const key = pairKey(row.owner_id, row.symbol)
			if (allowedPairs.has(key))
				result.get(key)?.push(row)
		}
		return result
	}

	async evaluateAffected(targets: SignalWatchlistTarget[]): Promise<SignalEvaluationSummary> {
		if (targets.length > MAX_TARGETS)
			throw new Error('Market signal target capacity exceeds 30')
		const enabled = targets.filter(target => target.watchlist.enabled)
		if (!enabled.length)
			return { evaluatedCount: 0, readyCount: 0, warmingCount: 0, signalCount: 0, strongCount: 0 }
		const histories = await this.loadHistory(enabled)
		let readyCount = 0
		const candidates: EvaluatedCandidate[] = []
		for (const target of enabled) {
			const evaluation = evaluateMarketSignal({
				watchlist: target.watchlist,
				snapshots: histories.get(pairKey(target.ownerId, target.watchlist.symbol)) ?? [],
			})
			if (evaluation.baseline.kind !== 'unavailable')
				readyCount += 1
			if (evaluation.candidate)
				candidates.push({ target, candidate: evaluation.candidate })
		}

		const recent = await this.loadCooldownRows(candidates)
		let signalCount = 0
		let strongCount = 0
		for (const value of candidates) {
			const key = pairKey(value.target.ownerId, value.target.watchlist.symbol)
			if (!marketSignalCooldownAllows(value.candidate, (recent.get(key) ?? []).map(row => ({
				marketAt: row.market_at,
				signalType: row.signal_type as MarketSignalType,
				direction: row.direction as MarketSignalDirection,
				severity: row.severity as MarketSignalSeverity,
				score: row.score,
			})))) {
				continue
			}
			const id = await stableSignalId(value.target.ownerId, value.target.watchlist.symbol, value.candidate)
			const detectedAt = this.now().toISOString()
			const inserted = await this.env.DB.prepare(`
				INSERT OR IGNORE INTO market_watchlist_signal (
					id, owner_id, symbol, bucket_at, market_at, detected_at, signal_type, direction,
					severity, score, title, evidence_json, engine_version, source_id, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				id,
				value.target.ownerId,
				value.target.watchlist.symbol,
				value.candidate.bucketAt,
				value.candidate.marketAt,
				detectedAt,
				value.candidate.signalType,
				value.candidate.direction,
				value.candidate.severity,
				value.candidate.score,
				value.candidate.title,
				JSON.stringify(value.candidate.evidence),
				value.candidate.engineVersion,
				value.candidate.sourceId,
				detectedAt,
			).run()
			if (Number(inserted.meta.changes || 0) > 0) {
				signalCount += 1
				if (value.candidate.severity === 'strong')
					strongCount += 1
			}
		}
		return {
			evaluatedCount: enabled.length,
			readyCount,
			warmingCount: enabled.length - readyCount,
			signalCount,
			strongCount,
		}
	}

	private async ownerWatchlist(ownerId: string): Promise<SignalWatchlistTarget[]> {
		const rows = await this.env.DB.prepare(`
			SELECT owner_id, symbol, exchange, stock_code, stock_name, sort_order,
				attention_price, enabled, created_at, updated_at
			FROM market_watchlist
			WHERE owner_id = ? AND enabled = 1
			ORDER BY sort_order, symbol
		`).bind(ownerId).all<WatchlistRow>()
		return rows.results
			.map(row => ({ ownerId, watchlist: rowToWatchlist(row) }))
			.filter((value): value is SignalWatchlistTarget => Boolean(value.watchlist))
	}

	async list(ownerId: string, options: MarketSignalListOptions = {}): Promise<MarketSignalDeskResponse> {
		const targets = await this.ownerWatchlist(ownerId)
		const histories = await this.loadHistory(targets)
		let readyCount = 0
		for (const target of targets) {
			const evaluation = evaluateMarketSignal({
				watchlist: target.watchlist,
				snapshots: histories.get(pairKey(ownerId, target.watchlist.symbol)) ?? [],
			})
			if (evaluation.baseline.kind !== 'unavailable')
				readyCount += 1
		}

		const scope = options.scope ?? 'today'
		const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 50)))
		const now = this.now()
		const bounds = scope === 'today'
			? shanghaiDayBounds(now)
			: { start: new Date(now.getTime() - RECENT_SCOPE_DAYS * 24 * 60 * 60 * 1000).toISOString(), end: now.toISOString() }
		const bindings: unknown[] = [ownerId, bounds.start, bounds.end]
		let symbolFilter = ''
		if (options.symbol) {
			symbolFilter = ' AND s.symbol = ?'
			bindings.push(options.symbol)
		}
		bindings.push(limit)
		const rows = await this.env.DB.prepare(`
			SELECT s.id, s.owner_id, s.symbol, w.stock_code, w.stock_name, s.market_at, s.detected_at,
				s.signal_type, s.direction, s.severity, s.score, s.title, s.evidence_json, s.engine_version
			FROM market_watchlist_signal s
			INNER JOIN market_watchlist w ON w.owner_id = s.owner_id AND w.symbol = s.symbol
			WHERE s.owner_id = ? AND s.market_at >= ? AND s.market_at < ?${symbolFilter}
			ORDER BY s.market_at DESC, s.id DESC
			LIMIT ?
		`).bind(...bindings).all<SignalRow>()
		const items = rows.results.map(signalRowToItem).filter((item): item is MarketSignalItem => Boolean(item))
		return {
			engineVersion: BALANCED_SIGNAL_ENGINE_VERSION,
			marketAt: items[0]?.marketAt ?? null,
			baseline: {
				enabledCount: targets.length,
				readyCount,
				warmingCount: targets.length - readyCount,
			},
			items,
		}
	}

	async cleanupRetention(): Promise<{ deleted: number }> {
		const cutoff = new Date(this.now().getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
		const result = await this.env.DB.prepare('DELETE FROM market_watchlist_signal WHERE market_at < ?').bind(cutoff).run()
		return { deleted: Number(result.meta.changes || 0) }
	}
}
