import type { Env } from '../src/env'
import { describe, expect, it, vi } from 'vitest'
import { runScheduledTask, scheduledJobsFor } from '../src/index'

describe('scheduled task routing', () => {
	it('runs only news sync on the five-minute due-source check', async () => {
		const syncNews = vi.fn().mockResolvedValue(undefined)
		const backupMoments = vi.fn().mockResolvedValue(undefined)
		const maintainAnalytics = vi.fn().mockResolvedValue(undefined)
		await runScheduledTask('*/5 * * * *', {} as Env, { syncNews, backupMoments, maintainAnalytics })
		expect(syncNews).toHaveBeenCalledOnce()
		expect(backupMoments).not.toHaveBeenCalled()
		expect(maintainAnalytics).not.toHaveBeenCalled()
	})

	it('keeps the daily moment backup and also checks news', async () => {
		const syncNews = vi.fn().mockResolvedValue(undefined)
		const backupMoments = vi.fn().mockResolvedValue(undefined)
		const maintainAnalytics = vi.fn().mockResolvedValue(undefined)
		await runScheduledTask('17 19 * * *', {} as Env, { syncNews, backupMoments, maintainAnalytics })
		expect(syncNews).toHaveBeenCalledOnce()
		expect(backupMoments).toHaveBeenCalledOnce()
		expect(maintainAnalytics).not.toHaveBeenCalled()
	})

	it('runs only analytics maintenance on the daily retention schedule', async () => {
		expect(scheduledJobsFor('31 19 * * *')).toEqual(['analytics-maintenance'])
		const syncNews = vi.fn().mockResolvedValue(undefined)
		const backupMoments = vi.fn().mockResolvedValue(undefined)
		const maintainAnalytics = vi.fn().mockResolvedValue(undefined)
		await runScheduledTask('31 19 * * *', {} as Env, { syncNews, backupMoments, maintainAnalytics })
		expect(maintainAnalytics).toHaveBeenCalledOnce()
		expect(syncNews).not.toHaveBeenCalled()
		expect(backupMoments).not.toHaveBeenCalled()
	})

	it('ignores unknown schedules safely', async () => {
		expect(scheduledJobsFor('1 2 3 4 5')).toEqual([])
		const syncNews = vi.fn().mockResolvedValue(undefined)
		const backupMoments = vi.fn().mockResolvedValue(undefined)
		const maintainAnalytics = vi.fn().mockResolvedValue(undefined)
		await runScheduledTask('1 2 3 4 5', {} as Env, { syncNews, backupMoments, maintainAnalytics })
		expect(syncNews).not.toHaveBeenCalled()
		expect(backupMoments).not.toHaveBeenCalled()
		expect(maintainAnalytics).not.toHaveBeenCalled()
	})
})
