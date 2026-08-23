import type {
	CiticFuturesPositionHistory,
	CiticFuturesPositionPoint,
	CiticFuturesProduct,
	CiticFuturesSeries,
} from '../../../../../shared/market'
import type { Env } from '../../env'
import type { CiticPositionProvider as PositionProvider } from './cffex'
import { citicFuturesProducts } from '../../../../../shared/market'
import {
	chinaAShareRecentCompletedTradingDates,
	isChinaAShareTradingDate,
	shanghaiDateKey,
} from '../../../../../shared/market-calendar'
import {
	CFFEX_PUBLIC_PAGE,
	CFFEX_SOURCE_NAME,
	CffexCiticPositionProvider,
} from './cffex'

const RETENTION_DAYS = 30
const DAY_MS = 86_400_000

const PRODUCT_NAMES: Record<CiticFuturesSeries, string> = {
	ALL: '股指期货合计',
	IF: '沪深300股指期货',
	IH: '上证50股指期货',
	IC: '中证500股指期货',
	IM: '中证1000股指期货',
}

interface PositionRow {
	trade_date: string
	product: CiticFuturesProduct
	long_position: number
	long_change: number
	short_position: number
	short_change: number
	net_position: number
	net_change: number
	contract_count: number
	long_ranked_contract_count: number
	short_ranked_contract_count: number
	complete: number
	source_url: string
	fetched_at: string
}

export interface CiticFuturesSyncResult {
	status: 'success' | 'skipped'
	tradeDate: string | null
	itemCount: number
	reason?: 'non-trading-day'
}

function rowDto(row: PositionRow): CiticFuturesPositionPoint {
	return {
		tradeDate: row.trade_date,
		product: row.product,
		longPosition: row.long_position,
		longChange: row.long_change,
		shortPosition: row.short_position,
		shortChange: row.short_change,
		netPosition: row.net_position,
		netChange: row.net_change,
		contractCount: row.contract_count,
		longRankedContractCount: row.long_ranked_contract_count,
		shortRankedContractCount: row.short_ranked_contract_count,
		complete: Boolean(row.complete),
	}
}

function aggregateRows(rows: PositionRow[]): CiticFuturesPositionPoint[] {
	const byDate = new Map<string, PositionRow[]>()
	for (const row of rows)
		byDate.set(row.trade_date, [...(byDate.get(row.trade_date) || []), row])

	return [...byDate.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([tradeDate, dayRows]) => {
			const products = new Set(dayRows.map(row => row.product))
			return {
				tradeDate,
				product: 'ALL',
				longPosition: dayRows.reduce((sum, row) => sum + row.long_position, 0),
				longChange: dayRows.reduce((sum, row) => sum + row.long_change, 0),
				shortPosition: dayRows.reduce((sum, row) => sum + row.short_position, 0),
				shortChange: dayRows.reduce((sum, row) => sum + row.short_change, 0),
				netPosition: dayRows.reduce((sum, row) => sum + row.net_position, 0),
				netChange: dayRows.reduce((sum, row) => sum + row.net_change, 0),
				contractCount: dayRows.reduce((sum, row) => sum + row.contract_count, 0),
				longRankedContractCount: dayRows.reduce((sum, row) => sum + row.long_ranked_contract_count, 0),
				shortRankedContractCount: dayRows.reduce((sum, row) => sum + row.short_ranked_contract_count, 0),
				complete: products.size === citicFuturesProducts.length && dayRows.every(row => Boolean(row.complete)),
			} satisfies CiticFuturesPositionPoint
		})
}

function latestFetchedAt(rows: PositionRow[]): string | null {
	const values = rows
		.map(row => row.fetched_at)
		.filter(value => Number.isFinite(Date.parse(value)))
		.sort((left, right) => Date.parse(right) - Date.parse(left))
	return values[0] || null
}

export class FuturesPositionService {
	constructor(
		private readonly env: Env,
		private readonly provider: PositionProvider = new CffexCiticPositionProvider(),
		private readonly now: () => Date = () => new Date(),
	) {}

