import type { FinancialReportPeriod } from '../shared/market'

const EASTMONEY_API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const EASTMONEY_SOURCE_ID = 'eastmoney-financial'
const EASTMONEY_SOURCE_NAME = '东方财富'
const STANDARD_REPORT_SUFFIX: Record<string, FinancialReportPeriod> = {
	'03-31': 'q1',
	'06-30': 'semiannual',
	'09-30': 'q3',
	'12-31': 'annual',
}

export type EastMoneyRawRow = Record<string, unknown>

export interface NormalizedFinancialReport {
	reportDate: string
	periodType: FinancialReportPeriod
	securityCode: string
	secucode: string
	securityName: string
	industryName: string | null
	noticeDate: string
	netProfitYoY: number | null
	grossMargin: number | null
	previousGrossMargin: number | null
	grossMarginYoYChange: number | null
	inventory: number | null
	previousInventory: number | null
	inventoryYoYChange: number | null
	inventoryYoYPct: number | null
	sourceId: string
	sourceName: string
	sourceUrl: string
	fetchedAt: string
}

export interface NormalizedFinancialSync {
	reportDate: string
	periodType: FinancialReportPeriod
	comparisonReportDate: string
	performanceRowCount: number
	balanceRowCount: number
	comparableRowCount: number
	futureNoticeExcludedCount: number
	sourceId: string
	sourceName: string
	sourceUrl: string
	fetchedAt: string
	rows: NormalizedFinancialReport[]
}

export interface NormalizeFinancialReportsInput {
	reportDate: string
	syncDate: string
	fetchedAt: string
	currentPerformance: EastMoneyRawRow[]
	previousPerformance: EastMoneyRawRow[]
	currentBalance: EastMoneyRawRow[]
	previousBalance: EastMoneyRawRow[]
}

export interface FetchEastMoneyReportPagesInput {
	reportName: string
	reportDateField: 'REPORTDATE' | 'REPORT_DATE'
	reportDate: string
	columns: string[]
	pageSize?: number
	fetchImpl?: typeof fetch
}

interface EastMoneyPage {
	pages: number
	count: number
	data: EastMoneyRawRow[]
}

interface IndexedRows {
	rows: Map<string, EastMoneyRawRow>
	futureNoticeExcludedCount: number
}

class EastMoneyPagingDriftError extends Error {}

function strictDate(value: unknown): string | null {
	if (typeof value !== 'string')
		return null
	const date = value.trim().slice(0, 10)
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(date))
		return null
	const parsed = new Date(`${date}T00:00:00.000Z`)
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null
}

function strictString(value: unknown): string | null {
	if (typeof value !== 'string')
		return null
	const normalized = value.trim()
	return normalized || null
}

function roundFinancial(value: number, decimals = 8): number {
	const factor = 10 ** decimals
	return Math.round((value + Number.EPSILON) * factor) / factor
}

export function strictFinancialNumber(value: unknown): number | null {
	if (typeof value === 'number')
		return Number.isFinite(value) ? value : null
	if (typeof value !== 'string')
		return null
	const normalized = value.trim().replaceAll(',', '')
	if (!normalized || normalized === '-' || normalized === '--' || normalized.toLowerCase() === 'null')
		return null
	const parsed = Number(normalized)
	return Number.isFinite(parsed) ? parsed : null
}

export function periodFromReportDate(reportDate: string): FinancialReportPeriod {
	const date = strictDate(reportDate)
	const period = date ? STANDARD_REPORT_SUFFIX[date.slice(5)] : undefined
	if (!date || !period)
		throw new Error(`Unsupported financial report date: ${reportDate}`)
	return period
}

export function previousComparableReportDate(reportDate: string): string {
	const period = periodFromReportDate(reportDate)
	void period
	const year = Number(reportDate.slice(0, 4))
	if (!Number.isInteger(year) || year <= 1)
		throw new Error(`Unsupported financial report year: ${reportDate}`)
	return `${year - 1}-${reportDate.slice(5)}`
}

export function resolveDefaultReportDate(syncDate: string): string {
	const date = strictDate(syncDate)
	if (!date)
		throw new Error(`Invalid sync date: ${syncDate}`)
	const year = Number(date.slice(0, 4))
	const monthDay = date.slice(5)
	if (monthDay >= '10-01')
		return `${year}-09-30`
	if (monthDay >= '07-01')
		return `${year}-06-30`
	if (monthDay >= '04-01')
		return `${year}-03-31`
	return `${year - 1}-12-31`
}

