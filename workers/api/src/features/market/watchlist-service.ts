import type {
	MarketDataQuality,
	MarketSourceRef,
	StockQuote,
	StockSymbol,
	WatchlistItem,
	WatchlistRadarItem,
	WatchlistRadarResponse,
} from '../../../../../shared/market'
import type { Env } from '../../env'
import type { StockQuoteProvider, StockQuoteProviderResult } from './contracts'
import { isChinaMarketSyncWindow } from './contracts'
import { EastMoneyStockQuoteProvider, parseStockSymbol } from './eastmoney-stock'
import { MarketSignalService } from './signal-service'

const WATCHLIST_LIMIT = 30
const NOTE_MAX_LENGTH = 240
const TAG_LIMIT = 8
const TAG_MAX_LENGTH = 24
const FIVE_MINUTES_MS = 5 * 60 * 1000

export type WatchlistServiceErrorCode
	= | 'LIMIT_REACHED'
		| 'CONFLICT'
		| 'NOT_FOUND'
		| 'INVALID_STOCK'
		| 'PROVIDER_UNAVAILABLE'
		| 'VALIDATION_FAILED'

export class WatchlistServiceError extends Error {
	constructor(
		public readonly code: WatchlistServiceErrorCode,
		message: string,
	) {
		super(message)
		this.name = 'WatchlistServiceError'
	}
}

export interface AddWatchlistInput {
	symbol: StockSymbol | string
	note?: string | null
	attentionPrice?: number | null
	tags?: string[]
}

export interface UpdateWatchlistInput {
	note?: string | null
	attentionPrice?: number | null
	tags?: string[]
	enabled?: boolean
	sortOrder?: number
}

export interface WatchlistSyncResult {
	status: 'success' | 'partial' | 'failed' | 'skipped'
	reason?: 'outside-market-window' | 'empty-watchlist' | 'capacity-limit' | 'provider-failed'
	itemCount: number
	missingCount: number
}

interface WatchlistRow {
	owner_id: string
	symbol: StockSymbol
	exchange: 'SSE' | 'SZSE' | 'BSE'
	stock_code: string
	stock_name: string
	sort_order: number
	note: string | null
	attention_price: number | null
	tags_json: string
	enabled: number
	created_at: string
	updated_at: string
}

interface SnapshotRow {
	owner_id: string
	symbol: StockSymbol
	bucket_at: string
	market_at: string
	fetched_at: string
	price: number
	change_value: number
	change_pct: number
	open_price: number | null
	high_price: number | null
	low_price: number | null
	previous_close: number | null
	volume: number | null
	turnover: number | null
	turnover_rate: number | null
	source_id: string
	created_at: string
}

function errorSummary(error: unknown): string {
	const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
	return raw.replace(/[\r\n\t]+/gu, ' ').slice(0, 500)
}

function safeTags(value: string): string[] {
	try {
		const parsed = JSON.parse(value)
		return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
	}
	catch {
		return []
	}
}

