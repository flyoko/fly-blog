const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

// SSE, SZSE and BSE published the same 2026 closure schedule on 2025-12-22.
// Keep the year explicit so a future calendar cannot silently inherit stale dates.
export const CHINA_A_SHARE_CALENDAR_VERSION = 'sse-szse-bse-2026'
const CHINA_A_SHARE_CALENDAR_YEAR = '2026'

const CHINA_A_SHARE_CLOSED_DATES = new Set([
	'2026-01-01',
	'2026-01-02',
	'2026-01-03',
	'2026-01-04',
	'2026-02-14',
	'2026-02-15',
	'2026-02-16',
	'2026-02-17',
	'2026-02-18',
	'2026-02-19',
	'2026-02-20',
	'2026-02-21',
	'2026-02-22',
	'2026-02-23',
	'2026-02-28',
	'2026-04-04',
	'2026-04-05',
	'2026-04-06',
	'2026-05-01',
	'2026-05-02',
	'2026-05-03',
	'2026-05-04',
	'2026-05-05',
	'2026-05-09',
	'2026-06-19',
	'2026-06-20',
	'2026-06-21',
	'2026-09-20',
	'2026-09-25',
	'2026-09-26',
	'2026-09-27',
	'2026-10-01',
	'2026-10-02',
	'2026-10-03',
	'2026-10-04',
	'2026-10-05',
	'2026-10-06',
	'2026-10-07',
	'2026-10-10',
])

function timestamp(value: Date | string): number | null {
	const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
	return Number.isFinite(parsed) ? parsed : null
}

export function shanghaiDateKey(value: Date | string): string | null {
	const parsed = timestamp(value)
	if (parsed === null)
		return null
	const shifted = new Date(parsed + SHANGHAI_OFFSET_MS)
	return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export function isChinaAShareTradingDate(value: Date | string): boolean {
	const parsed = timestamp(value)
	const dateKey = shanghaiDateKey(value)
	if (parsed === null || !dateKey || !dateKey.startsWith(`${CHINA_A_SHARE_CALENDAR_YEAR}-`))
		return false
	const shifted = new Date(parsed + SHANGHAI_OFFSET_MS)
	const weekday = shifted.getUTCDay()
	if (weekday === 0 || weekday === 6)
		return false
	return !CHINA_A_SHARE_CLOSED_DATES.has(dateKey)
}

export function chinaAShareHistoryStart(value: Date, priorTradingDays = 5): string {
	const currentMs = value.getTime()
	if (!Number.isFinite(currentMs) || priorTradingDays < 1)
		return value.toISOString()
	const shifted = new Date(currentMs + SHANGHAI_OFFSET_MS)
	const localMidnightAsUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
	let found = 0
	for (let dayOffset = 1; dayOffset <= 31; dayOffset += 1) {
		const candidateMs = localMidnightAsUtc - dayOffset * 24 * 60 * 60 * 1000 - SHANGHAI_OFFSET_MS
		if (!isChinaAShareTradingDate(new Date(candidateMs)))
			continue
		found += 1
		if (found === priorTradingDays)
			return new Date(candidateMs).toISOString()
	}
	// Reading a little more real history is safer than fabricating readiness when a future calendar is not configured.
	return new Date(currentMs - 21 * 24 * 60 * 60 * 1000).toISOString()
}