export function previousStandardReportDate(reportDate: string): string {
	const period = periodFromReportDate(reportDate)
	const year = Number(reportDate.slice(0, 4))
	switch (period) {
		case 'q1': return `${year - 1}-12-31`
		case 'semiannual': return `${year}-03-31`
		case 'q3': return `${year}-06-30`
		case 'annual': return `${year}-09-30`
	}
}

export function standardReportDateCandidates(syncDate: string, count = 4): string[] {
	if (!Number.isInteger(count) || count < 1 || count > 8)
		throw new Error(`Invalid financial report candidate count: ${count}`)
	const candidates: string[] = []
	let reportDate = resolveDefaultReportDate(syncDate)
	for (let index = 0; index < count; index += 1) {
		candidates.push(reportDate)
		reportDate = previousStandardReportDate(reportDate)
	}
	return candidates
}

export function hasVisibleReportRows(
	rows: EastMoneyRawRow[],
	reportDateField: 'REPORTDATE' | 'REPORT_DATE',
	reportDate: string,
	syncDate: string,
): boolean {
	const normalizedSyncDate = strictDate(syncDate)
	if (!normalizedSyncDate)
		throw new Error(`Invalid sync date: ${syncDate}`)
	return rows.some((row) => {
		const noticeDate = strictDate(row.NOTICE_DATE)
		return strictDate(row[reportDateField]) === reportDate
			&& noticeDate !== null
			&& noticeDate <= normalizedSyncDate
	})
}

export function eastMoneyFinancialSourceUrl(reportDate: string): string {
	periodFromReportDate(reportDate)
	return `https://data.eastmoney.com/bbsj/${reportDate.slice(0, 4)}${reportDate.slice(5, 7)}/yjbb.html`
}

function indexRows(
	input: EastMoneyRawRow[],
	reportDateField: 'REPORTDATE' | 'REPORT_DATE',
	reportDate: string,
	syncDate: string,
): IndexedRows {
	const rows = new Map<string, EastMoneyRawRow>()
	let futureNoticeExcludedCount = 0
	for (const row of input) {
		if (strictDate(row[reportDateField]) !== reportDate)
			continue
		const code = strictString(row.SECURITY_CODE)
		const noticeDate = strictDate(row.NOTICE_DATE)
		if (!code || !/^\d{6}$/u.test(code) || !noticeDate)
			continue
		if (noticeDate > syncDate) {
			futureNoticeExcludedCount += 1
			continue
		}
		const existing = rows.get(code)
		const existingNotice = existing ? strictDate(existing.NOTICE_DATE) : null
		if (!existing || !existingNotice || noticeDate >= existingNotice)
			rows.set(code, row)
	}
	return { rows, futureNoticeExcludedCount }
}

