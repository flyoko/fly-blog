import type {
	MarketObservabilityReport,
	MarketObservationCapability,
	MarketObservationMetric,
	MarketObservationStatus,
} from '../../../../../shared/market'
import type { Env } from '../../env'
import {
	CHINA_A_SHARE_CALENDAR_VERSION,
	chinaAShareRecentCompletedTradingDates,
	shanghaiDateKey,
} from '../../../../../shared/market-calendar'
import { isChinaMarketSyncWindow, MARKET_SYNC_INTERVAL_MINUTES, MARKET_SYNC_SLOTS_PER_TRADING_DAY, shanghaiParts } from './contracts'

const CAPABILITIES: MarketObservationCapability[] = [
	'indices',
	'breadth',
	'sector-industry',
	'sector-concept',
	'watchlist-sync',
]

const TARGET_BATCH_SUCCESS_RATE: Partial<Record<MarketObservationCapability, number>> = {
	'indices': 0.99,
	'sector-industry': 0.98,
	'sector-concept': 0.98,
}

interface ObservationRow {
	trade_date: string
	capability: MarketObservationCapability
	status: MarketObservationStatus
	item_count: number
	expected_item_count: number | null
	missing_count: number
	latency_ms: number | null
	endpoint: string | null
	scheduled_at: string
}

export interface MarketSourceObservationInput {
	capability: MarketObservationCapability
	sourceId: string
	status: MarketObservationStatus
	itemCount: number
	expectedItemCount: number | null
	missingCount: number
	latencyMs: number | null
	endpoint: string | null
	scheduledAt: string
	observedAt?: string
}

function boundedNonNegative(value: number | null | undefined): number | null {
	if (value === null || value === undefined || !Number.isFinite(value))
		return null
	return Math.max(0, Math.trunc(value))
}

export async function recordMarketSourceObservation(env: Env, input: MarketSourceObservationInput): Promise<void> {
	const scheduledMs = Date.parse(input.scheduledAt)
	const observedAt = input.observedAt ?? new Date().toISOString()
	const tradeDate = shanghaiDateKey(input.scheduledAt)
	const scheduledDate = new Date(scheduledMs)
	const scheduledMinute = Number.isFinite(scheduledMs) ? shanghaiParts(scheduledDate).minutes : -1
	if (!Number.isFinite(scheduledMs) || !tradeDate || !isChinaMarketSyncWindow(scheduledDate) || scheduledMinute % MARKET_SYNC_INTERVAL_MINUTES !== 0)
		throw new Error('Market observation scheduledAt is not a valid market cron slot')
	const itemCount = boundedNonNegative(input.itemCount) ?? 0
	const expectedItemCount = boundedNonNegative(input.expectedItemCount)
	const missingCount = boundedNonNegative(input.missingCount) ?? 0
	const latencyMs = boundedNonNegative(input.latencyMs)
	await env.DB.prepare(`
		INSERT INTO market_source_observation (
			trade_date, capability, source_id, status, item_count, expected_item_count,
			missing_count, latency_ms, endpoint, scheduled_at, observed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(capability, scheduled_at) DO UPDATE SET
			trade_date = excluded.trade_date,
			source_id = excluded.source_id,
			status = excluded.status,
			item_count = excluded.item_count,
			expected_item_count = excluded.expected_item_count,
			missing_count = excluded.missing_count,
			latency_ms = excluded.latency_ms,
			endpoint = excluded.endpoint,
			observed_at = excluded.observed_at
	`).bind(
		tradeDate,
		input.capability,
		input.sourceId.slice(0, 120),
		input.status,
		itemCount,
		expectedItemCount,
		missingCount,
		latencyMs,
		input.endpoint?.slice(0, 500) ?? null,
		input.scheduledAt,
		observedAt,
	).run()
}

function percentile(values: number[], percentileValue: number): number | null {
	if (!values.length)
		return null
	const sorted = values.slice().sort((left, right) => left - right)
	const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)
	return sorted[index] ?? null
}

function rate(numerator: number, denominator: number): number | null {
	return denominator > 0 ? numerator / denominator : null
}

