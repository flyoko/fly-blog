import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment, Env } from '../src/env'
import type { FinanceFlashAdapter, FinanceFlashSourceItem } from '../src/features/finance/service'
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
		testEnv.DB.prepare('DELETE FROM finance_flash_exclusions'),
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

	it('reports active and disabled finance source health for the admin surface', async () => {
		const service = prototypeService()
		await service.sync()
		const status = await service.status()
		expect(status.prototype).toBe(true)
		expect(status.total).toBe(8)
		expect(status.sources).toEqual(expect.arrayContaining([
			expect.objectContaining({
				source_id: 'prototype-finance-7x24',
				status: 'success',
				item_count: 8,
			}),
			expect.objectContaining({ source_id: 'jin10-mcp-7x24', status: 'disabled', item_count: 0 }),
			expect.objectContaining({ source_id: 'cls-telegraph-7x24', status: 'pending', item_count: 0 }),
		]))
	})

	it('returns unavailable instead of generating prototype news when live cold-start sync fails', async () => {
		const failingAdapter: FinanceFlashAdapter = {
			id: 'live-finance',
			prototype: false,
			fetch: async () => { throw new Error('upstream unavailable') },
		}
		const service = new FinanceFlashService(runtimeEnv(), failingAdapter, new PrototypeFinanceFlashAdapter())
		await service.ensureSeeded()
		const data = await service.list()
		expect(data).toMatchObject({ prototype: false, stale: false, quality: 'unavailable', total: 0 })
		expect(data.items).toEqual([])
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

	it('updates the rolling snapshot incrementally and removes only stale rows', async () => {
		let items: FinanceFlashSourceItem[] = [
			{ id: '1', title: '快讯一', publishedAt: '2026-08-13T14:00:00.000Z', category: 'market' as const, categoryLabel: '市场', important: false, importanceOrigin: 'upstream' as const, sourceName: '测试源' },
			{ id: '2', title: '快讯二', publishedAt: '2026-08-13T14:01:00.000Z', category: 'company' as const, categoryLabel: '公司', important: true, importanceOrigin: 'upstream' as const, sourceName: '测试源' },
		]
		const adapter: FinanceFlashAdapter = {
			id: 'incremental-source',
			prototype: false,
			fetch: async () => items,
		}
		const service = new FinanceFlashService(runtimeEnv(), adapter, new PrototypeFinanceFlashAdapter())
		const first = await service.sync()
		expect(first).toMatchObject({ changedCount: 2, deletedCount: 0, unchangedCount: 0 })
		const firstRows = await testEnv.DB.prepare('SELECT id, updated_at FROM finance_flash_items WHERE source_id = ? ORDER BY id').bind(adapter.id).all<{ id: string, updated_at: string }>()

		const second = await service.sync()
		expect(second).toMatchObject({ changedCount: 0, deletedCount: 0, unchangedCount: 2 })
		const secondRows = await testEnv.DB.prepare('SELECT id, updated_at FROM finance_flash_items WHERE source_id = ? ORDER BY id').bind(adapter.id).all<{ id: string, updated_at: string }>()
		expect(secondRows.results).toEqual(firstRows.results)

		items = [
			{ ...items[1]!, title: '快讯二更新' },
			{ id: '3', title: '快讯三', publishedAt: '2026-08-13T14:02:00.000Z', category: 'macro' as const, categoryLabel: '宏观', important: false, importanceOrigin: 'upstream' as const, sourceName: '测试源' },
		]
		const third = await service.sync()
		expect(third).toMatchObject({ changedCount: 2, deletedCount: 1, unchangedCount: 0 })
		const data = await service.list({ limit: 10 })
		expect(data.items.map(item => item.id)).toEqual(['incremental-source:3', 'incremental-source:2'])
		expect(data.items.find(item => item.id === 'incremental-source:2')?.title).toBe('快讯二更新')
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

	it('keeps hidden finance items excluded across sync and supports restore', async () => {
		const service = prototypeService()
		await service.sync()
		const item = (await service.adminList()).items[0]!

		expect(await service.hideItem(item.id)).toMatchObject({ id: item.id, hidden: true })
		expect((await service.list()).total).toBe(7)
		expect((await service.adminList({ visibility: 'hidden' })).items).toEqual([
			expect.objectContaining({ id: item.id, hidden: true }),
		])

		await service.sync()
		expect((await service.list()).total).toBe(7)

		expect(await service.restoreItem(item.id)).toMatchObject({ id: item.id, hidden: false })
		expect((await service.list()).total).toBe(8)
	})

	it('cleans old orphaned finance exclusion records', async () => {
		const service = prototypeService()
		await service.sync()
		const item = (await service.adminList()).items[0]!
		await service.hideItem(item.id)
		await testEnv.DB.prepare('UPDATE finance_flash_exclusions SET created_at = ? WHERE item_id = ?')
			.bind('2025-01-01T00:00:00.000Z', item.id)
			.run()
		await testEnv.DB.prepare('DELETE FROM finance_flash_items WHERE id = ?').bind(item.id).run()

		expect(await service.cleanupRetention(new Date('2026-08-13T00:00:00.000Z'))).toEqual({ deletedExclusions: 1 })
		expect((await service.adminList({ visibility: 'hidden' })).hiddenTotal).toBe(0)
	})
})

describe('finance flash public api', () => {
	it('keeps stored prototype fallback rows out of the public contract', async () => {
		await seedFallbackSnapshot()
		const response = await publicApp().request('/api/finance/flash?important=true&category=macro', {}, testEnv)
		expect(response.status).toBe(200)
		const body = await response.json() as { data: { total: number, prototype: boolean, stale: boolean, quality: string, items: Array<{ category: string, important: boolean }> } }
		expect(body.data).toMatchObject({ prototype: false, stale: false, quality: 'unavailable', total: 0 })
		expect(body.data.items).toEqual([])
	})

	it('rejects invalid filters', async () => {
		await seedFallbackSnapshot()
		const response = await publicApp().request('/api/finance/flash?category=unknown', {}, testEnv)
		expect(response.status).toBe(400)
	})
})