export function normalizeFinancialReports(input: NormalizeFinancialReportsInput): NormalizedFinancialSync {
	const periodType = periodFromReportDate(input.reportDate)
	const syncDate = strictDate(input.syncDate)
	if (!syncDate)
		throw new Error(`Invalid sync date: ${input.syncDate}`)
	const fetchedAtMs = Date.parse(input.fetchedAt)
	if (!Number.isFinite(fetchedAtMs))
		throw new Error(`Invalid fetchedAt: ${input.fetchedAt}`)

	const comparisonReportDate = previousComparableReportDate(input.reportDate)
	const currentPerformance = indexRows(input.currentPerformance, 'REPORTDATE', input.reportDate, syncDate)
	const previousPerformance = indexRows(input.previousPerformance, 'REPORTDATE', comparisonReportDate, syncDate)
	const currentBalance = indexRows(input.currentBalance, 'REPORT_DATE', input.reportDate, syncDate)
	const previousBalance = indexRows(input.previousBalance, 'REPORT_DATE', comparisonReportDate, syncDate)
	const sourceUrl = eastMoneyFinancialSourceUrl(input.reportDate)
	const rows: NormalizedFinancialReport[] = []

	for (const [securityCode, performance] of currentPerformance.rows) {
		const securityName = strictString(performance.SECURITY_NAME_ABBR)
		const noticeDate = strictDate(performance.NOTICE_DATE)
		if (!securityName || !noticeDate)
			continue
		const previousPerformanceRow = previousPerformance.rows.get(securityCode)
		const currentBalanceRow = currentBalance.rows.get(securityCode)
		const previousBalanceRow = previousBalance.rows.get(securityCode)
		const grossMargin = strictFinancialNumber(performance.XSMLL)
		const previousGrossMargin = strictFinancialNumber(previousPerformanceRow?.XSMLL)
		const inventory = strictFinancialNumber(currentBalanceRow?.INVENTORY)
		const previousInventory = strictFinancialNumber(previousBalanceRow?.INVENTORY)
		const grossMarginYoYChange = grossMargin !== null && previousGrossMargin !== null
			? roundFinancial(grossMargin - previousGrossMargin)
			: null
		const inventoryYoYChange = inventory !== null && previousInventory !== null
			? roundFinancial(inventory - previousInventory)
			: null
		const inventoryYoYPct = inventoryYoYChange !== null && previousInventory !== null && previousInventory > 0
			? roundFinancial(inventoryYoYChange / previousInventory * 100)
			: null

		rows.push({
			reportDate: input.reportDate,
			periodType,
			securityCode,
			secucode: strictString(performance.SECUCODE) ?? securityCode,
			securityName,
			industryName: strictString(performance.PUBLISHNAME),
			noticeDate,
			netProfitYoY: strictFinancialNumber(performance.SJLTZ),
			grossMargin,
			previousGrossMargin,
			grossMarginYoYChange,
			inventory,
			previousInventory,
			inventoryYoYChange,
			inventoryYoYPct,
			sourceId: EASTMONEY_SOURCE_ID,
			sourceName: EASTMONEY_SOURCE_NAME,
			sourceUrl,
			fetchedAt: input.fetchedAt,
		})
	}

	rows.sort((left, right) => left.securityCode.localeCompare(right.securityCode))
	return {
		reportDate: input.reportDate,
		periodType,
		comparisonReportDate,
		performanceRowCount: input.currentPerformance.length,
		balanceRowCount: input.currentBalance.length,
		comparableRowCount: rows.filter(row => row.grossMarginYoYChange !== null && row.inventoryYoYChange !== null).length,
		futureNoticeExcludedCount:
			currentPerformance.futureNoticeExcludedCount
			+ previousPerformance.futureNoticeExcludedCount
			+ currentBalance.futureNoticeExcludedCount
			+ previousBalance.futureNoticeExcludedCount,
		sourceId: EASTMONEY_SOURCE_ID,
		sourceName: EASTMONEY_SOURCE_NAME,
		sourceUrl,
		fetchedAt: input.fetchedAt,
		rows,
	}
}

function sqlLiteral(value: string | number | null): string {
	if (value === null)
		return 'NULL'
	if (typeof value === 'number')
		return Number.isFinite(value) ? String(value) : 'NULL'
	return `'${value.replaceAll('\u0000', '').replaceAll('\'', '\'\'')}'`
}

function reportInsertValues(row: NormalizedFinancialReport): string {
	return `(${[
		row.reportDate,
		row.periodType,
		row.securityCode,
		row.secucode,
		row.securityName,
		row.industryName,
		row.noticeDate,
		row.netProfitYoY,
		row.grossMargin,
		row.previousGrossMargin,
		row.grossMarginYoYChange,
		row.inventory,
		row.previousInventory,
		row.inventoryYoYChange,
		row.inventoryYoYPct,
		row.sourceId,
		row.sourceName,
		row.sourceUrl,
		row.fetchedAt,
		row.fetchedAt,
	].map(sqlLiteral).join(', ')})`
}

