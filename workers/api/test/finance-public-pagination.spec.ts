import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { publicFinanceRoutes } from '../src/features/finance/routes'
import { failure, normalizeError } from '../src/lib/api-error'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }

function app() {
	const router = new Hono<AppEnvironment>()
	router.use('*', contextMiddleware)
	router.route('/api/finance', publicFinanceRoutes)
	router.onError((error, c) => failure(c, normalizeError(error)))
	return router
}

async function seedPublicItems(count: number) {
	const base = Date.parse('2026-08-26T00:00:00.000Z')
	const statements = Array.from({ length: count }, (_, index) => {
		const publishedAt = new Date(base + index * 1_000).toISOString()
		return testEnv.DB.prepare(`
			INSERT INTO finance_flash_items (
				id, source_id, title, summary, published_at, category, category_label, topic,
				important, importance_origin, importance_score, source_name, source_url,
				fetched_at, updated_at, public_visible
			) VALUES (?, ?, ?, ?, ?, 'market', '市场', '分页测试', 0, 'upstream', NULL, ?, NULL, ?, ?, 1)
		`).bind(
			`cls-telegraph-7x24:${index}`,
			'cls-telegraph-7x24',
			`独立财经事件 ${index}`,
			`财经正文 ${index}`,
			publishedAt,
			'财联社',
			publishedAt,
			publishedAt,
		)
	})
	for (let index = 0; index < statements.length; index += 100)
		await testEnv.DB.batch(statements.slice(index, index + 100))
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM finance_flash_exclusions'),
		testEnv.DB.prepare('DELETE FROM finance_flash_items'),
		testEnv.DB.prepare('DELETE FROM finance_flash_sync_state'),
		testEnv.DB.prepare('DELETE FROM finance_source_settings'),
	])
})

describe('finance public pagination', () => {
	it('paginates the complete public event set instead of truncating to the newest 500 raw rows', async () => {
		await seedPublicItems(620)
		const router = app()
		const first = await router.request('https://blog.test/api/finance/flash?limit=100&offset=0', {}, testEnv)
		const second = await router.request('https://blog.test/api/finance/flash?limit=100&offset=100', {}, testEnv)
		const firstBody = await first.json() as { data: { total: number, items: Array<{ id: string, summary: string | null }> } }
		const secondBody = await second.json() as { data: { total: number, items: Array<{ id: string, summary: string | null }> } }

		expect(first.status).toBe(200)
		expect(second.status).toBe(200)
		expect(firstBody.data.total).toBe(620)
		expect(secondBody.data.total).toBe(620)
		expect(firstBody.data.items).toHaveLength(100)
		expect(secondBody.data.items).toHaveLength(100)
		expect(firstBody.data.items[0]?.summary).toBe('财经正文 619')
		expect(secondBody.data.items[0]?.summary).toBe('财经正文 519')
		expect(secondBody.data.items[0]?.id).not.toBe(firstBody.data.items[0]?.id)
	})

	it('rejects a negative offset', async () => {
		const response = await app().request('https://blog.test/api/finance/flash?offset=-1', {}, testEnv)
		expect(response.status).toBe(400)
	})
})
