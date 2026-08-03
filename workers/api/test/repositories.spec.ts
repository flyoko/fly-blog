import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withIdempotency } from '../src/lib/idempotency'
import { AuditRepository } from '../src/repositories/audit-repository'
import { MediaRepository } from '../src/repositories/media-repository'
import { PublishRepository } from '../src/repositories/publish-repository'
import { SessionRepository } from '../src/repositories/session-repository'

const testEnv = env as typeof env & {
	DB: D1Database
	TEST_MIGRATIONS: D1Migration[]
}

beforeAll(async () => {
	await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS)
})

beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM media_references'),
		testEnv.DB.prepare('DELETE FROM media_objects'),
		testEnv.DB.prepare('DELETE FROM publish_runs'),
		testEnv.DB.prepare('DELETE FROM idempotency_keys'),
		testEnv.DB.prepare('DELETE FROM audit_logs'),
		testEnv.DB.prepare('DELETE FROM admin_sessions'),
	])
})

describe('session repository', () => {
	it('creates, finds, expires, touches, and revokes a session', async () => {
		const repository = new SessionRepository(testEnv.DB)
		await repository.createSession({
			idHash: 'session-hash',
			githubUserId: '42',
			githubLogin: 'flyoko',
			avatarUrl: 'https://example.test/avatar.png',
			csrfHash: 'csrf-hash',
			createdAt: '2026-08-03T00:00:00.000Z',
			lastSeenAt: '2026-08-03T00:00:00.000Z',
			expiresAt: '2026-08-03T12:00:00.000Z',
		})

		const active = await repository.findActiveSession('session-hash', '2026-08-03T01:00:00.000Z')
		expect(active).toMatchObject({ githubLogin: 'flyoko', csrfHash: 'csrf-hash' })
		expect(await repository.findActiveSession('session-hash', '2026-08-03T13:00:00.000Z')).toBeNull()

		await repository.touchSession('session-hash', '2026-08-03T02:00:00.000Z', '2026-08-03T14:00:00.000Z')
		expect((await repository.findActiveSession('session-hash', '2026-08-03T13:00:00.000Z'))?.lastSeenAt)
			.toBe('2026-08-03T02:00:00.000Z')

		await repository.revokeSession('session-hash', '2026-08-03T03:00:00.000Z')
		expect(await repository.findActiveSession('session-hash', '2026-08-03T03:01:00.000Z')).toBeNull()
	})
})

describe('audit repository', () => {
	it('writes safe metadata and rejects secret-like keys recursively', async () => {
		const repository = new AuditRepository(testEnv.DB)
		await repository.writeAudit({
			id: 'audit-1',
			actorId: '42',
			actorLogin: 'flyoko',
			action: 'article.publish',
			targetType: 'article',
			targetId: 'welcome',
			result: 'success',
			requestId: 'request-1',
			metadata: { path: 'content/posts/2026/welcome.md' },
			createdAt: '2026-08-03T00:00:00.000Z',
		})
		const row = await testEnv.DB.prepare('SELECT metadata_json FROM audit_logs WHERE id = ?')
			.bind('audit-1')
			.first<{ metadata_json: string }>()
		expect(JSON.parse(row!.metadata_json)).toEqual({ path: 'content/posts/2026/welcome.md' })

		await expect(repository.writeAudit({
			id: 'audit-2',
			action: 'auth.callback',
			targetType: 'session',
			result: 'failure',
			requestId: 'request-2',
			metadata: { nested: { authorization: 'Bearer value' } },
			createdAt: '2026-08-03T00:00:00.000Z',
		})).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})
})

describe('media repository', () => {
	it('allows only active-to-trash-to-restore-or-delete transitions', async () => {
		const repository = new MediaRepository(testEnv.DB)
		await repository.createMedia({
			id: 'media-1',
			objectKey: 'articles/2026/image.webp',
			originalName: 'image.webp',
			purpose: 'article',
			mimeType: 'image/webp',
			sizeBytes: 12,
			sha256: 'a'.repeat(64),
			publicUrl: 'https://media.example.test/articles/2026/image.webp',
			createdAt: '2026-08-03T00:00:00.000Z',
		})
		await repository.trashMedia('media-1', '2026-08-03T01:00:00.000Z')
		expect((await repository.findMedia('media-1'))?.status).toBe('trashed')
		await repository.restoreMedia('media-1')
		expect((await repository.findMedia('media-1'))?.status).toBe('active')
		await expect(repository.restoreMedia('media-1')).rejects.toMatchObject({ code: 'CONFLICT' })
		await repository.trashMedia('media-1', '2026-08-03T02:00:00.000Z')
		await repository.deleteMedia('media-1', '2026-08-03T03:00:00.000Z')
		expect((await repository.findMedia('media-1'))?.status).toBe('deleted')
	})
})

describe('publish repository', () => {
	it('updates a run without changing its id or created timestamp', async () => {
		const repository = new PublishRepository(testEnv.DB)
		await repository.createRun({
			id: 'publish-1',
			kind: 'direct',
			status: 'created',
			repositoryRef: 'setup/personalize',
			createdAt: '2026-08-03T00:00:00.000Z',
		})
		await repository.updateRun('publish-1', {
			status: 'commit_created',
			commitSha: 'abc123',
			updatedAt: '2026-08-03T01:00:00.000Z',
		})
		const row = await repository.findRun('publish-1')
		expect(row).toMatchObject({
			id: 'publish-1',
			createdAt: '2026-08-03T00:00:00.000Z',
			updatedAt: '2026-08-03T01:00:00.000Z',
			commitSha: 'abc123',
		})
	})
})

describe('idempotency', () => {
	it('serializes concurrent claims without leaking database constraint errors', async () => {
		let executions = 0
		const request = () => withIdempotency({
			db: testEnv.DB,
			key: 'concurrent-publish-1',
			scope: 'article.publish',
			requestBody: { title: 'Concurrent' },
			execute: async () => {
				executions++
				await new Promise(resolve => setTimeout(resolve, 10))
				return { status: 201, body: { id: 'article-concurrent' } }
			},
		})

		const settled = await Promise.allSettled([request(), request(), request()])
		expect(executions).toBe(1)
		expect(settled.some(result => result.status === 'fulfilled')).toBe(true)
		for (const result of settled) {
			if (result.status === 'rejected')
				expect(result.reason).toMatchObject({ code: 'CONFLICT', status: 409 })
		}
	})

	it('replays identical requests and rejects a reused key with different input', async () => {
		let calls = 0
		const first = await withIdempotency({
			db: testEnv.DB,
			key: 'article-publish-1',
			scope: 'article.publish',
			requestBody: { title: 'Hello' },
			execute: async () => {
				calls++
				return { status: 201, body: { id: 'article-1' } }
			},
		})
		const replay = await withIdempotency({
			db: testEnv.DB,
			key: 'article-publish-1',
			scope: 'article.publish',
			requestBody: { title: 'Hello' },
			execute: async () => {
				calls++
				return { status: 201, body: { id: 'article-2' } }
			},
		})
		expect(first.replayed).toBe(false)
		expect(replay).toEqual({ status: 201, body: { id: 'article-1' }, replayed: true })
		expect(calls).toBe(1)

		await expect(withIdempotency({
			db: testEnv.DB,
			key: 'article-publish-1',
			scope: 'article.publish',
			requestBody: { title: 'Different' },
			execute: async () => ({ status: 201, body: { id: 'article-3' } }),
		})).rejects.toMatchObject({ code: 'CONFLICT' })
	})
})
