import type {
	MarketSignalDirection,
	MarketSignalEvidence,
	MarketSignalFactor,
	MarketSignalSeverity,
	MarketSignalType,
	WatchlistItem,
} from '../../../../../shared/market'

export const BALANCED_SIGNAL_ENGINE_VERSION = 'balanced-v1' as const

const FIVE_MINUTES_MS = 5 * 60 * 1000
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const MIN_TURNOVER_DELTA = 3_000_000
const EPSILON = 1e-9

const SCORE = {
	turnover: { normal: 30, strong: 40 },
	price: { normal: 25, extreme: 50 },
	range: { normal: 25, strong: 35 },
	attention: 55,
	alignment: 10,
} as const

type SignalSession = 'am' | 'pm'
export type FlowBaselineKind = 'historical-slot' | 'intraday' | 'unavailable'

export interface SignalSnapshot {
	bucketAt: string
	marketAt: string
	price: number
	previousClose: number | null
	turnover: number | null
	sourceId: string
}

export interface SignalFlowBaseline {
	kind: FlowBaselineKind
	value: number | null
	sampleCount: number
}

export interface SignalCandidate {
	signalType: MarketSignalType
	direction: MarketSignalDirection
	severity: MarketSignalSeverity
	score: number
	title: string
	bucketAt: string
	marketAt: string
	sourceId: string
	engineVersion: typeof BALANCED_SIGNAL_ENGINE_VERSION
	evidence: MarketSignalEvidence
}

export interface SignalEvaluation {
	baseline: SignalFlowBaseline
	candidate: SignalCandidate | null
	evidence: MarketSignalEvidence
	priceMove5mPct: number | null
	priceMove10mPct: number | null
	current: SignalSnapshot | null
}

interface ShanghaiParts {
	date: string
	minuteOfDay: number
	weekday: number
}

interface RangeBreak {
	direction: Exclude<MarketSignalDirection, 'neutral'>
	strength: 'normal' | 'strong'
	high: number
	low: number
}

interface AttentionCross {
	direction: Exclude<MarketSignalDirection, 'neutral'>
}

function finiteTimestamp(value: string) {
	const parsed = Date.parse(value)
	return Number.isFinite(parsed) ? parsed : null
}

function shanghaiParts(value: string): ShanghaiParts | null {
	const parsed = finiteTimestamp(value)
	if (parsed === null)
		return null
	const date = new Date(parsed + SHANGHAI_OFFSET_MS)
	const year = date.getUTCFullYear()
	const month = String(date.getUTCMonth() + 1).padStart(2, '0')
	const day = String(date.getUTCDate()).padStart(2, '0')
	return {
		date: `${year}-${month}-${day}`,
		minuteOfDay: date.getUTCHours() * 60 + date.getUTCMinutes(),
		weekday: date.getUTCDay(),
	}
}

function sessionFor(parts: ShanghaiParts | null): SignalSession | null {
	if (!parts || parts.weekday === 0 || parts.weekday === 6)
		return null
	if (parts.minuteOfDay >= 9 * 60 + 30 && parts.minuteOfDay <= 11 * 60 + 30)
		return 'am'
	if (parts.minuteOfDay >= 13 * 60 && parts.minuteOfDay <= 15 * 60)
		return 'pm'
	return null
}

function isAdjacent(previous: SignalSnapshot, current: SignalSnapshot) {
	const previousBucket = finiteTimestamp(previous.bucketAt)
	const currentBucket = finiteTimestamp(current.bucketAt)
	const previousMarket = finiteTimestamp(previous.marketAt)
	const currentMarket = finiteTimestamp(current.marketAt)
	if (previousBucket === null || currentBucket === null || previousMarket === null || currentMarket === null)
		return false
	if (currentBucket - previousBucket !== FIVE_MINUTES_MS || currentMarket <= previousMarket)
		return false
	const previousParts = shanghaiParts(previous.bucketAt)
	const currentParts = shanghaiParts(current.bucketAt)
	if (!previousParts || !currentParts || previousParts.date !== currentParts.date)
		return false
	const previousSession = sessionFor(previousParts)
	return previousSession !== null && previousSession === sessionFor(currentParts)
}

