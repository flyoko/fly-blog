import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment, Env } from '../src/env'
import type { FinanceFlashAdapter } from '../src/features/finance/service'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { publicFinanceRoutes } from '../src/features/finance/routes'
import { FinanceFlashService } from '../src/features/finance/service'
import { failure, normalizeError } from '../src/lib/api-error'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }

function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}

function publicApp() {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/finance', publicFinanceRoutes)
	app.onError((error, c) => failure(c, normalizeError(error)))
	return app
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM finance_flash_items'),
		testEnv.DB.prepare('DELETE FROM finance_flash_sync_state'),
	])
})

describe('finance flash service', () => {
	it('syncs prototype items into the dedicated finance domain', async () => {
		const service = new FinanceFlashService(runtimeEnv())
		expect(await service.sync()).toMatchObject({ status: 'success', itemCount: 8 })
		const data = await service.list()
		expect(data.prototype).toBe(true)
		expect(data.total).toBe(8)
		expect(data.items[0]).toMatchObject({ category: 'company', sourceName: '公告摘要', important: false })
		expect(data.items.map(item => item.publishedAt)).toEqual([...data.items.map(item => item.publishedAt)].sort().reverse())
	})

	it('combines category and important filters', async () => {
		const service = new FinanceFlashService(runtimeEnv())
		await service.sync()
		const data = await service.list({ category: 'company', importantOnly: true })
		expect(data.total).toBe(2)
		expect(data.items).toHaveLength(2)
		expect(data.items.every(item => item.category === 'company' && item.important)).toBe(true)
	})

	it('retains the last successful snapshot when an upstream sync fails', async () => {
		const service = new FinanceFlashService(runtimeEnv())
		await service.sync()
		const failingAdapter: FinanceFlashAdapter = {
			id: 'prototype-finance-7x24',
			prototype: false,
			fetch: async () => { throw new Error('upstream unavailable') },
		}
		const failed = await new FinanceFlashService(runtimeEnv(), failingAdapter).sync()
		expect(failed).toMatchObject({ status: 'failed', itemCount: 0 })
		expect((await service.list()).total).toBe(8)
	})
})

describe('finance flash public api', () => {
	it('seeds the prototype source on first request and returns the public contract', async () => {
		const response = await publicApp().request('/api/finance/flash?important=true&category=macro', {}, testEnv)
		expect(response.status).toBe(200)
		const body = await response.json() as { data: { total: number, prototype: boolean, items: Array<{ category: string, important: boolean }> } }
		expect(body.data.prototype).toBe(true)
		expect(body.data.total).toBe(1)
		expect(body.data.items[0]).toMatchObject({ category: 'macro', important: true })
	})

	it('rejects invalid filters', async () => {
		const response = await publicApp().request('/api/finance/flash?category=unknown', {}, testEnv)
		expect(response.status).toBe(400)
	})
})
