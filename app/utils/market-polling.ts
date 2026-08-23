import { isChinaAShareTradingDate } from '#shared/market-calendar'

export interface ShanghaiMinuteWindow {
	startMinute: number
	endMinute: number
}

export const WATCHLIST_MARKET_WINDOWS = [
	{ startMinute: 9 * 60 + 20, endMinute: 11 * 60 + 35 },
	{ startMinute: 12 * 60 + 55, endMinute: 15 * 60 + 15 },
] as const satisfies readonly ShanghaiMinuteWindow[]

export const SIGNAL_MARKET_WINDOWS = [
	{ startMinute: 9 * 60 + 30, endMinute: 11 * 60 + 30 },
	{ startMinute: 13 * 60, endMinute: 15 * 60 },
] as const satisfies readonly ShanghaiMinuteWindow[]

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function shanghaiCalendar(value: Date) {
	const shifted = new Date(value.getTime() + SHANGHAI_OFFSET_MS)
	return {
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth(),
		day: shifted.getUTCDate(),
		minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
	}
}

export function isShanghaiMarketWindow(value: Date, windows: readonly ShanghaiMinuteWindow[]) {
	const parts = shanghaiCalendar(value)
	if (!isChinaAShareTradingDate(value))
		return false
	return windows.some(window => parts.minuteOfDay >= window.startMinute && parts.minuteOfDay <= window.endMinute)
}

export function millisecondsUntilNextShanghaiWindow(value: Date, windows: readonly ShanghaiMinuteWindow[]) {
	if (!windows.length)
		return null
	const currentMs = value.getTime()
	const parts = shanghaiCalendar(value)
	const starts = [...new Set(windows.map(window => window.startMinute))].sort((left, right) => left - right)

	for (let dayOffset = 0; dayOffset <= 31; dayOffset += 1) {
		const localDay = new Date(Date.UTC(parts.year, parts.month, parts.day + dayOffset))
		for (const startMinute of starts) {
			const localStartAsUtc = Date.UTC(
				localDay.getUTCFullYear(),
				localDay.getUTCMonth(),
				localDay.getUTCDate(),
				Math.floor(startMinute / 60),
				startMinute % 60,
			)
			const candidateMs = localStartAsUtc - SHANGHAI_OFFSET_MS
			if (candidateMs > currentMs && isChinaAShareTradingDate(new Date(candidateMs)))
				return candidateMs - currentMs
		}
	}
	return null
}