export function computeTurnoverInterval(previous: SignalSnapshot, current: SignalSnapshot): { delta: number } | null {
	if (!isAdjacent(previous, current))
		return null
	if (previous.turnover === null || current.turnover === null)
		return null
	if (!Number.isFinite(previous.turnover) || !Number.isFinite(current.turnover))
		return null
	const delta = current.turnover - previous.turnover
	if (delta < 0)
		return null
	return { delta }
}

function percentChange(previous: number, current: number) {
	if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0 || current <= 0)
		return null
	return ((current - previous) / previous) * 100
}

function median(values: number[]) {
	if (!values.length)
		return null
	const sorted = [...values].sort((left, right) => left - right)
	const middle = Math.floor(sorted.length / 2)
	if (sorted.length % 2)
		return sorted[middle]!
	return (sorted[middle - 1]! + sorted[middle]!) / 2
}

function atLeast(value: number | null, threshold: number) {
	return value !== null && value + EPSILON >= threshold
}

function atMost(value: number | null, threshold: number) {
	return value !== null && value - EPSILON <= threshold
}

function orderedSnapshots(values: SignalSnapshot[]) {
	const byBucket = new Map<number, SignalSnapshot>()
	for (const value of values) {
		const bucket = finiteTimestamp(value.bucketAt)
		const market = finiteTimestamp(value.marketAt)
		if (bucket === null || market === null || !Number.isFinite(value.price) || value.price <= 0)
			continue
		const existing = byBucket.get(bucket)
		if (!existing || Date.parse(existing.marketAt) < market)
			byBucket.set(bucket, value)
	}
	return [...byBucket.entries()].sort((left, right) => left[0] - right[0])
}

function previousAt(byBucket: Map<number, SignalSnapshot>, current: SignalSnapshot, steps: number) {
	const currentBucket = finiteTimestamp(current.bucketAt)
	if (currentBucket === null)
		return null
	return byBucket.get(currentBucket - steps * FIVE_MINUTES_MS) ?? null
}

function priceMoves(byBucket: Map<number, SignalSnapshot>, current: SignalSnapshot) {
	const previous = previousAt(byBucket, current, 1)
	const beforePrevious = previousAt(byBucket, current, 2)
	const priceMove5mPct = previous && isAdjacent(previous, current)
		? percentChange(previous.price, current.price)
		: null
	const priceMove10mPct = previous && beforePrevious
		&& isAdjacent(beforePrevious, previous) && isAdjacent(previous, current)
		? percentChange(beforePrevious.price, current.price)
		: null
	return { previous, beforePrevious, priceMove5mPct, priceMove10mPct }
}

function historicalBaseline(ordered: Array<[number, SignalSnapshot]>, byBucket: Map<number, SignalSnapshot>, current: SignalSnapshot): SignalFlowBaseline | null {
	const currentParts = shanghaiParts(current.bucketAt)
	if (!currentParts || !sessionFor(currentParts))
		return null
	const seenDates = new Set<string>()
	const deltas: number[] = []
	for (let index = ordered.length - 1; index >= 0 && seenDates.size < 5; index--) {
		const candidate = ordered[index]![1]
		const parts = shanghaiParts(candidate.bucketAt)
		if (!parts || parts.date === currentParts.date || parts.minuteOfDay !== currentParts.minuteOfDay || seenDates.has(parts.date))
			continue
		seenDates.add(parts.date)
		const previous = previousAt(byBucket, candidate, 1)
		if (!previous)
			continue
		const interval = computeTurnoverInterval(previous, candidate)
		if (interval)
			deltas.push(interval.delta)
	}
	if (deltas.length < 3)
		return null
	return { kind: 'historical-slot', value: median(deltas), sampleCount: deltas.length }
}

function intradayBaseline(ordered: Array<[number, SignalSnapshot]>, byBucket: Map<number, SignalSnapshot>, current: SignalSnapshot): SignalFlowBaseline | null {
	const currentBucket = finiteTimestamp(current.bucketAt)
	const currentParts = shanghaiParts(current.bucketAt)
	const currentSession = sessionFor(currentParts)
	if (currentBucket === null || !currentParts || !currentSession)
		return null
	const deltas: number[] = []
	for (const [bucket, candidate] of ordered) {
		if (bucket >= currentBucket)
			break
		const parts = shanghaiParts(candidate.bucketAt)
		if (!parts || parts.date !== currentParts.date || sessionFor(parts) !== currentSession)
			continue
		const previous = previousAt(byBucket, candidate, 1)
		if (!previous)
			continue
		const interval = computeTurnoverInterval(previous, candidate)
		if (interval)
			deltas.push(interval.delta)
	}
	const latest = deltas.slice(-6)
	if (latest.length < 4)
		return null
	return { kind: 'intraday', value: median(latest), sampleCount: latest.length }
}