	async syncScheduled(scheduledAt?: string): Promise<CiticFuturesSyncResult> {
		const runAt = scheduledAt ? new Date(scheduledAt) : this.now()
		if (!Number.isFinite(runAt.getTime()))
			throw new Error('CFFEX scheduledAt is invalid')
		if (!isChinaAShareTradingDate(runAt))
			return { status: 'skipped', tradeDate: shanghaiDateKey(runAt), itemCount: 0, reason: 'non-trading-day' }

		const tradeDate = shanghaiDateKey(runAt)
		if (!tradeDate)
			throw new Error('CFFEX trade date is invalid')

		const settled = await Promise.allSettled(
			citicFuturesProducts.map(product => this.provider.fetchProduct(product, tradeDate)),
		)
		const successful = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
		if (!successful.length) {
			const messages = settled.flatMap(result => result.status === 'rejected' ? [String(result.reason)] : [])
			throw new Error(`CFFEX position sync failed for all products${messages.length ? `: ${messages.join('; ')}` : ''}`)
		}

		const updatedAt = this.now().toISOString()
		const cutoff = shanghaiDateKey(new Date(runAt.getTime() - (RETENTION_DAYS - 1) * DAY_MS))
		const statements = successful.map(({ data, sourceUrl, fetchedAt }) => this.env.DB.prepare(`
			INSERT INTO citic_futures_position_daily (
				trade_date, product, long_position, long_change, short_position, short_change,
				net_position, net_change, contract_count, long_ranked_contract_count,
				short_ranked_contract_count, complete, source_url, fetched_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(trade_date, product) DO UPDATE SET
				long_position = excluded.long_position,
				long_change = excluded.long_change,
				short_position = excluded.short_position,
				short_change = excluded.short_change,
				net_position = excluded.net_position,
				net_change = excluded.net_change,
				contract_count = excluded.contract_count,
				long_ranked_contract_count = excluded.long_ranked_contract_count,
				short_ranked_contract_count = excluded.short_ranked_contract_count,
				complete = excluded.complete,
				source_url = excluded.source_url,
				fetched_at = excluded.fetched_at,
				updated_at = excluded.updated_at
		`).bind(
			data.tradeDate,
			data.product,
			data.longPosition,
			data.longChange,
			data.shortPosition,
			data.shortChange,
			data.netPosition,
			data.netChange,
			data.contractCount,
			data.longRankedContractCount,
			data.shortRankedContractCount,
			data.complete ? 1 : 0,
			sourceUrl,
			fetchedAt,
			updatedAt,
		))
		if (cutoff)
			statements.push(this.env.DB.prepare('DELETE FROM citic_futures_position_daily WHERE trade_date < ?').bind(cutoff))
		await this.env.DB.batch(statements)

		const failedProducts = settled.flatMap((result, index) => result.status === 'rejected' ? [citicFuturesProducts[index]!] : [])
		if (failedProducts.length)
			throw new Error(`CFFEX position sync incomplete: ${failedProducts.join(', ')}`)

		return { status: 'success', tradeDate, itemCount: successful.length }
	}

	async history(product: CiticFuturesSeries, days = 30): Promise<CiticFuturesPositionHistory> {
		const boundedDays = Math.min(RETENTION_DAYS, Math.max(1, Math.trunc(days)))
		const now = this.now()
		const cutoff = shanghaiDateKey(new Date(now.getTime() - (boundedDays - 1) * DAY_MS))
		let rows: PositionRow[] = []
		if (cutoff) {
			const result = product === 'ALL'
				? await this.env.DB.prepare(`
					SELECT trade_date, product, long_position, long_change, short_position, short_change,
						net_position, net_change, contract_count, long_ranked_contract_count,
						short_ranked_contract_count, complete, source_url, fetched_at
					FROM citic_futures_position_daily
					WHERE trade_date >= ?
					ORDER BY trade_date ASC, product ASC
				`).bind(cutoff).all<PositionRow>()
				: await this.env.DB.prepare(`
					SELECT trade_date, product, long_position, long_change, short_position, short_change,
						net_position, net_change, contract_count, long_ranked_contract_count,
						short_ranked_contract_count, complete, source_url, fetched_at
					FROM citic_futures_position_daily
					WHERE product = ? AND trade_date >= ?
					ORDER BY trade_date ASC
				`).bind(product, cutoff).all<PositionRow>()
			rows = result.results
		}

		const items = product === 'ALL' ? aggregateRows(rows) : rows.map(rowDto)
		const latest = items.at(-1)
		const expectedTradeDate = chinaAShareRecentCompletedTradingDates(now, 1).at(-1) || null
		const quality = !latest
			? 'unavailable'
			: expectedTradeDate && latest.tradeDate !== expectedTradeDate
				? 'stale'
				: latest.complete
					? 'live'
					: 'degraded'
		return {
			product,
			productName: PRODUCT_NAMES[product],
			brokerName: '中信期货(代客)',
			sourceName: CFFEX_SOURCE_NAME,
			sourceUrl: product === 'ALL' ? CFFEX_PUBLIC_PAGE : rows.at(-1)?.source_url || CFFEX_PUBLIC_PAGE,
			fetchedAt: latestFetchedAt(rows),
			quality,
			items,
		}
	}
}
