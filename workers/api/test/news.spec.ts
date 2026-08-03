import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NewsService } from '../src/features/news/service'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}
beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM news_items'),
		testEnv.DB.prepare('DELETE FROM news_briefings'),
		testEnv.DB.prepare('DELETE FROM news_sync_state'),
	])
})

describe('news service', () => {
	it('keeps manual cards in the public snapshot', async () => {
		const service = new NewsService(runtimeEnv())
		await service.addManual({ title: 'A useful link', summary: 'summary', url: 'https://example.com/article', category: '精选' })
		const data = await service.list()
		expect(data.total).toBe(1)
		expect(data.items[0]).toMatchObject({ kind: 'manual', title: 'A useful link', selected: true })
	})
})
