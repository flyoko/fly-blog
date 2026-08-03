import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubRepository } from '../src/features/articles/github-repository'
import { MomentBackupService } from '../src/features/moment-backups/service'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}
beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM moment_likes'),
		testEnv.DB.prepare('DELETE FROM moment_media'),
		testEnv.DB.prepare('DELETE FROM moments'),
		testEnv.DB.prepare('DELETE FROM moment_backup_state'),
		testEnv.DB.prepare('DELETE FROM sync_runs'),
		testEnv.DB.prepare('DELETE FROM moment_public_cache_state'),
	])
})

describe('moment backup snapshot', () => {
	it('creates deterministic checksums for unchanged moment data', async () => {
		await testEnv.DB.prepare(`INSERT INTO moments (id, content, status, tags_json, version, created_at, updated_at) VALUES (?, 'hello', 'published', '["生活"]', 1, ?, ?)`)
			.bind(crypto.randomUUID(), '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z')
			.run()
		const service = new MomentBackupService(runtimeEnv())
		const a = await service.buildSnapshot(new Date('2026-08-03T01:00:00.000Z'))
		const b = await service.buildSnapshot(new Date('2026-08-04T01:00:00.000Z'))
		expect(a.checksum).toBe(b.checksum)
		expect(a.exportedAt).not.toBe(b.exportedAt)
		expect(a.moments).toHaveLength(1)
	})

	it('在并发备份下只创建一次 Git commit', async () => {
		await testEnv.DB.prepare(`INSERT INTO moments (id, content, status, tags_json, version, created_at, updated_at) VALUES (?, 'concurrent', 'published', '[]', 1, ?, ?)`)
			.bind(crypto.randomUUID(), '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z')
			.run()
		const commit = vi.spyOn(GitHubRepository.prototype, 'createAtomicCommit').mockImplementation(async () => {
			await new Promise(resolve => setTimeout(resolve, 20))
			return { commitSha: 'commit-once' }
		})
		vi.spyOn(GitHubRepository.prototype, 'getBranchHead').mockResolvedValue('head')
		try {
			const service = new MomentBackupService(runtimeEnv())
			const results = await Promise.all([
				service.backup(new Date('2026-08-03T01:00:00.000Z')),
				service.backup(new Date('2026-08-03T01:00:00.000Z')),
			])
			expect(commit).toHaveBeenCalledOnce()
			expect(results.filter(result => result.changed)).toHaveLength(1)
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('恢复旧时间戳数据时递增独立公开缓存版本', async () => {
		const momentId = crypto.randomUUID()
		await testEnv.DB.prepare(`INSERT INTO moments (id, content, status, tags_json, version, created_at, updated_at) VALUES (?, 'old', 'published', '[]', 1, ?, ?)`)
			.bind(momentId, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')
			.run()
		const service = new MomentBackupService(runtimeEnv())
		const snapshot = await service.buildSnapshot(new Date('2026-08-03T01:00:00.000Z'))
		await testEnv.DB.prepare('DELETE FROM moments').run()
		vi.spyOn(GitHubRepository.prototype, 'getFile').mockResolvedValue({ path: 'backups/moments/2026/08/2026-08-03.json', sha: 'sha', content: JSON.stringify(snapshot) })
		try {
			await service.restore('backups/moments/2026/08/2026-08-03.json')
			expect((await testEnv.DB.prepare('SELECT version FROM moment_public_cache_state WHERE singleton = 1').first<{ version: number }>())?.version).toBe(1)
			await service.restore('backups/moments/2026/08/2026-08-03.json')
			expect((await testEnv.DB.prepare('SELECT version FROM moment_public_cache_state WHERE singleton = 1').first<{ version: number }>())?.version).toBe(2)
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('备份失败时释放租约以允许安全重试', async () => {
		await testEnv.DB.prepare(`INSERT INTO moments (id, content, status, tags_json, version, created_at, updated_at) VALUES (?, 'retry', 'published', '[]', 1, ?, ?)`)
			.bind(crypto.randomUUID(), '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z')
			.run()
		vi.spyOn(GitHubRepository.prototype, 'getBranchHead').mockRejectedValueOnce(new Error('upstream unavailable'))
		try {
			await expect(new MomentBackupService(runtimeEnv()).backup()).rejects.toThrow('upstream unavailable')
			const state = await testEnv.DB.prepare('SELECT lease_owner, lease_expires_at, last_error FROM moment_backup_state WHERE singleton = 1').first<{
				lease_owner: string | null
				lease_expires_at: string | null
				last_error: string | null
			}>()
			expect(state?.lease_owner).toBeNull()
			expect(state?.lease_expires_at).toBeNull()
			expect(state?.last_error).toContain('upstream unavailable')
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('恢复校验失败时不改变公开缓存版本', async () => {
		vi.spyOn(GitHubRepository.prototype, 'getFile').mockResolvedValue({ path: 'backups/moments/2026/08/2026-08-03.json', sha: 'sha', content: '{}' })
		try {
			await expect(new MomentBackupService(runtimeEnv()).restore('backups/moments/2026/08/2026-08-03.json')).rejects.toThrow()
			expect(await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM moment_public_cache_state').first<{ count: number }>()).toEqual({ count: 0 })
		}
		finally {
			vi.restoreAllMocks()
		}
	})
})
