import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MomentRepository } from '../src/repositories/moment-repository'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
const now = '2026-08-03T08:00:00.000Z'

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM moment_likes'),
		testEnv.DB.prepare('DELETE FROM moment_media'),
		testEnv.DB.prepare('DELETE FROM moments'),
		testEnv.DB.prepare('DELETE FROM media_objects'),
	])
})

async function addMedia(id = crypto.randomUUID()) {
	await testEnv.DB.prepare(`
		INSERT INTO media_objects (id, object_key, original_name, purpose, mime_type, size_bytes, sha256, status, public_url, created_at)
		VALUES (?, ?, 'moment.png', 'moment', 'image/png', 1, ?, 'active', ?, ?)
	`).bind(id, `moments/${id}.png`, 'a'.repeat(64), `https://blog.test/media/public/moments/${id}.png`, now).run()
	return id
}

function input(overrides: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		content: 'A quiet moment',
		status: 'draft' as const,
		tags: ['生活'],
		city: 'Shanghai',
		music: null,
		mediaIds: [] as string[],
		createdAt: now,
		updatedAt: now,
		publishedAt: null,
		...overrides,
	}
}

describe('moment repository', () => {
	it('creates drafts with active media and hides them from public reads', async () => {
		const mediaId = await addMedia()
		const repository = new MomentRepository(testEnv.DB)
		const created = await repository.create(input({ mediaIds: [mediaId] }))
		expect(created).toMatchObject({ status: 'draft', version: 1, tags: ['生活'] })
		expect(created.media).toHaveLength(1)
		expect(await repository.find(created.id, true)).toBeNull()
		expect((await repository.list({ page: 1, pageSize: 10, publicOnly: true })).total).toBe(0)
	})

	it('rejects unavailable media and stale versions', async () => {
		const repository = new MomentRepository(testEnv.DB)
		await expect(repository.create(input({ mediaIds: [crypto.randomUUID()] }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		const created = await repository.create(input())
		await repository.update(created.id, 1, { ...input({ id: undefined, content: 'updated', updatedAt: '2026-08-03T09:00:00.000Z' }), publishedAt: null } as never)
		await expect(repository.update(created.id, 1, { ...input({ id: undefined }), publishedAt: null } as never)).rejects.toMatchObject({ code: 'CONFLICT' })
	})

	it('publishes, filters, likes idempotently, and withdraws', async () => {
		const repository = new MomentRepository(testEnv.DB)
		const created = await repository.create(input())
		const published = await repository.transition(created.id, 1, 'published', '2026-08-03T10:00:00.000Z')
		expect(published).toMatchObject({ status: 'published', version: 2, publishedAt: '2026-08-03T10:00:00.000Z' })
		expect((await repository.list({ page: 1, pageSize: 10, publicOnly: true, year: 2026, tag: '生活' })).total).toBe(1)
		expect(await repository.like(created.id, 'visitor-a', now)).toEqual({ liked: true, likeCount: 1 })
		expect(await repository.like(created.id, 'visitor-a', now)).toEqual({ liked: true, likeCount: 1 })
		expect((await repository.find(created.id, true, 'visitor-a'))?.liked).toBe(true)
		expect(await repository.unlike(created.id, 'visitor-a')).toEqual({ liked: false, likeCount: 0 })
		const withdrawn = await repository.transition(created.id, 2, 'withdrawn', '2026-08-03T11:00:00.000Z')
		expect(withdrawn.status).toBe('withdrawn')
		expect(await repository.find(created.id, true)).toBeNull()
	})
})
