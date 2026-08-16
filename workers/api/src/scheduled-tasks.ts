import type { Env } from './env'
import { AnalyticsService } from './features/analytics/service'
import { FinanceFlashService } from './features/finance/service'
import { MomentBackupService } from './features/moment-backups/service'
import { NewsService } from './features/news/service'

export type ScheduledJob = 'analytics-maintenance' | 'content-maintenance' | 'finance-sync' | 'news-sync' | 'moment-backup'

export interface ScheduledTaskMessage {
	version: 1
	job: ScheduledJob
	cron: string
	scheduledAt: string
}

export interface ScheduledTaskServices {
	syncNews: () => Promise<unknown>
	syncFinance: () => Promise<unknown>
	backupMoments: () => Promise<unknown>
	maintainAnalytics: () => Promise<unknown>
	maintainContent: () => Promise<unknown>
}

export function scheduledJobsFor(cron: string): ScheduledJob[] {
	switch (cron) {
		case '*/5 * * * *':
			return ['news-sync', 'finance-sync']
		case '17 19 * * *':
			return ['moment-backup', 'news-sync', 'finance-sync']
		case '31 19 * * *':
			return ['analytics-maintenance', 'content-maintenance']
		default:
			return []
	}
}

export function scheduledMessagesFor(cron: string, scheduledTime: number): ScheduledTaskMessage[] {
	const scheduledAt = new Date(scheduledTime).toISOString()
	return scheduledJobsFor(cron).map(job => ({ version: 1, job, cron, scheduledAt }))
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
		syncFinance: () => new FinanceFlashService(env).sync(),
		backupMoments: () => new MomentBackupService(env).backup(),
		maintainAnalytics: () => new AnalyticsService(env).maintain(),
		maintainContent: async () => {
			const [news, finance] = await Promise.all([
				new NewsService(env).cleanupRetention(),
				new FinanceFlashService(env).cleanupRetention(),
			])
			return { news, finance }
		},
	}
}

export async function runScheduledJob(
	message: ScheduledTaskMessage,
	env: Env,
	services: ScheduledTaskServices = defaultServices(env),
): Promise<void> {
	const runners: Record<ScheduledJob, () => Promise<unknown>> = {
		'news-sync': services.syncNews,
		'finance-sync': services.syncFinance,
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
