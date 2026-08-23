import type { WatchlistItem } from '../../../shared/market'
import type { SignalSnapshot } from '../src/features/market/signal-engine'
import { describe, expect, it } from 'vitest'
import {
	BALANCED_SIGNAL_ENGINE_VERSION,
	computeTurnoverInterval,
	evaluateMarketSignal,
	marketSignalCooldownAllows,

} from '../src/features/market/signal-engine'

function iso(date: string, time: string) {
	return new Date(`${date}T${time}:00+08:00`).toISOString()
}

function snapshot(date: string, time: string, price: number, turnover: number | null, options: Partial<SignalSnapshot> = {}): SignalSnapshot {
	const at = iso(date, time)
	return {
		bucketAt: at,
		marketAt: at,
		price,
		previousClose: 99,
		turnover,
		sourceId: 'test-source',
		...options,
	}
}

function watchlist(attentionPrice: number | null = null): WatchlistItem {
	return {
		symbol: 'SZSE:300308',
		exchange: 'SZSE',
		code: '300308',
		name: '中际旭创',
		sortOrder: 0,
		note: null,
		attentionPrice,
		tags: [],
		enabled: true,
		createdAt: iso('2026-08-20', '09:30'),
		updatedAt: iso('2026-08-20', '09:30'),
	}
}

function sameSlotHistory(deltas = [5_000_000, 6_000_000, 7_000_000]) {
	return ['2026-08-19', '2026-08-20', '2026-08-21'].flatMap((date, index) => [
		snapshot(date, '10:30', 98 + index, 100_000_000),
		snapshot(date, '10:35', 98.2 + index, 100_000_000 + deltas[index]!),
	])
}

describe('balanced-v1 strict time-series semantics', () => {
	it('accepts only an exact same-session five-minute turnover interval', () => {
		const previous = snapshot('2026-08-24', '10:30', 100, 100_000_000)
		const current = snapshot('2026-08-24', '10:35', 101, 105_000_000)
		expect(computeTurnoverInterval(previous, current)).toEqual({ delta: 5_000_000 })
	})

	it('rejects missing buckets, lunch gaps, cross-day values, backward marketAt, null and negative turnover', () => {
		const base = snapshot('2026-08-24', '10:30', 100, 100_000_000)
		expect(computeTurnoverInterval(base, snapshot('2026-08-24', '10:40', 101, 110_000_000))).toBeNull()
		expect(computeTurnoverInterval(snapshot('2026-08-24', '11:30', 100, 100_000_000), snapshot('2026-08-24', '13:00', 101, 110_000_000))).toBeNull()
		expect(computeTurnoverInterval(snapshot('2026-08-21', '14:55', 100, 100_000_000), snapshot('2026-08-24', '09:30', 101, 110_000_000))).toBeNull()
		expect(computeTurnoverInterval(base, snapshot('2026-08-24', '10:35', 101, 110_000_000, { marketAt: base.marketAt }))).toBeNull()
		expect(computeTurnoverInterval(base, snapshot('2026-08-24', '10:35', 101, null))).toBeNull()
		expect(computeTurnoverInterval(base, snapshot('2026-08-24', '10:35', 101, 90_000_000))).toBeNull()
	})

	it('requires three consecutive buckets for a ten-minute price window', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				snapshot('2026-08-24', '10:20', 100, 100_000_000),
				snapshot('2026-08-24', '10:30', 101.6, 110_000_000),
			],
		})
		expect(result.priceMove10mPct).toBeNull()
	})
})

describe('balanced-v1 baselines', () => {
	it('uses the median of at least three same-slot historical trading-day deltas', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				...sameSlotHistory(),
				snapshot('2026-08-24', '10:30', 100, 100_000_000),
				snapshot('2026-08-24', '10:35', 100.2, 112_000_000),
			],
		})
		expect(result.baseline).toMatchObject({ kind: 'historical-slot', value: 6_000_000, sampleCount: 3 })
	})

	it('falls back to the current-session rolling median with at least four prior valid deltas', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				snapshot('2026-08-24', '09:55', 100, 100_000_000),
				snapshot('2026-08-24', '10:00', 100, 104_000_000),
				snapshot('2026-08-24', '10:05', 100, 109_000_000),
				snapshot('2026-08-24', '10:10', 100, 115_000_000),
				snapshot('2026-08-24', '10:15', 100, 122_000_000),
				snapshot('2026-08-24', '10:20', 100.2, 134_000_000),
			],
		})
		expect(result.baseline).toMatchObject({ kind: 'intraday', value: 5_500_000, sampleCount: 4 })
	})

	it('prefers the historical same-slot baseline over an intraday fallback', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				...sameSlotHistory([4_000_000, 4_000_000, 4_000_000]),
				snapshot('2026-08-24', '10:10', 100, 70_000_000),
				snapshot('2026-08-24', '10:15', 100, 80_000_000),
				snapshot('2026-08-24', '10:20', 100, 90_000_000),
				snapshot('2026-08-24', '10:25', 100, 100_000_000),
				snapshot('2026-08-24', '10:30', 100, 110_000_000),
				snapshot('2026-08-24', '10:35', 100.2, 118_000_000),
			],
		})
		expect(result.baseline).toMatchObject({ kind: 'historical-slot', value: 4_000_000, sampleCount: 3 })
	})

	it('stays warming when turnover history is insufficient and never falls back to volume', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				snapshot('2026-08-24', '10:30', 100, null),
				snapshot('2026-08-24', '10:35', 101.2, null),
			],
		})
		expect(result.baseline.kind).toBe('unavailable')
		expect(result.evidence.flowBasis).toBeNull()
	})
})

