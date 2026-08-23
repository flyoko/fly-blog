import { describe, expect, it } from 'vitest'
import {
	isShanghaiMarketWindow,
	millisecondsUntilNextShanghaiWindow,
	SIGNAL_MARKET_WINDOWS,
	WATCHLIST_MARKET_WINDOWS,
} from '../../app/utils/market-polling'
import { chinaAShareHistoryStart } from '../../shared/market-calendar'

function shanghai(date: string, time: string) {
	return new Date(`${date}T${time}:00+08:00`)
}

describe('market polling windows', () => {
	it('keeps watchlist and signal windows distinct and rejects weekends', () => {
		expect(isShanghaiMarketWindow(shanghai('2026-08-24', '09:20'), WATCHLIST_MARKET_WINDOWS)).toBe(true)
		expect(isShanghaiMarketWindow(shanghai('2026-08-24', '09:20'), SIGNAL_MARKET_WINDOWS)).toBe(false)
		expect(isShanghaiMarketWindow(shanghai('2026-08-24', '09:30'), SIGNAL_MARKET_WINDOWS)).toBe(true)
		expect(isShanghaiMarketWindow(shanghai('2026-08-23', '10:00'), WATCHLIST_MARKET_WINDOWS)).toBe(false)
		expect(isShanghaiMarketWindow(shanghai('2026-10-02', '10:00'), WATCHLIST_MARKET_WINDOWS)).toBe(false)
		expect(isShanghaiMarketWindow(shanghai('2027-01-04', '10:00'), WATCHLIST_MARKET_WINDOWS)).toBe(false)
	})

	it('wakes once at the afternoon session instead of staying dormant through lunch', () => {
		const now = shanghai('2026-08-24', '11:36')
		expect(millisecondsUntilNextShanghaiWindow(now, WATCHLIST_MARKET_WINDOWS)).toBe(
			shanghai('2026-08-24', '12:55').getTime() - now.getTime(),
		)
		expect(millisecondsUntilNextShanghaiWindow(now, SIGNAL_MARKET_WINDOWS)).toBe(
			shanghai('2026-08-24', '13:00').getTime() - now.getTime(),
		)
	})

	it('keeps five prior trading days across the Spring Festival closure', () => {
		expect(chinaAShareHistoryStart(shanghai('2026-02-24', '10:35'), 5)).toBe(shanghai('2026-02-09', '00:00').toISOString())
	})

	it('wakes after exchange closures longer than one week', () => {
		const now = shanghai('2026-02-14', '10:00')
		expect(millisecondsUntilNextShanghaiWindow(now, SIGNAL_MARKET_WINDOWS)).toBe(
			shanghai('2026-02-24', '09:30').getTime() - now.getTime(),
		)
	})

	it('skips official 2026 exchange holidays when scheduling the next wakeup', () => {
		const now = shanghai('2026-09-24', '16:00')
		expect(millisecondsUntilNextShanghaiWindow(now, SIGNAL_MARKET_WINDOWS)).toBe(
			shanghai('2026-09-28', '09:30').getTime() - now.getTime(),
		)
	})

	it('skips weekends when scheduling the next wakeup', () => {
		const now = shanghai('2026-08-23', '17:10')
		expect(millisecondsUntilNextShanghaiWindow(now, SIGNAL_MARKET_WINDOWS)).toBe(
			shanghai('2026-08-24', '09:30').getTime() - now.getTime(),
		)
	})
})
