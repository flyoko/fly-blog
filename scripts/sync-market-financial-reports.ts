import type { EastMoneyRawRow } from './market-financial-sync-core'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import {
	buildFinancialReportSql,
	fetchEastMoneyReportPages,
	hasVisibleReportRows,
	normalizeFinancialReports,
	periodFromReportDate,
	previousComparableReportDate,
	standardReportDateCandidates,
} from './market-financial-sync-core'

const PERFORMANCE_COLUMNS = [
	'SECURITY_CODE',
	'SECUCODE',
	'SECURITY_NAME_ABBR',
	'PUBLISHNAME',
	'REPORTDATE',
	'NOTICE_DATE',
	'SJLTZ',
	'XSMLL',
]

const PREVIOUS_PERFORMANCE_COLUMNS = [
	'SECURITY_CODE',
	'REPORTDATE',
	'NOTICE_DATE',
	'XSMLL',
]

const BALANCE_COLUMNS = [
	'SECURITY_CODE',
	'REPORT_DATE',
	'NOTICE_DATE',
	'INVENTORY',
]

function dateInShanghai(now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Shanghai',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now)
	const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
	if (!values.year || !values.month || !values.day)
		throw new Error('Unable to resolve Asia/Shanghai sync date')
	return `${values.year}-${values.month}-${values.day}`
}

function requiredRows(name: string, rows: Record<string, unknown>[]) {
	if (!rows.length)
		throw new Error(`EastMoney ${name} returned zero rows; refusing to replace the last-good snapshot`)
}

async function fetchCurrentReport(reportDate: string): Promise<{ performance: EastMoneyRawRow[], balance: EastMoneyRawRow[] }> {
	const [performance, balance] = await Promise.all([
		fetchEastMoneyReportPages({
			reportName: 'RPT_LICO_FN_CPD',
			reportDateField: 'REPORTDATE',
			reportDate,
			columns: PERFORMANCE_COLUMNS,
		}),
		fetchEastMoneyReportPages({
			reportName: 'RPT_DMSK_FN_BALANCE',
			reportDateField: 'REPORT_DATE',
			reportDate,
			columns: BALANCE_COLUMNS,
		}),
	])
	return { performance, balance }
}

async function resolveReportSnapshot(syncDate: string, requestedReportDate: string | undefined) {
	if (requestedReportDate) {
		periodFromReportDate(requestedReportDate)
		const current = await fetchCurrentReport(requestedReportDate)
		return { reportDate: requestedReportDate, ...current }
	}

	for (const candidate of standardReportDateCandidates(syncDate)) {
		const current = await fetchCurrentReport(candidate)
		const performanceVisible = hasVisibleReportRows(current.performance, 'REPORTDATE', candidate, syncDate)
		const balanceVisible = hasVisibleReportRows(current.balance, 'REPORT_DATE', candidate, syncDate)
		if (performanceVisible && balanceVisible)
			return { reportDate: candidate, ...current }
	}
	throw new Error(`No announced standard financial report period is available as of ${syncDate}`)
}

async function main() {
	const syncDate = process.env.SYNC_DATE?.trim() || dateInShanghai()
	const requestedReportDate = process.env.REPORT_DATE?.trim() || undefined
	const current = await resolveReportSnapshot(syncDate, requestedReportDate)
	const reportDate = current.reportDate
	const comparisonReportDate = previousComparableReportDate(reportDate)
	const fetchedAt = new Date().toISOString()
	const outputSql = resolve(process.env.OUTPUT_SQL?.trim() || '/tmp/market-financial-sync.sql')

	await rm(outputSql, { force: true })

	const [previousPerformance, previousBalance] = await Promise.all([
		fetchEastMoneyReportPages({
			reportName: 'RPT_LICO_FN_CPD',
			reportDateField: 'REPORTDATE',
			reportDate: comparisonReportDate,
			columns: PREVIOUS_PERFORMANCE_COLUMNS,
		}),
		fetchEastMoneyReportPages({
			reportName: 'RPT_DMSK_FN_BALANCE',
			reportDateField: 'REPORT_DATE',
			reportDate: comparisonReportDate,
			columns: BALANCE_COLUMNS,
		}),
	])

	const currentPerformance = current.performance
	const currentBalance = current.balance
	requiredRows('current performance report', currentPerformance)
	requiredRows('previous performance report', previousPerformance)
	requiredRows('current balance sheet', currentBalance)
	requiredRows('previous balance sheet', previousBalance)

	const normalized = normalizeFinancialReports({
		reportDate,
		syncDate,
		fetchedAt,
		currentPerformance,
		previousPerformance,
		currentBalance,
		previousBalance,
	})
	const sql = buildFinancialReportSql(normalized)

	await mkdir(dirname(outputSql), { recursive: true })
	await writeFile(outputSql, sql, { encoding: 'utf8', mode: 0o600 })

	process.stdout.write(`${JSON.stringify({
		reportDate,
		comparisonReportDate,
		syncDate,
		fetchedAt,
		performanceRowCount: normalized.performanceRowCount,
		balanceRowCount: normalized.balanceRowCount,
		comparableRowCount: normalized.comparableRowCount,
		normalizedRowCount: normalized.rows.length,
		futureNoticeExcludedCount: normalized.futureNoticeExcludedCount,
		outputSql,
	}, null, 2)}\n`)
}

main().catch(async (error) => {
	const outputSql = resolve(process.env.OUTPUT_SQL?.trim() || '/tmp/market-financial-sync.sql')
	await rm(outputSql, { force: true }).catch(() => undefined)
	process.stderr.write(`${error instanceof Error ? error.message : 'Market financial sync failed'}\n`)
	process.exitCode = 1
})