describe('balanced-v1 factors, scoring, and type priority', () => {
	it('turns normal price plus 2x turnover into a 65-point watch signal', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				...sameSlotHistory(),
				snapshot('2026-08-24', '10:30', 100, 100_000_000),
				snapshot('2026-08-24', '10:35', 101.2, 112_000_000),
			],
		})
		expect(result.candidate).toMatchObject({ signalType: 'momentum_up', direction: 'up', severity: 'watch', score: 65, title: '放量上冲' })
		expect(result.candidate?.evidence.factors).toEqual(['TURNOVER_SURGE', 'PRICE_ACCELERATION', 'DIRECTION_ALIGNMENT'])
	})

	it('does not persist a normal or strong turnover surge by itself', () => {
		for (const delta of [12_000_000, 18_000_000]) {
			const result = evaluateMarketSignal({
				watchlist: watchlist(),
				snapshots: [
					...sameSlotHistory(),
					snapshot('2026-08-24', '10:30', 100, 100_000_000),
					snapshot('2026-08-24', '10:35', 100.1, 100_000_000 + delta),
				],
			})
			expect(result.candidate).toBeNull()
		}
	})

	it('allows an extreme five-minute price move to become an independent watch signal', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				snapshot('2026-08-24', '10:30', 100, null),
				snapshot('2026-08-24', '10:35', 101.8, null),
			],
		})
		expect(result.candidate).toMatchObject({ signalType: 'price_spike_up', severity: 'watch', score: 50 })
		expect(result.candidate?.evidence.factors).toEqual(['PRICE_ACCELERATION'])
	})

	it('scores a strong 0.5% range break plus 3x turnover as a strong breakout', () => {
		const previousPrices = [100, 100.1, 100.2, 100.1, 100.3, 100.4]
		const times = ['10:05', '10:10', '10:15', '10:20', '10:25', '10:30']
		const currentDay = times.map((time, index) => snapshot('2026-08-24', time, previousPrices[index]!, 70_000_000 + index * 5_000_000))
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				...sameSlotHistory(),
				...currentDay,
				snapshot('2026-08-24', '10:35', 100.91, 120_000_000),
			],
		})
		expect(result.candidate).toMatchObject({ signalType: 'breakout_up', severity: 'strong', score: 85 })
		expect(result.candidate?.evidence.rangeHigh).toBe(100.4)
	})

	it('never emits a normal range break alone', () => {
		const times = ['10:05', '10:10', '10:15', '10:20', '10:25', '10:30']
		const prior = times.map((time, index) => snapshot('2026-08-24', time, 100 + index * 0.05, null))
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [...prior, snapshot('2026-08-24', '10:35', 100.46, null)],
		})
		expect(result.candidate).toBeNull()
	})

	it('treats attention crossing as a user-priority watch signal even for a small move', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(100.05),
			snapshots: [
				snapshot('2026-08-24', '10:30', 100, null),
				snapshot('2026-08-24', '10:35', 100.1, null),
			],
		})
		expect(result.candidate).toMatchObject({ signalType: 'attention_cross_up', direction: 'up', severity: 'watch', score: 55 })
	})

	it('uses previousClose only for a first-session attention gap cross', () => {
		const open = evaluateMarketSignal({
			watchlist: watchlist(100),
			snapshots: [snapshot('2026-08-24', '09:30', 101, null, { previousClose: 99 })],
		})
		expect(open.candidate).toMatchObject({ signalType: 'attention_cross_up', score: 55 })
		const preOpen = evaluateMarketSignal({
			watchlist: watchlist(100),
			snapshots: [snapshot('2026-08-24', '09:25', 101, null, { previousClose: 99 })],
		})
		expect(preOpen.candidate).toBeNull()
	})

	it('prioritizes attention-cross signalType while retaining other factors and caps score at 100', () => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(100.5),
			snapshots: [
				...sameSlotHistory(),
				snapshot('2026-08-24', '10:30', 100, 100_000_000),
				snapshot('2026-08-24', '10:35', 102, 120_000_000),
			],
		})
		expect(result.candidate).toMatchObject({ signalType: 'attention_cross_up', severity: 'strong', score: 100 })
		expect(result.candidate?.evidence.factors).toContain('ATTENTION_CROSS')
		expect(result.candidate?.evidence.factors).toContain('TURNOVER_SURGE')
	})

	it.each([
		{ ratio: 1.999, delta: 11_994_000, expected: false },
		{ ratio: 2, delta: 12_000_000, expected: true },
		{ ratio: 3, delta: 18_000_000, expected: true },
	])('keeps turnover ratio threshold exact at $ratio', ({ delta, expected }) => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				...sameSlotHistory(),
				snapshot('2026-08-24', '10:30', 100, 100_000_000),
				snapshot('2026-08-24', '10:35', 101.2, 100_000_000 + delta),
			],
		})
		expect(result.evidence.factors.includes('TURNOVER_SURGE')).toBe(expected)
	})

	it.each([
		{ delta: 2_999_999, expected: false },
		{ delta: 3_000_000, expected: true },
	])('keeps the absolute turnover floor exact at $delta', ({ delta, expected }) => {
		const history = sameSlotHistory([1_000_000, 1_000_000, 1_000_000])
		const result = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				...history,
				snapshot('2026-08-24', '10:30', 100, 100_000_000),
				snapshot('2026-08-24', '10:35', 101.2, 100_000_000 + delta),
			],
		})
		expect(result.evidence.factors.includes('TURNOVER_SURGE')).toBe(expected)
	})

	it.each([
		{ date: '2026-08-23', time: '10:35' },
		{ date: '2026-08-24', time: '15:05' },
	])('fails closed outside the signal trading window at $date $time', ({ date, time }) => {
		const result = evaluateMarketSignal({
			watchlist: watchlist(100),
			snapshots: [snapshot(date, time, 102, 120_000_000, { previousClose: 99 })],
		})
		expect(result.candidate).toBeNull()
		expect(result.baseline.kind).toBe('unavailable')
	})

	it('shares deterministic 20/30-minute cooldown policy with replay consumers', () => {
		const base = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				...sameSlotHistory(),
				snapshot('2026-08-24', '10:30', 100, 100_000_000),
				snapshot('2026-08-24', '10:35', 101.2, 112_000_000),
			],
		}).candidate!
		expect(marketSignalCooldownAllows(base, [])).toBe(true)
		expect(marketSignalCooldownAllows(base, [{
			marketAt: iso('2026-08-24', '10:20'),
			signalType: 'momentum_up',
			direction: 'up',
			severity: 'watch',
			score: 60,
		}])).toBe(false)

		const attention = evaluateMarketSignal({
			watchlist: watchlist(100.5),
			snapshots: [
				snapshot('2026-08-24', '10:30', 100, null),
				snapshot('2026-08-24', '10:35', 100.6, null),
			],
		}).candidate!
		expect(marketSignalCooldownAllows(attention, [{
			marketAt: iso('2026-08-24', '10:10'),
			signalType: 'attention_cross_up',
			direction: 'up',
			severity: 'watch',
			score: 55,
		}])).toBe(false)
	})

	it('allows a strong candidate to penetrate a same-direction watch by at least 15 points without suppressing a reversal', () => {
		const strong = evaluateMarketSignal({
			watchlist: watchlist(),
			snapshots: [
				...sameSlotHistory(),
				snapshot('2026-08-24', '10:30', 100, 100_000_000),
				snapshot('2026-08-24', '10:35', 102, 120_000_000),
			],
		}).candidate!
		expect(strong.severity).toBe('strong')
		expect(marketSignalCooldownAllows(strong, [{
			marketAt: iso('2026-08-24', '10:20'),
			signalType: 'momentum_up',
			direction: 'up',
			severity: 'watch',
			score: 65,
		}])).toBe(true)
		expect(marketSignalCooldownAllows(strong, [{
			marketAt: iso('2026-08-24', '10:20'),
			signalType: 'momentum_down',
			direction: 'down',
			severity: 'strong',
			score: 95,
		}])).toBe(true)
	})

	it('keeps the engine version stable', () => {
		expect(BALANCED_SIGNAL_ENGINE_VERSION).toBe('balanced-v1')
	})
})