function flowBaseline(ordered: Array<[number, SignalSnapshot]>, byBucket: Map<number, SignalSnapshot>, current: SignalSnapshot): SignalFlowBaseline {
	return historicalBaseline(ordered, byBucket, current)
		?? intradayBaseline(ordered, byBucket, current)
		?? { kind: 'unavailable', value: null, sampleCount: 0 }
}

function rangeBreak(byBucket: Map<number, SignalSnapshot>, current: SignalSnapshot): RangeBreak | null {
	const previous: SignalSnapshot[] = []
	let right = current
	for (let steps = 1; steps <= 6; steps++) {
		const item = previousAt(byBucket, current, steps)
		if (!item || !isAdjacent(item, right))
			return null
		previous.push(item)
		right = item
	}
	const prices = previous.map(item => item.price)
	const high = Math.max(...prices)
	const low = Math.min(...prices)
	if (current.price + EPSILON >= high * 1.005)
		return { direction: 'up', strength: 'strong', high, low }
	if (current.price + EPSILON >= high * 1.002)
		return { direction: 'up', strength: 'normal', high, low }
	if (current.price - EPSILON <= low * 0.995)
		return { direction: 'down', strength: 'strong', high, low }
	if (current.price - EPSILON <= low * 0.998)
		return { direction: 'down', strength: 'normal', high, low }
	return null
}

function attentionCross(watchlist: WatchlistItem, current: SignalSnapshot, previous: SignalSnapshot | null): AttentionCross | null {
	const attention = watchlist.attentionPrice
	if (attention === null || !Number.isFinite(attention) || attention <= 0)
		return null
	let previousPrice: number | null = previous && isAdjacent(previous, current) ? previous.price : null
	const parts = shanghaiParts(current.bucketAt)
	if (previousPrice === null && parts?.minuteOfDay === 9 * 60 + 30 && sessionFor(parts) === 'am')
		previousPrice = current.previousClose
	if (previousPrice === null || !Number.isFinite(previousPrice) || previousPrice <= 0)
		return null
	if (previousPrice < attention && current.price >= attention)
		return { direction: 'up' }
	if (previousPrice > attention && current.price <= attention)
		return { direction: 'down' }
	return null
}

function priceDirection(priceMove5mPct: number | null): MarketSignalDirection {
	if (priceMove5mPct !== null && atLeast(priceMove5mPct, 0.3))
		return 'up'
	if (priceMove5mPct !== null && atMost(priceMove5mPct, -0.3))
		return 'down'
	return 'neutral'
}

function signalTypeFor(
	attention: AttentionCross | null,
	range: RangeBreak | null,
	turnoverSurge: boolean,
	extremePrice: boolean,
	direction: MarketSignalDirection,
): MarketSignalType | null {
	if (attention)
		return attention.direction === 'up' ? 'attention_cross_up' : 'attention_cross_down'
	if (range)
		return range.direction === 'up' ? 'breakout_up' : 'breakdown_down'
	if (turnoverSurge && direction !== 'neutral')
		return direction === 'up' ? 'momentum_up' : 'momentum_down'
	if (extremePrice && direction !== 'neutral')
		return direction === 'up' ? 'price_spike_up' : 'price_spike_down'
	return null
}

function titleFor(type: MarketSignalType) {
	const titles: Record<MarketSignalType, string> = {
		momentum_up: '放量上冲',
		momentum_down: '放量回撤',
		breakout_up: '区间上破观察',
		breakdown_down: '区间下破观察',
		attention_cross_up: '上穿关注价',
		attention_cross_down: '下穿关注价',
		price_spike_up: '快速价格上行',
		price_spike_down: '快速价格下行',
	}
	return titles[type]
}