export function buildFinancialReportSql(input: NormalizedFinancialSync): string {
	if (!input.rows.length)
		throw new Error(`Refusing to overwrite ${input.reportDate} with zero normalized financial rows`)
	const statements: string[] = []
	const columns = `
  report_date, period_type, security_code, secucode, security_name, industry_name,
  notice_date, net_profit_yoy, gross_margin, previous_gross_margin, gross_margin_yoy_change,
  inventory, previous_inventory, inventory_yoy_change, inventory_yoy_pct,
  source_id, source_name, source_url, fetched_at, updated_at`
	for (let index = 0; index < input.rows.length; index += 50) {
		const values = input.rows.slice(index, index + 50).map(reportInsertValues).join(',\n')
		statements.push(`INSERT INTO market_financial_report (${columns}\n) VALUES\n${values}\nON CONFLICT(report_date, fetched_at, security_code) DO UPDATE SET
  period_type = excluded.period_type,
  secucode = excluded.secucode,
  security_name = excluded.security_name,
  industry_name = excluded.industry_name,
  notice_date = excluded.notice_date,
  net_profit_yoy = excluded.net_profit_yoy,
  gross_margin = excluded.gross_margin,
  previous_gross_margin = excluded.previous_gross_margin,
  gross_margin_yoy_change = excluded.gross_margin_yoy_change,
  inventory = excluded.inventory,
  previous_inventory = excluded.previous_inventory,
  inventory_yoy_change = excluded.inventory_yoy_change,
  inventory_yoy_pct = excluded.inventory_yoy_pct,
  source_id = excluded.source_id,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  fetched_at = excluded.fetched_at,
  updated_at = excluded.updated_at;`)
	}
	statements.push(`INSERT INTO market_financial_sync_state (
  report_date, period_type, comparison_report_date, performance_row_count, balance_row_count,
  comparable_row_count, future_notice_excluded_count, source_id, source_name, source_url,
  fetched_at, updated_at
) VALUES (${[
	input.reportDate,
	input.periodType,
	input.comparisonReportDate,
	input.performanceRowCount,
	input.balanceRowCount,
	input.comparableRowCount,
	input.futureNoticeExcludedCount,
	input.sourceId,
	input.sourceName,
	input.sourceUrl,
	input.fetchedAt,
	input.fetchedAt,
].map(sqlLiteral).join(', ')})
ON CONFLICT(report_date) DO UPDATE SET
  period_type = excluded.period_type,
  comparison_report_date = excluded.comparison_report_date,
  performance_row_count = excluded.performance_row_count,
  balance_row_count = excluded.balance_row_count,
  comparable_row_count = excluded.comparable_row_count,
  future_notice_excluded_count = excluded.future_notice_excluded_count,
  source_id = excluded.source_id,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  fetched_at = excluded.fetched_at,
  updated_at = excluded.updated_at;`)
	statements.push(`DELETE FROM market_financial_report
WHERE report_date = ${sqlLiteral(input.reportDate)}
  AND fetched_at <> ${sqlLiteral(input.fetchedAt)};`)
	return `${statements.join('\n\n')}\n`
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function retryDelay(attempt: number) {
	return new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)))
}

async function fetchEastMoneyPage(url: URL, fetchImpl: typeof fetch): Promise<EastMoneyPage> {
	let response: Response | null = null
	let lastNetworkError: unknown = null
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			response = await fetchImpl(url, {
				headers: {
					'accept': 'application/json, text/plain, */*',
					'referer': 'https://data.eastmoney.com/',
					'user-agent': 'Mozilla/5.0 (compatible; FlyBlogMarketFinancialSync/1.0)',
				},
				signal: AbortSignal.timeout(10_000),
			})
		}
		catch (error) {
			lastNetworkError = error
			if (attempt === 2)
				throw error
			await retryDelay(attempt)
			continue
		}
		if (response.ok)
			break
		if (response.status !== 429 && response.status < 500)
			throw new Error(`EastMoney financial request failed with HTTP ${response.status}`)
		if (attempt === 2)
			throw new Error(`EastMoney financial request failed with HTTP ${response.status}`)
		await retryDelay(attempt)
	}
	if (!response)
		throw lastNetworkError instanceof Error ? lastNetworkError : new Error('EastMoney financial request failed')
	const payload = asRecord(await response.json())
	const result = asRecord(payload?.result)
	if (payload?.success !== true || payload?.code !== 0 || !result)
		throw new Error('EastMoney financial response is not successful')
	const pages = strictFinancialNumber(result.pages)
	const count = strictFinancialNumber(result.count)
	const data = Array.isArray(result.data) ? result.data.filter(row => asRecord(row) !== null).map(row => asRecord(row)!) : null
	if (!Number.isInteger(pages) || pages === null || pages < 0 || !Number.isInteger(count) || count === null || count < 0 || !data)
		throw new Error('EastMoney financial response metadata is invalid')
	return { pages, count, data }
}

