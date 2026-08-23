import type { Env } from '../src/env'
import type { ScheduledTaskMessage, ScheduledTaskServices } from '../src/scheduled-tasks'
import { describe, expect, it, vi } from 'vitest'
import { enqueueScheduledTask, runScheduledJob, scheduledJobsFor, scheduledMessagesFor } from '../src/scheduled-tasks'

function services(): ScheduledTaskServices {
	return {
		syncNews: vi.fn().mockResolvedValue(undefined),
		syncFinance: vi.fn().mockResolvedValue(undefined),
		syncMarket: vi.fn().mockResolvedValue(undefined),
		syncWatchlistMarket: vi.fn().mockResolvedValue(undefined),
		backupMoments: vi.fn().mockResolvedValue(undefined),
		maintainAnalytics: vi.fn().mockResolvedValue(undefined),
		maintainContent: vi.fn().mockResolvedValue(undefined),
	}
}

function message(job: ScheduledTaskMessage['job']): ScheduledTaskMessage {
	return {
		version: 1,
		job,
		cron: 'test-cron',
		scheduledAt: '2026-08-16T07:00:00.000Z',
	}
}

describe('scheduled task routing', () => {
	it('maps cron expressions to lightweight queue jobs', () => {
		expect(scheduledJobsFor('*/5 * * * *')).toEqual(['news-sync', 'finance-sync', 'market-sync', 'market-watchlist-sync'])
		expect(scheduledJobsFor('17 19 * * *')).toEqual(['moment-backup', 'news-sync', 'finance-sync'])
		expect(scheduledJobsFor('31 19 * * *')).toEqual(['analytics-maintenance', 'content-maintenance'])
		expect(scheduledJobsFor('1 2 3 4 5')).toEqual([])
	})

	it('serializes the original scheduled time into every queue message', () => {
		expect(scheduledMessagesFor('*/5 * * * *', Date.parse('2026-08-16T07:05:00.000Z'))).toEqual([
			{ version: 1, job: 'news-sync', cron: '*/5 * * * *', scheduledAt: '2026-08-16T07:05:00.000Z' },
			{ version: 1, job: 'finance-sync', cron: '*/5 * * * *', scheduledAt: '2026-08-16T07:05:00.000Z' },
			{ version: 1, job: 'market-sync', cron: '*/5 * * * *', scheduledAt: '2026-08-16T07:05:00.000Z' },
			{ version: 1, job: 'market-watchlist-sync', cron: '*/5 * * * *', scheduledAt: '2026-08-16T07:05:00.000Z' },
		])
	})

	it('enqueues jobs instead of running sync work inside the cron invocation', async () => {
		const sendBatch = vi.fn().mockResolvedValue({ metadata: { metrics: { backlogCount: 2, backlogBytes: 256 } } })
		const env = { CONTENT_SYNC_QUEUE: { sendBatch } } as unknown as Env
		const count = await enqueueScheduledTask('*/5 * * * *', Date.parse('2026-08-16T07:10:00.000Z'), env)
		expect(count).toBe(4)
		expect(sendBatch).toHaveBeenCalledOnce()
		expect(sendBatch).toHaveBeenCalledWith([
			{ body: { version: 1, job: 'news-sync', cron: '*/5 * * * *', scheduledAt: '2026-08-16T07:10:00.000Z' }, contentType: 'json' },
			{ body: { version: 1, job: 'finance-sync', cron: '*/5 * * * *', scheduledAt: '2026-08-16T07:10:00.000Z' }, contentType: 'json' },
			{ body: { version: 1, job: 'market-sync', cron: '*/5 * * * *', scheduledAt: '2026-08-16T07:10:00.000Z' }, contentType: 'json' },
			{ body: { version: 1, job: 'market-watchlist-sync', cron: '*/5 * * * *', scheduledAt: '2026-08-16T07:10:00.000Z' }, contentType: 'json' },
		])
	})

	it('forwards the original cron slot to market sampling services', async () => {
		const mocked = services()
		const scheduledAt = '2026-08-24T02:30:00.000Z'
		await runScheduledJob({ ...message('market-sync'), scheduledAt }, {} as Env, mocked)
		expect(mocked.syncMarket).toHaveBeenCalledWith(scheduledAt)
		expect(mocked.syncWatchlistMarket).not.toHaveBeenCalled()

		const watchlistMocked = services()
		await runScheduledJob({ ...message('market-watchlist-sync'), scheduledAt }, {} as Env, watchlistMocked)
		expect(watchlistMocked.syncWatchlistMarket).toHaveBeenCalledWith(scheduledAt)
		expect(watchlistMocked.syncMarket).not.toHaveBeenCalled()
	})

	it('does not publish anything for an unknown schedule', async () => {
		const sendBatch = vi.fn()
		const env = { CONTENT_SYNC_QUEUE: { sendBatch } } as unknown as Env
		expect(await enqueueScheduledTask('1 2 3 4 5', Date.now(), env)).toBe(0)
		expect(sendBatch).not.toHaveBeenCalled()
	})

	it.each([
		['news-sync', 'syncNews'],
		['finance-sync', 'syncFinance'],
		['market-sync', 'syncMarket'],
		['market-watchlist-sync', 'syncWatchlistMarket'],
		['moment-backup', 'backupMoments'],
		['analytics-maintenance', 'maintainAnalytics'],
		['content-maintenance', 'maintainContent'],
	] as const)('runs only the %s service after queue delivery', async (job, expectedService) => {
		const mocked = services()
		await runScheduledJob(message(job), {} as Env, mocked)
		for (const [name, fn] of Object.entries(mocked)) {
			if (name === expectedService)
				expect(fn).toHaveBeenCalledOnce()
			else
				expect(fn).not.toHaveBeenCalled()
		}
	})
})
