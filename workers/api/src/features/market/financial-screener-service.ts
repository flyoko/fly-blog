import type {
	FinancialReportPeriod,
	MarketEnvelope,
	MarketFinancialScreenerData,
	MarketFinancialScreenerFilters,
	MarketFinancialScreenerItem,
} from '../../../../../shared/market'
import type { Env } from '../../env'

const STALE_AFTER_MS = 96 * 60 * 60 * 1000

interface FinancialSyncStateRow {
	report_date: string
	period_type: FinancialReportPeriod
	comparison_report_date: string
	source_id: string
	source_name: string
	source_url: string
	fetched_at: string
}

interface FinancialReportRow {
	security_code: string
	secucode: string
	security_name: string
	industry_name: string | null
	report_date: string
	notice_date: string
	net_profit_yoy: number | null
	gross_margin: number | null
	previous_gross_margin: number | null
	gross_margin_yoy_change: number | null
	inventory: number | null
	previous_inventory: number | null
	inventory_yoy_change: number | null
	inventory_yoy_pct: number | null
}

function defaults(input: Partial<MarketFinancialScreenerFilters>): MarketFinancialScreenerFilters {
	return {
		period: input.period ?? 'semiannual',
		reportDate: input.reportDate ?? null,
		minNetProfitYoY: input.minNetProfitYoY ?? 50,
		grossMarginTrend: input.grossMarginTrend ?? 'up',
		inventoryTrend: input.inventoryTrend ?? 'up',
		keyword: input.keyword?.trim() ?? '',
		limit: input.limit ?? 100,
	}
}

function unavailable(): MarketEnvelope<MarketFinancialScreenerData> {
	return {
		data: null,
		source: [],
		fetchedAt: null,
		marketAt: null,
		stale: false,
		staleAgeMs: null,
		quality: 'unavailable',
	}
}

function mapItem(row: FinancialReportRow): MarketFinancialScreenerItem {
	return {
		securityCode: row.security_code,
		secucode: row.secucode,
		securityName: row.security_name,
		industryName: row.industry_name,
		reportDate: row.report_date,
		noticeDate: row.notice_date,
		netProfitYoY: row.net_profit_yoy,
		grossMargin: row.gross_margin,
		previousGrossMargin: row.previous_gross_margin,
		grossMarginYoYChange: row.gross_margin_yoy_change,
		inventory: row.inventory,
		previousInventory: row.previous_inventory,
		inventoryYoYChange: row.inventory_yoy_change,
		inventoryYoYPct: row.inventory_yoy_pct,
	}
}

export class FinancialScreenerService {
	constructor(
		private readonly env: Env,
		private readonly now: () => Date = () => new Date(),
	) {}

	async listVersion(): Promise<string> {
		const row = await this.env.DB.prepare(`
			SELECT fetched_at FROM market_financial_sync_state
			ORDER BY fetched_at DESC LIMIT 1
		`).first<{ fetched_at: string }>()
		return row?.fetched_at ? `financial:${row.fetched_at}` : 'financial:empty'
	}

	async screen(input: Partial<MarketFinancialScreenerFilters> = {}): Promise<MarketEnvelope<MarketFinancialScreenerData>> {
		const filters = defaults(input)
		const state = filters.reportDate
			? await this.env.DB.prepare(`
				SELECT report_date, period_type, comparison_report_date, source_id, source_name, source_url, fetched_at
				FROM market_financial_sync_state
				WHERE report_date = ? AND period_type = ?
				LIMIT 1
			`).bind(filters.reportDate, filters.period).first<FinancialSyncStateRow>()
			: await this.env.DB.prepare(`
				SELECT report_date, period_type, comparison_report_date, source_id, source_name, source_url, fetched_at
				FROM market_financial_sync_state
				WHERE period_type = ?
				ORDER BY report_date DESC
				LIMIT 1
			`).bind(filters.period).first<FinancialSyncStateRow>()

		if (!state)
			return unavailable()

		const selectedFilters: MarketFinancialScreenerFilters = {
			...filters,
			reportDate: state.report_date,
		}
		const baseConditions = ['report_date = ?', 'period_type = ?', 'fetched_at = ?', 'net_profit_yoy >= ?']
		const bindings: Array<string | number> = [state.report_date, filters.period, state.fetched_at, filters.minNetProfitYoY]

		if (filters.grossMarginTrend === 'up')
			baseConditions.push('gross_margin_yoy_change > 0')
		if (filters.inventoryTrend === 'up')
			baseConditions.push('inventory_yoy_change > 0')
		if (filters.keyword) {
			baseConditions.push('(security_code LIKE ? OR security_name LIKE ? OR industry_name LIKE ?)')
			const pattern = `%${filters.keyword}%`
			bindings.push(pattern, pattern, pattern)
		}

		const where = baseConditions.join(' AND ')
		const totalRow = await this.env.DB.prepare(`
			SELECT COUNT(*) AS count
			FROM market_financial_report
			WHERE report_date = ? AND period_type = ? AND fetched_at = ?
		`).bind(state.report_date, filters.period, state.fetched_at).first<{ count: number }>()
		const matchedRow = await this.env.DB.prepare(`
			SELECT COUNT(*) AS count
			FROM market_financial_report
			WHERE ${where}
		`).bind(...bindings).first<{ count: number }>()
		const rows = await this.env.DB.prepare(`
			SELECT
				security_code, secucode, security_name, industry_name, report_date, notice_date,
				net_profit_yoy, gross_margin, previous_gross_margin, gross_margin_yoy_change,
				inventory, previous_inventory, inventory_yoy_change, inventory_yoy_pct
			FROM market_financial_report
			WHERE ${where}
			ORDER BY net_profit_yoy DESC, gross_margin_yoy_change DESC, inventory_yoy_change DESC, security_code ASC
			LIMIT ?
		`).bind(...bindings, filters.limit).all<FinancialReportRow>()

		const fetchedMs = Date.parse(state.fetched_at)
		const staleAgeMs = Number.isFinite(fetchedMs) ? Math.max(0, this.now().getTime() - fetchedMs) : null
		const stale = staleAgeMs !== null && staleAgeMs > STALE_AFTER_MS

		return {
			data: {
				period: filters.period,
				reportDate: state.report_date,
				comparisonReportDate: state.comparison_report_date,
				totalAvailable: totalRow?.count ?? 0,
				matchedCount: matchedRow?.count ?? 0,
				filters: selectedFilters,
				items: (rows.results ?? []).map(mapItem),
			},
			source: [{
				sourceId: state.source_id,
				sourceName: state.source_name,
				endpoint: state.source_url,
			}],
			fetchedAt: state.fetched_at,
			marketAt: `${state.report_date}T00:00:00.000Z`,
			stale,
			staleAgeMs,
			quality: stale ? 'stale' : 'live',
		}
	}
}