export function evaluateMarketSignal(input: { watchlist: WatchlistItem, snapshots: SignalSnapshot[] }): SignalEvaluation {
	const ordered = orderedSnapshots(input.snapshots)
	const byBucket = new Map(ordered)
	const current = ordered.at(-1)?.[1] ?? null
	const emptyEvidence: MarketSignalEvidence = {
		factors: [],
		priceMove5mPct: null,
		priceMove10mPct: null,
		flowBasis: null,
		flowDelta: null,
		flowRatio: null,
		rangeHigh: null,
		rangeLow: null,
		attentionPrice: input.watchlist.attentionPrice,
	}
	if (!current || !input.watchlist.enabled || !sessionFor(shanghaiParts(current.bucketAt))) {
		return {
			baseline: { kind: 'unavailable', value: null, sampleCount: 0 },
			candidate: null,
			evidence: emptyEvidence,
			priceMove5mPct: null,
			priceMove10mPct: null,
			current,
		}
	}

	const moves = priceMoves(byBucket, current)
	const baseline = flowBaseline(ordered, byBucket, current)
	const currentFlow = moves.previous ? computeTurnoverInterval(moves.previous, current) : null
	const flowRatio = currentFlow && baseline.value !== null && baseline.value > 0
		? currentFlow.delta / baseline.value
		: null
	const turnoverNormal = currentFlow !== null
		&& currentFlow.delta + EPSILON >= MIN_TURNOVER_DELTA
		&& atLeast(flowRatio, 2)
	const turnoverStrong = turnoverNormal && atLeast(flowRatio, 3)

	const absMove5 = moves.priceMove5mPct === null ? null : Math.abs(moves.priceMove5mPct)
	const absMove10 = moves.priceMove10mPct === null ? null : Math.abs(moves.priceMove10mPct)
	const priceExtreme = atLeast(absMove5, 1.8)
	const priceNormal = priceExtreme || atLeast(absMove5, 1) || atLeast(absMove10, 1.5)
	const priceDir = priceDirection(moves.priceMove5mPct)
	const range = rangeBreak(byBucket, current)
	const attention = attentionCross(input.watchlist, current, moves.previous)
	const alignment = turnoverNormal && priceDir !== 'neutral'
		&& (priceNormal || range?.direction === priceDir)

	let score = 0
	const factors: MarketSignalFactor[] = []
	if (turnoverNormal) {
		score += turnoverStrong ? SCORE.turnover.strong : SCORE.turnover.normal
		factors.push('TURNOVER_SURGE')
	}
	if (priceNormal) {
		score += priceExtreme ? SCORE.price.extreme : SCORE.price.normal
		factors.push('PRICE_ACCELERATION')
	}
	if (range) {
		score += range.strength === 'strong' ? SCORE.range.strong : SCORE.range.normal
		factors.push('RANGE_BREAK')
	}
	if (attention) {
		score += SCORE.attention
		factors.push('ATTENTION_CROSS')
	}
	if (alignment) {
		score += SCORE.alignment
		factors.push('DIRECTION_ALIGNMENT')
	}
	score = Math.min(100, score)

	const direction: MarketSignalDirection = attention?.direction ?? range?.direction ?? priceDir
	const signalType = score >= 50
		? signalTypeFor(attention, range, turnoverNormal, priceExtreme, direction)
		: null
	const evidence: MarketSignalEvidence = {
		factors,
		priceMove5mPct: moves.priceMove5mPct,
		priceMove10mPct: moves.priceMove10mPct,
		flowBasis: flowRatio !== null ? 'turnover' : null,
		flowDelta: currentFlow?.delta ?? null,
		flowRatio,
		rangeHigh: range?.high ?? null,
		rangeLow: range?.low ?? null,
		attentionPrice: input.watchlist.attentionPrice,
	}
	if (!signalType) {
		return {
			baseline,
			candidate: null,
			evidence,
			priceMove5mPct: moves.priceMove5mPct,
			priceMove10mPct: moves.priceMove10mPct,
			current,
		}
	}
	const severity: MarketSignalSeverity = score >= 70 ? 'strong' : 'watch'
	return {
		baseline,
		candidate: {
			signalType,
			direction,
			severity,
			score,
			title: titleFor(signalType),
			bucketAt: current.bucketAt,
			marketAt: current.marketAt,
			sourceId: current.sourceId,
			engineVersion: BALANCED_SIGNAL_ENGINE_VERSION,
			evidence,
		},
		evidence,
		priceMove5mPct: moves.priceMove5mPct,
		priceMove10mPct: moves.priceMove10mPct,
		current,
	}
}
