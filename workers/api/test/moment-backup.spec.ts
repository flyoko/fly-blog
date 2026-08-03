import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
})