function metricFor(
	capability: MarketObservationCapability,
	rows: ObservationRow[],
	expectedTradingDates: string[],
): MarketObservationMetric {
	const successCount = rows.filter(row => row.status === 'success').length
	const partialCount = rows.filter(row => row.status === 'partial').length
	const failureCount = rows.filter(row => row.status === 'failed').length
	const attemptCount = rows.length
	const itemCount = rows.reduce((sum, row) => sum + row.item_count, 0)
	const expectedRows = rows.filter(row => row.expected_item_count !== null)
	const expectedItemCount = expectedRows.length
		? expectedRows.reduce((sum, row) => sum + (row.expected_item_count ?? 0), 0)
		: null
	const missingCount = rows.reduce((sum, row) => sum + row.missing_count, 0)
	const observedDates = new Set(rows.map(row => row.trade_date))
	const fixedSchedule = capability !== 'watchlist-sync'
	const expectedAttemptCount = fixedSchedule ? expectedTradingDates.length * MARKET_SYNC_SLOTS_PER_TRADING_DAY : null
	const complete = fixedSchedule
		? expectedTradingDates.length > 0 && attemptCount === expectedAttemptCount
		: expectedTradingDates.length > 0 && expectedTradingDates.every(date => observedDates.has(date))
	const endpointCounts = new Map<string, number>()
	for (const row of rows) {
		if (row.endpoint)
			endpointCounts.set(row.endpoint, (endpointCounts.get(row.endpoint) || 0) + 1)
	}
	const endpoints = [...endpointCounts.entries()]
		.map(([endpoint, count]) => ({ endpoint, count }))
		.sort((left, right) => right.count - left.count || left.endpoint.localeCompare(right.endpoint))
	const targetBatchSuccessRate = TARGET_BATCH_SUCCESS_RATE[capability] ?? null
	const targetValidReturnRate = null
	const batchSuccessRate = rate(successCount + partialCount, attemptCount)
	const validReturnRate = expectedItemCount === null ? null : rate(itemCount, expectedItemCount)
	let verdict: MarketObservationMetric['verdict'] = 'observe'
	if (targetBatchSuccessRate !== null) {
		if (!complete || batchSuccessRate === null)
			verdict = 'incomplete'
		else
			verdict = batchSuccessRate >= targetBatchSuccessRate ? 'pass' : 'fail'
	}
	return {
		capability,
		attemptCount,
		expectedAttemptCount,
		successCount,
		partialCount,
		failureCount,
		batchSuccessRate,
		itemCount,
		expectedItemCount,
		missingCount,
		validReturnRate,
		p50LatencyMs: percentile(rows.flatMap(row => row.latency_ms === null ? [] : [row.latency_ms]), 0.5),
		p95LatencyMs: percentile(rows.flatMap(row => row.latency_ms === null ? [] : [row.latency_ms]), 0.95),
		observedTradingDays: observedDates.size,
		complete,
		endpoints,
		targetBatchSuccessRate,
		targetValidReturnRate,
		verdict,
	}
}

export class MarketObservabilityService {
	constructor(
		private readonly env: Env,
		private readonly now: () => Date = () => new Date(),
	) {}

	async report(requestedTradingDays = 5): Promise<MarketObservabilityReport> {
		const days = Math.min(20, Math.max(1, Math.trunc(requestedTradingDays)))
		const generatedAt = this.now().toISOString()
		const expectedTradingDates = chinaAShareRecentCompletedTradingDates(this.now(), days)
		let rows: ObservationRow[] = []
		if (expectedTradingDates.length) {
			const placeholders = expectedTradingDates.map(() => '?').join(',')
			const result = await this.env.DB.prepare(`
				SELECT trade_date, capability, status, item_count, expected_item_count,
					missing_count, latency_ms, endpoint, scheduled_at
				FROM market_source_observation
				WHERE trade_date IN (${placeholders})
				ORDER BY scheduled_at ASC, id ASC
			`).bind(...expectedTradingDates).all<ObservationRow>()
			rows = result.results
		}
		const observedTradingDates = [...new Set(rows.map(row => row.trade_date))].sort()
		const metrics = CAPABILITIES.map(capability => metricFor(
			capability,
			rows.filter(row => row.capability === capability),
			expectedTradingDates,
		))
		const fixedScheduleMetrics = metrics.filter(metric => metric.capability !== 'watchlist-sync')
		return {
			calendarVersion: CHINA_A_SHARE_CALENDAR_VERSION,
			generatedAt,
			window: {
				requestedTradingDays: days,
				expectedTradingDates,
				observedTradingDates,
				complete: expectedTradingDates.length === days && fixedScheduleMetrics.every(metric => metric.complete),
			},
			metrics,
		}
	}
}
