import type { Env } from './env'
import { AnalyticsService } from './features/analytics/service'
import { FinanceFlashService } from './features/finance/service'
import { FuturesPositionService } from './features/market/futures-position-service'
import { MarketService } from './features/market/service'
import { MarketSignalService } from './features/market/signal-service'
import { WatchlistService } from './features/market/watchlist-service'
import { MomentBackupService } from './features/moment-backups/service'
import { NewsService } from './features/news/service'

export type ScheduledJob = 'analytics-maintenance' | 'citic-futures-sync' | 'content-maintenance' | 'finance-sync' | 'market-sync' | 'market-watchlist-sync' | 'news-sync' | 'moment-backup'

export interface ScheduledTaskMessage {
	version: 1
	job: ScheduledJob
	cron: string
	scheduledAt: string
}

export interface ScheduledTaskServices {
	syncNews: () => Promise<unknown>
	syncFinance: () => Promise<unknown>
	syncCiticFutures?: (scheduledAt: string) => Promise<unknown>
	syncMarket: (scheduledAt: string) => Promise<unknown>
	syncWatchlistMarket: (scheduledAt: string) => Promise<unknown>
	backupMoments: () => Promise<unknown>
	maintainAnalytics: () => Promise<unknown>
	maintainContent: () => Promise<unknown>
}

export function scheduledJobsFor(cron: string): ScheduledJob[] {
	switch (cron) {
		case '*/5 * * * *':
			return ['news-sync', 'finance-sync', 'market-sync', 'market-watchlist-sync']
		case '17 19 * * *':
			return ['moment-backup', 'news-sync', 'finance-sync']
		case '31 19 * * *':
			return ['analytics-maintenance', 'content-maintenance']
		case '30 9 * * 1-5':
			return ['citic-futures-sync']
		default:
			return []
	}
}

const CITIC_FUTURES_RETRY_SLOTS_UTC = new Set(['08:10', '08:30', '09:00'])

function shouldEnqueueCiticFuturesFromFiveMinuteCron(cron: string, scheduledTime: number): boolean {
	if (cron !== '*/5 * * * *')
		return false
	const scheduledAt = new Date(scheduledTime)
	if (!Number.isFinite(scheduledAt.getTime()))
		return false
	const weekday = scheduledAt.getUTCDay()
	if (weekday < 1 || weekday > 5)
		return false
	const slot = `${String(scheduledAt.getUTCHours()).padStart(2, '0')}:${String(scheduledAt.getUTCMinutes()).padStart(2, '0')}`
	return CITIC_FUTURES_RETRY_SLOTS_UTC.has(slot)
}

export function scheduledMessagesFor(cron: string, scheduledTime: number): ScheduledTaskMessage[] {
	const scheduledAt = new Date(scheduledTime).toISOString()
	const jobs = scheduledJobsFor(cron)
	if (shouldEnqueueCiticFuturesFromFiveMinuteCron(cron, scheduledTime))
		jobs.push('citic-futures-sync')
	return jobs.map(job => ({ version: 1, job, cron, scheduledAt }))
}

export async function enqueueScheduledTask(cron: string, scheduledTime: number, env: Env): Promise<number> {
	const messages = scheduledMessagesFor(cron, scheduledTime)
	if (!messages.length)
		return 0
	await env.CONTENT_SYNC_QUEUE.sendBatch(messages.map(body => ({ body, contentType: 'json' })))
	return messages.length
}

function defaultServices(env: Env): ScheduledTaskServices {
	return {
		syncNews: () => new NewsService(env).sync(),
		syncFinance: () => new FinanceFlashService(env).syncAll(),
		syncCiticFutures: scheduledAt => new FuturesPositionService(env).syncScheduled(scheduledAt),
		syncMarket: scheduledAt => new MarketService(env).syncScheduled(scheduledAt),
		syncWatchlistMarket: scheduledAt => new WatchlistService(env).syncScheduled(scheduledAt),
		backupMoments: () => new MomentBackupService(env).backup(),
		maintainAnalytics: () => new AnalyticsService(env).maintain(),
		maintainContent: async () => {
			const [news, finance, marketSignals] = await Promise.all([
				new NewsService(env).cleanupRetention(),
				new FinanceFlashService(env).cleanupRetention(),
				new MarketSignalService(env).cleanupRetention(),
			])
			return { news, finance, marketSignals }
		},
	}
}

export async function runScheduledJob(
	message: ScheduledTaskMessage,
	env: Env,
	services: ScheduledTaskServices = defaultServices(env),
): Promise<void> {
	const syncCiticFutures = () => {
		if (!services.syncCiticFutures)
			throw new Error('Citic futures sync service is unavailable')
		return services.syncCiticFutures(message.scheduledAt)
	}
	const runners: Record<ScheduledJob, () => Promise<unknown>> = {
		'news-sync': services.syncNews,
		'finance-sync': services.syncFinance,
		'citic-futures-sync': syncCiticFutures,
		'market-sync': () => services.syncMarket(message.scheduledAt),
		'market-watchlist-sync': () => services.syncWatchlistMarket(message.scheduledAt),
		'moment-backup': services.backupMoments,
		'analytics-maintenance': services.maintainAnalytics,
		'content-maintenance': services.maintainContent,
	}
	const runner = runners[message.job]
	if (!runner)
		throw new Error(`Unknown scheduled job: ${String(message.job)}`)
	await runner()
}

export async function processScheduledBatch(
	batch: MessageBatch<ScheduledTaskMessage>,
	env: Env,
): Promise<void> {
	for (const message of batch.messages) {
		const startedAt = Date.now()
		try {
			await runScheduledJob(message.body, env)
		}
		catch (error) {
			console.error(JSON.stringify({
				event: 'scheduled-job.failed',
				job: message.body?.job,
				cron: message.body?.cron,
				scheduledAt: message.body?.scheduledAt,
				durationMs: Date.now() - startedAt,
				attempts: message.attempts,
				error: error instanceof Error ? error.message : String(error),
			}))
			throw error
		}
	}
}
