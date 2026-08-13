import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment, Env } from '../src/env'
import type { FinanceFlashAdapter } from '../src/features/finance/service'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { publicFinanceRoutes } from '../src/features/finance/routes'
import { FinanceFlashService, PrototypeFinanceFlashAdapter } from '../src/features/finance/service'
import { failure, normalizeError } from '../src/lib/api-error'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }

function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}

function prototypeService() {
	return new FinanceFlashService(runtimeEnv(), new PrototypeFinanceFlashAdapter())
}

async function seedFallbackSnapshot() {
	await prototypeService().sync()
	const now = new Date().toISOString()
	await testEnv.DB.prepare(`
		INSERT INTO finance_flash_sync_state (source_id, status, item_count, last_success_at, last_error, updated_at)
		VALUES ('wallstreetcn-7x24', 'failed', 0, NULL, 'upstream unavailable', ?)
	`).bind(now).run()
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
		const service = prototypeService()
		expect(await service.sync()).toMatchObject({ status: 'success', itemCount: 8 })
		const data = await service.list()
		expect(data.prototype).toBe(true)
		expect(data.total).toBe(8)
		expect(data.items[0]).toMatchObject({ category: 'company', sourceName: '公告摘要', important: false })
		expect(data.items.map(item => item.publishedAt)).toEqual([...data.items.map(item => item.publishedAt)].sort().reverse())
	})

	it('combines category and important filters', async () => {
		const service = prototypeService()
		await service.sync()
		const data = await service.list({ category: 'company', importantOnly: true })
		expect(data.total).toBe(2)
		expect(data.items).toHaveLength(2)
		expect(data.items.every(item => item.category === 'company' && item.important)).toBe(true)
	})

	it('reports finance source health for the admin surface', async () => {
		const service = prototypeService()
		await service.sync()
		const status = await service.status()
		expect(status.prototype).toBe(true)
		expect(status.total).toBe(8)
		expect(status.sources).toEqual([expect.objectContaining({
			source_id: 'prototype-finance-7x24',
			status: 'success',
			item_count: 8,
		})])
	})

	it('uses prototype data only as a cold-start fallback when live sync fails', async () => {
		const failingAdapter: FinanceFlashAdapter = {
			id: 'live-finance',
			prototype: false,
			fetch: async () => { throw new Error('upstream unavailable') },
		}
		const service = new FinanceFlashService(runtimeEnv(), failingAdapter, new PrototypeFinanceFlashAdapter())
		await service.ensureSeeded()
		const data = await service.list()
		expect(data.prototype).toBe(true)
		expect(data.total).toBe(8)
	})

	it('replaces fallback rows after the live source recovers', async () => {
		await prototypeService().sync()
		const liveAdapter: FinanceFlashAdapter = {
			id: 'live-finance',
			prototype: false,
			fetch: async () => [{
				id: 'live-1',
				title: '实时市场快讯',
				publishedAt: '2026-08-13T14:00:00.000Z',
				category: 'market',
				categoryLabel: '市场',
				important: false,
				importanceOrigin: 'upstream',
				sourceName: '实时来源',
				sourceUrl: 'https://example.com/live-1',
			}],
		}
		const service = new FinanceFlashService(runtimeEnv(), liveAdapter, new PrototypeFinanceFlashAdapter())
		expect(await service.sync()).toMatchObject({ status: 'success', itemCount: 1 })
		const data = await service.list()
		expect(data.prototype).toBe(false)
		expect(data.total).toBe(1)
		expect(data.items[0]?.sourceName).toBe('实时来源')
	})

	it('retains the last successful snapshot when an upstream sync fails', async () => {
		const service = prototypeService()
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
	it('returns the public contract for a stored fallback snapshot', async () => {
		await seedFallbackSnapshot()
		const response = await publicApp().request('/api/finance/flash?important=true&category=macro', {}, testEnv)
		expect(response.status).toBe(200)
		const body = await response.json() as { data: { total: number, prototype: boolean, items: Array<{ category: string, important: boolean }> } }
		expect(body.data.prototype).toBe(true)
		expect(body.data.total).toBe(1)
		expect(body.data.items[0]).toMatchObject({ category: 'macro', important: true })
	})

	it('rejects invalid filters', async () => {
		await seedFallbackSnapshot()
		const response = await publicApp().request('/api/finance/flash?category=unknown', {}, testEnv)
		expect(response.status).toBe(400)
	})
})