export async function fetchEastMoneyReportPages(input: FetchEastMoneyReportPagesInput): Promise<EastMoneyRawRow[]> {
	periodFromReportDate(input.reportDate)
	const pageSize = input.pageSize ?? 500
	if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500)
		throw new Error(`Invalid EastMoney page size: ${pageSize}`)
	const fetchImpl = input.fetchImpl ?? fetch
	const baseFilter = `(SECURITY_TYPE_CODE in ("058001001","058001008"))(TRADE_MARKET_CODE!="069001017")(${input.reportDateField}='${input.reportDate}')`
	const base = new URL(EASTMONEY_API)
	base.searchParams.set('reportName', input.reportName)
	base.searchParams.set('columns', [...new Set(['SECURITY_CODE', ...input.columns])].join(','))
	base.searchParams.set('pageSize', String(pageSize))
	base.searchParams.set('pageNumber', '1')
	base.searchParams.set('sortColumns', 'SECURITY_CODE')
	base.searchParams.set('sortTypes', '1')

	const fetchByFilter = async (filter: string) => {
		const url = new URL(base)
		url.searchParams.set('filter', filter)
		return fetchEastMoneyPage(url, fetchImpl)
	}

	const fetchBoundaryRows = async (securityCode: string) => {
		const page = await fetchByFilter(`${baseFilter}(SECURITY_CODE="${securityCode}")`)
		if (page.pages > 1 || page.data.length !== page.count)
			throw new EastMoneyPagingDriftError(`EastMoney financial boundary query for ${securityCode} is incomplete`)
		for (const row of page.data) {
			if (strictString(row.SECURITY_CODE) !== securityCode)
				throw new EastMoneyPagingDriftError(`EastMoney financial boundary query returned another security code for ${securityCode}`)
		}
		return page.data
	}

	const fetchAttempt = async () => {
		const rows: EastMoneyRawRow[] = []
		let cursor: string | null = null
		let initialCount: number | null = null
		let completed = false

		for (let step = 0; step < 100; step += 1) {
			const page = await fetchByFilter(`${baseFilter}${cursor ? `(SECURITY_CODE>"${cursor}")` : ''}`)
			if (initialCount === null)
				initialCount = page.count
			if (!page.data.length) {
				completed = true
				break
			}

			const codes = page.data.map(row => strictString(row.SECURITY_CODE))
			if (codes.includes(null) || codes.some(code => code !== null && !/^\d{6}$/u.test(code)))
				throw new EastMoneyPagingDriftError('EastMoney financial keyset page contains an invalid security code')
			const validCodes = codes as string[]
			for (let index = 0; index < validCodes.length; index += 1) {
				const code = validCodes[index]!
				if (cursor && code <= cursor)
					throw new EastMoneyPagingDriftError(`EastMoney financial keyset cursor did not advance beyond ${cursor}`)
				if (index > 0 && code < validCodes[index - 1]!)
					throw new EastMoneyPagingDriftError('EastMoney financial keyset page is not ordered by security code')
			}

			if (page.count <= pageSize) {
				if (page.pages > 1 || page.data.length !== page.count)
					throw new EastMoneyPagingDriftError(`EastMoney financial terminal keyset page count mismatch: expected ${page.count}, got ${page.data.length}`)
				rows.push(...page.data)
				completed = true
				break
			}

			if (page.data.length !== pageSize || page.pages < 2)
				throw new EastMoneyPagingDriftError('EastMoney financial keyset page was truncated before the cursor boundary')
			const boundaryCode = validCodes.at(-1)!
			const boundaryRows = await fetchBoundaryRows(boundaryCode)
			rows.push(...page.data.filter(row => strictString(row.SECURITY_CODE) !== boundaryCode))
			rows.push(...boundaryRows)
			cursor = boundaryCode
		}

		if (!completed)
			throw new EastMoneyPagingDriftError('EastMoney financial keyset pagination exceeded the safety bound')

		const verification = await fetchByFilter(baseFilter)
		if (initialCount !== verification.count || rows.length !== verification.count) {
			throw new EastMoneyPagingDriftError(
				`EastMoney financial keyset count changed during fetch: initial ${initialCount ?? 'unknown'}, final ${verification.count}, fetched ${rows.length}`,
			)
		}
		return rows
	}

	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			return await fetchAttempt()
		}
		catch (error) {
			if (!(error instanceof EastMoneyPagingDriftError) || attempt === 1)
				throw error
		}
	}
	throw new Error('EastMoney financial keyset pagination failed unexpectedly')
}