function rowToItem(row: WatchlistRow): WatchlistItem {
	return {
		symbol: row.symbol,
		exchange: row.exchange,
		code: row.stock_code,
		name: row.stock_name,
		sortOrder: row.sort_order,
		note: row.note,
		attentionPrice: row.attention_price,
		tags: safeTags(row.tags_json),
		enabled: row.enabled === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function validateAttentionPrice(value: number | null | undefined): number | null | undefined {
	if (value === undefined)
		return undefined
	if (value === null)
		return null
	if (!Number.isFinite(value) || value <= 0)
		throw new WatchlistServiceError('VALIDATION_FAILED', 'Attention price must be a positive finite number')
	return value
}

function validateNote(value: string | null | undefined): string | null | undefined {
	if (value === undefined)
		return undefined
	if (value === null)
		return null
	const normalized = value.trim()
	if (normalized.length > NOTE_MAX_LENGTH)
		throw new WatchlistServiceError('VALIDATION_FAILED', `Watchlist note must be at most ${NOTE_MAX_LENGTH} characters`)
	return normalized || null
}

function validateTags(value: string[] | undefined): string[] | undefined {
	if (value === undefined)
		return undefined
	if (!Array.isArray(value) || value.length > TAG_LIMIT)
		throw new WatchlistServiceError('VALIDATION_FAILED', `Watchlist tags must contain at most ${TAG_LIMIT} items`)
	const normalized: string[] = []
	for (const raw of value) {
		if (typeof raw !== 'string')
			throw new WatchlistServiceError('VALIDATION_FAILED', 'Watchlist tags must be strings')
		const tag = raw.trim()
		if (!tag || tag.length > TAG_MAX_LENGTH)
			throw new WatchlistServiceError('VALIDATION_FAILED', `Each watchlist tag must be 1-${TAG_MAX_LENGTH} characters`)
		if (!normalized.includes(tag))
			normalized.push(tag)
	}
	return normalized
}

function validateSortOrder(value: number | undefined): number | undefined {
	if (value === undefined)
		return undefined
	if (!Number.isInteger(value) || value < 0 || value > 10_000)
		throw new WatchlistServiceError('VALIDATION_FAILED', 'Watchlist sort order is invalid')
	return value
}

function ageMs(now: Date, marketAt: string): number {
	const parsed = Date.parse(marketAt)
	return Number.isFinite(parsed) ? Math.max(0, now.getTime() - parsed) : 0
}

function bucketAt(marketAt: string): string {
	const parsed = Date.parse(marketAt)
	if (!Number.isFinite(parsed))
		throw new Error('Stock quote marketAt is invalid')
	return new Date(Math.floor(parsed / FIVE_MINUTES_MS) * FIVE_MINUTES_MS).toISOString()
}

function storedSource(sourceId: string): MarketSourceRef {
	return {
		sourceId,
		sourceName: sourceId.startsWith('eastmoney-') ? '东方财富' : sourceId,
		endpoint: 'd1:last-good',
	}
}

function latestFetchedAt(values: Array<string | null | undefined>): string | null {
	const valid = values.filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
	if (!valid.length)
		return null
	return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0]!
}

function aggregateQuality(items: WatchlistRadarItem[]): MarketDataQuality {
	if (!items.length)
		return 'live'
	const live = items.filter(item => item.quality === 'live').length
	const stale = items.filter(item => item.quality === 'stale').length
	const unavailable = items.length - live - stale
	if (live === items.length)
		return 'live'
	if (stale === items.length)
		return 'stale'
	if (unavailable === items.length)
		return 'unavailable'
	return 'degraded'
}

export class WatchlistService {
	constructor(
		private readonly env: Env,
		private readonly provider: StockQuoteProvider = new EastMoneyStockQuoteProvider(),
		private readonly now: () => Date = () => new Date(),
		private readonly signals: Pick<MarketSignalService, 'evaluateAffected'> = new MarketSignalService(env, now),
	) {}

	async list(ownerId: string): Promise<WatchlistItem[]> {
		const rows = await this.env.DB.prepare(`
			SELECT owner_id, symbol, exchange, stock_code, stock_name, sort_order,
				note, attention_price, tags_json, enabled, created_at, updated_at
			FROM market_watchlist
			WHERE owner_id = ?
			ORDER BY sort_order, symbol
		`).bind(ownerId).all<WatchlistRow>()
		return rows.results.map(rowToItem)
	}

	private async globalCount(): Promise<number> {
		const row = await this.env.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist').first<{ count: number }>()
		return Number(row?.count || 0)
	}

	private async find(ownerId: string, symbol: StockSymbol): Promise<WatchlistItem | null> {
		const row = await this.env.DB.prepare(`
			SELECT owner_id, symbol, exchange, stock_code, stock_name, sort_order,
				note, attention_price, tags_json, enabled, created_at, updated_at
			FROM market_watchlist
			WHERE owner_id = ? AND symbol = ?
		`).bind(ownerId, symbol).first<WatchlistRow>()
		return row ? rowToItem(row) : null
	}

	async add(ownerId: string, input: AddWatchlistInput): Promise<WatchlistItem> {
		const parsed = parseStockSymbol(String(input.symbol))
		if (await this.find(ownerId, parsed.symbol))
			throw new WatchlistServiceError('CONFLICT', 'Stock is already in the watchlist')
		if (await this.globalCount() >= WATCHLIST_LIMIT)
			throw new WatchlistServiceError('LIMIT_REACHED', 'Watchlist has reached the 30 stock limit')

		const attentionPrice = validateAttentionPrice(input.attentionPrice) ?? null
		const note = validateNote(input.note) ?? null
		const tags = validateTags(input.tags) ?? []
		let result: StockQuoteProviderResult
		try {
			result = await this.provider.fetchQuotes([parsed.symbol])
		}
		catch (error) {
			throw new WatchlistServiceError('PROVIDER_UNAVAILABLE', `Stock verification failed: ${errorSummary(error)}`)
		}
		const verified = result.quotes.get(parsed.symbol)
		if (!verified)
			throw new WatchlistServiceError('INVALID_STOCK', 'Stock could not be verified by the quote provider')

		const order = await this.env.DB.prepare(`
			SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
			FROM market_watchlist
			WHERE owner_id = ?
		`).bind(ownerId).first<{ next_order: number }>()
		const now = this.now().toISOString()
		try {
			await this.env.DB.prepare(`
				INSERT INTO market_watchlist (
					owner_id, symbol, exchange, stock_code, stock_name, sort_order,
					note, attention_price, tags_json, enabled, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
			`).bind(
				ownerId,
				parsed.symbol,
				parsed.exchange,
				parsed.code,
				verified.name,
				Number(order?.next_order || 0),
				note,
				attentionPrice,
				JSON.stringify(tags),
				now,
				now,
			).run()
		}
		catch (error) {
			const message = errorSummary(error)
			if (message.includes('market_watchlist_limit'))
				throw new WatchlistServiceError('LIMIT_REACHED', 'Watchlist has reached the 30 stock limit')
			if (/unique|constraint/i.test(message))
				throw new WatchlistServiceError('CONFLICT', 'Stock is already in the watchlist')
			throw error
		}
		return (await this.find(ownerId, parsed.symbol))!
	}

	async update(ownerId: string, rawSymbol: StockSymbol | string, input: UpdateWatchlistInput): Promise<WatchlistItem> {
		const symbol = parseStockSymbol(String(rawSymbol)).symbol
		const existing = await this.find(ownerId, symbol)
		if (!existing)
			throw new WatchlistServiceError('NOT_FOUND', 'Watchlist stock was not found')
		const note = validateNote(input.note)
		const attentionPrice = validateAttentionPrice(input.attentionPrice)
		const tags = validateTags(input.tags)
		const sortOrder = validateSortOrder(input.sortOrder)
		const enabled = input.enabled
		if (enabled !== undefined && typeof enabled !== 'boolean')
			throw new WatchlistServiceError('VALIDATION_FAILED', 'Watchlist enabled flag is invalid')
		const now = this.now().toISOString()
		await this.env.DB.prepare(`
			UPDATE market_watchlist
			SET note = ?, attention_price = ?, tags_json = ?, enabled = ?, updated_at = ?
			WHERE owner_id = ? AND symbol = ?
		`).bind(
			note === undefined ? existing.note : note,
			attentionPrice === undefined ? existing.attentionPrice : attentionPrice,
			JSON.stringify(tags === undefined ? existing.tags : tags),
			(enabled === undefined ? existing.enabled : enabled) ? 1 : 0,
			now,
			ownerId,
			symbol,
		).run()

		if (sortOrder !== undefined) {
			const ordered = await this.list(ownerId)
			const moved = ordered.find(item => item.symbol === symbol)
			if (!moved)
				throw new WatchlistServiceError('NOT_FOUND', 'Watchlist stock was not found')
			const remaining = ordered.filter(item => item.symbol !== symbol)
			remaining.splice(Math.min(sortOrder, remaining.length), 0, moved)
			await this.env.DB.batch(remaining.map((item, index) => this.env.DB.prepare(`
				UPDATE market_watchlist
				SET sort_order = ?, updated_at = ?
				WHERE owner_id = ? AND symbol = ?
			`).bind(index, now, ownerId, item.symbol)))
		}

		return (await this.find(ownerId, symbol))!
	}

	async remove(ownerId: string, rawSymbol: StockSymbol | string): Promise<boolean> {
		const symbol = parseStockSymbol(String(rawSymbol)).symbol
		const result = await this.env.DB.prepare('DELETE FROM market_watchlist WHERE owner_id = ? AND symbol = ?')
			.bind(ownerId, symbol)
			.run()
		return Number(result.meta.changes || 0) > 0
	}

	private async latestSnapshots(ownerId: string, symbols: StockSymbol[]): Promise<Map<StockSymbol, SnapshotRow>> {
		if (!symbols.length)
			return new Map()
		const placeholders = symbols.map(() => '?').join(',')
		const rows = await this.env.DB.prepare(`
			SELECT owner_id, symbol, bucket_at, market_at, fetched_at, price, change_value, change_pct,
				open_price, high_price, low_price, previous_close, volume, turnover, turnover_rate, source_id, created_at
			FROM (
				SELECT *, ROW_NUMBER() OVER (
					PARTITION BY owner_id, symbol
					ORDER BY market_at DESC, bucket_at DESC
				) AS row_number
				FROM market_watchlist_quote_5m
				WHERE owner_id = ? AND symbol IN (${placeholders})
			)
			WHERE row_number = 1
		`).bind(ownerId, ...symbols).all<SnapshotRow>()
		return new Map(rows.results.map(row => [row.symbol, row]))
	}

	private snapshotQuote(item: WatchlistItem, row: SnapshotRow): StockQuote {
		return {
			symbol: item.symbol,
			code: item.code,
			name: item.name,
			price: row.price,
			change: row.change_value,
			changePct: row.change_pct,
			open: row.open_price,
			high: row.high_price,
			low: row.low_price,
			previousClose: row.previous_close,
			volume: row.volume,
			turnover: row.turnover,
			turnoverRate: row.turnover_rate,
			marketAt: row.market_at,
		}
	}

	async quotes(ownerId: string): Promise<WatchlistRadarResponse> {
		const watchlist = (await this.list(ownerId)).filter(item => item.enabled)
		if (!watchlist.length)
			return { quality: 'live', fetchedAt: null, items: [] }
		const symbols = watchlist.map(item => item.symbol)
		let live: StockQuoteProviderResult | null = null
		try {
			live = await this.provider.fetchQuotes(symbols)
		}
		catch {
			live = null
		}
		const fallbackSymbols = live ? symbols.filter(symbol => !live!.quotes.has(symbol)) : symbols
		const snapshots = await this.latestSnapshots(ownerId, fallbackSymbols)
		const now = this.now()
		const items = watchlist.map<WatchlistRadarItem>((item) => {
			const current = live?.quotes.get(item.symbol)
			if (current) {
				return {
					watchlist: item,
					quote: current,
					quality: 'live',
					staleAgeMs: null,
					source: live!.source,
				}
			}
			const snapshot = snapshots.get(item.symbol)
			if (snapshot) {
				return {
					watchlist: item,
					quote: this.snapshotQuote(item, snapshot),
					quality: 'stale',
					staleAgeMs: ageMs(now, snapshot.market_at),
					source: storedSource(snapshot.source_id),
				}
			}
			return { watchlist: item, quote: null, quality: 'unavailable', staleAgeMs: null, source: null }
		})
		return {
			quality: aggregateQuality(items),
			fetchedAt: latestFetchedAt([
				live?.fetchedAt,
				...fallbackSymbols.map(symbol => snapshots.get(symbol)?.fetched_at),
			]),
			items,
		}
	}

	private async writeHealth(status: 'success' | 'failed', itemCount: number, error: string | null, latencyMs: number | null): Promise<void> {
		const now = this.now().toISOString()
		const sourceId = this.provider.sourceId?.() || 'stock-provider'
		await this.env.DB.prepare(`
			INSERT INTO market_source_health (
				capability, source_id, status, item_count, latency_ms,
				last_attempt_at, last_success_at, last_error, updated_at
			) VALUES ('watchlist-sync', ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(capability, source_id) DO UPDATE SET
				status = excluded.status,
				item_count = excluded.item_count,
				latency_ms = excluded.latency_ms,
				last_attempt_at = excluded.last_attempt_at,
				last_success_at = CASE
					WHEN excluded.status = 'success' THEN excluded.last_success_at
					ELSE market_source_health.last_success_at
				END,
				last_error = excluded.last_error,
				updated_at = excluded.updated_at
		`).bind(
			sourceId,
			status,
			itemCount,
			latencyMs,
			now,
			status === 'success' ? now : null,
			error,
			now,
		).run()
	}

	async syncScheduled(): Promise<WatchlistSyncResult> {
		if (!isChinaMarketSyncWindow(this.now()))
			return { status: 'skipped', reason: 'outside-market-window', itemCount: 0, missingCount: 0 }

		const total = await this.globalCount()
		if (total > WATCHLIST_LIMIT) {
			await this.writeHealth('failed', 0, `Watchlist capacity exceeded: ${total} > ${WATCHLIST_LIMIT}`, null)
			return { status: 'failed', reason: 'capacity-limit', itemCount: 0, missingCount: 0 }
		}

		const rows = await this.env.DB.prepare(`
			SELECT owner_id, symbol, exchange, stock_code, stock_name, sort_order,
				note, attention_price, tags_json, enabled, created_at, updated_at
			FROM market_watchlist
			WHERE enabled = 1
			ORDER BY owner_id, sort_order, symbol
		`).all<WatchlistRow>()
		if (!rows.results.length)
			return { status: 'skipped', reason: 'empty-watchlist', itemCount: 0, missingCount: 0 }

		const uniqueSymbols = [...new Set(rows.results.map(row => row.symbol))]
		let result: StockQuoteProviderResult
		try {
			result = await this.provider.fetchQuotes(uniqueSymbols)
		}
		catch (error) {
			await this.writeHealth('failed', 0, errorSummary(error), null)
			return { status: 'failed', reason: 'provider-failed', itemCount: 0, missingCount: uniqueSymbols.length }
		}

		const createdAt = this.now().toISOString()
		const statements = rows.results.flatMap((row) => {
			const current = result.quotes.get(row.symbol)
			if (!current)
				return []
			return [this.env.DB.prepare(`
				INSERT INTO market_watchlist_quote_5m (
					owner_id, symbol, bucket_at, market_at, fetched_at, price, change_value, change_pct,
					open_price, high_price, low_price, previous_close, volume, turnover, turnover_rate, source_id, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(owner_id, symbol, bucket_at) DO UPDATE SET
					market_at = excluded.market_at,
					fetched_at = excluded.fetched_at,
					price = excluded.price,
					change_value = excluded.change_value,
					change_pct = excluded.change_pct,
					open_price = excluded.open_price,
					high_price = excluded.high_price,
					low_price = excluded.low_price,
					previous_close = excluded.previous_close,
					volume = excluded.volume,
					turnover = excluded.turnover,
					turnover_rate = excluded.turnover_rate,
					source_id = excluded.source_id
			`).bind(
				row.owner_id,
				row.symbol,
				bucketAt(current.marketAt),
				current.marketAt,
				result.fetchedAt,
				current.price,
				current.change,
				current.changePct,
				current.open,
				current.high,
				current.low,
				current.previousClose,
				current.volume,
				current.turnover,
				current.turnoverRate,
				result.source.sourceId,
				createdAt,
			)]
		})
		if (statements.length)
			await this.env.DB.batch(statements)
		const signalTargets = rows.results
			.filter(row => result.quotes.has(row.symbol))
			.map(row => ({ ownerId: row.owner_id, watchlist: rowToItem(row) }))
		if (signalTargets.length)
			await this.signals.evaluateAffected(signalTargets)
		await this.writeHealth('success', statements.length, null, result.latencyMs)
		const missingCount = rows.results.filter(row => !result.quotes.has(row.symbol)).length
		return {
			status: missingCount ? 'partial' : 'success',
			itemCount: statements.length,
			missingCount,
		}
	}
}
