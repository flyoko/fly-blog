import type { MomentBackupSnapshot } from '../../../../../shared/admin/moments'
import type { Env } from '../../env'
import { momentBackupSnapshotSchema } from '../../../../../shared/admin/moments'
import { ApiError } from '../../lib/api-error'
import { MomentRepository } from '../../repositories/moment-repository'
import { GitHubRepository } from '../articles/github-repository'

function hex(bytes: Uint8Array): string {
	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function checksum(value: unknown): Promise<string> {
	const encoded = new TextEncoder().encode(JSON.stringify(value))
	return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)))
}

function datePath(date: Date): string {
	const year = date.getUTCFullYear()
	const month = String(date.getUTCMonth() + 1).padStart(2, '0')
	const day = String(date.getUTCDate()).padStart(2, '0')
	return `backups/moments/${year}/${month}/${year}-${month}-${day}.json`
}

export class MomentBackupService {
	private readonly moments: MomentRepository
	private readonly github: GitHubRepository

	constructor(private readonly env: Env) {
		this.moments = new MomentRepository(env.DB)
		this.github = new GitHubRepository(env)
	}

	async buildSnapshot(at = new Date()): Promise<MomentBackupSnapshot> {
		const moments = await this.moments.exportRows()
		const lastChangedAt = await this.moments.lastChangedAt()
		const base = { schemaVersion: 1 as const, exportedAt: at.toISOString(), lastChangedAt, moments }
		return momentBackupSnapshotSchema.parse({ ...base, checksum: await checksum({ lastChangedAt, moments }) })
	}

	async backup(at = new Date()) {
		const snapshot = await this.buildSnapshot(at)
		const state = await this.env.DB.prepare('SELECT * FROM moment_backup_state WHERE singleton = 1').first<{
			last_checksum: string | null
			last_commit_sha: string | null
			last_backup_path: string | null
		}>()
		if (state?.last_checksum === snapshot.checksum) {
			return { changed: false as const, checksum: snapshot.checksum, commitSha: state.last_commit_sha, path: state.last_backup_path }
		}
		const path = datePath(at)
		const runId = crypto.randomUUID()
		await this.createRun(runId, 'moment_backup', 'created', snapshot.checksum, snapshot.moments.length, at.toISOString())
		try {
			const head = await this.github.getBranchHead(this.env.GITHUB_DEFAULT_BRANCH)
			const commit = await this.github.createAtomicCommit({
				branch: this.env.GITHUB_DEFAULT_BRANCH,
				expectedHeadSha: head,
				message: `备份瞬间: ${path.split('/').at(-1)}`,
				files: [{ path, content: `${JSON.stringify(snapshot, null, 2)}\n` }],
			})
			const now = new Date().toISOString()
			await this.env.DB.batch([
				this.env.DB.prepare(`
					INSERT INTO moment_backup_state (
						singleton, last_changed_at, last_checksum, last_commit_sha,
						last_backup_path, last_success_at, last_error, updated_at
					) VALUES (1, ?, ?, ?, ?, ?, NULL, ?)
					ON CONFLICT(singleton) DO UPDATE SET
						last_changed_at = excluded.last_changed_at,
						last_checksum = excluded.last_checksum,
						last_commit_sha = excluded.last_commit_sha,
						last_backup_path = excluded.last_backup_path,
						last_success_at = excluded.last_success_at,
						last_error = NULL,
						updated_at = excluded.updated_at
				`).bind(snapshot.lastChangedAt, snapshot.checksum, commit.commitSha, path, now, now),
				this.env.DB.prepare('UPDATE sync_runs SET status = \'success\', target_ref = ?, updated_at = ? WHERE id = ?')
					.bind(commit.commitSha, now, runId),
			])
			return { changed: true as const, checksum: snapshot.checksum, commitSha: commit.commitSha, path }
		}
		catch (error) {
			const message = error instanceof Error ? error.message : 'Moment backup failed'
			const now = new Date().toISOString()
			await this.env.DB.batch([
				this.env.DB.prepare('UPDATE sync_runs SET status = \'failed\', error_code = \'BACKUP_FAILED\', error_message = ?, updated_at = ? WHERE id = ?').bind(message, now, runId),
				this.env.DB.prepare(`
					INSERT INTO moment_backup_state (singleton, last_error, updated_at)
					VALUES (1, ?, ?)
					ON CONFLICT(singleton) DO UPDATE SET last_error = excluded.last_error, updated_at = excluded.updated_at
				`).bind(message, now),
			])
			throw error
		}
	}

	async status() {
		const state = await this.env.DB.prepare('SELECT * FROM moment_backup_state WHERE singleton = 1').first()
		const runs = await this.env.DB.prepare('SELECT * FROM sync_runs WHERE kind IN (\'moment_backup\', \'moment_restore\') ORDER BY created_at DESC LIMIT 20').all()
		return { state, runs: runs.results }
	}

	async preview(path: string) {
		const snapshot = await this.readSnapshot(path)
		const mediaIds = [...new Set(snapshot.moments.flatMap(moment => moment.mediaIds))]
		const missingMediaIds = await this.missingMedia(mediaIds)
		return {
			path,
			checksum: snapshot.checksum,
			momentCount: snapshot.moments.length,
			mediaCount: mediaIds.length,
			missingMediaIds,
			canRestore: missingMediaIds.length === 0,
			latestChangedAt: snapshot.lastChangedAt,
		}
	}

	async restore(path: string) {
		const snapshot = await this.readSnapshot(path)
		const mediaIds = [...new Set(snapshot.moments.flatMap(moment => moment.mediaIds))]
		const missing = await this.missingMedia(mediaIds)
		if (missing.length)
			throw new ApiError('CONFLICT', 409, 'Backup references unavailable media', { missingMediaIds: missing })
		const now = new Date().toISOString()
		const runId = crypto.randomUUID()
		const statements: D1PreparedStatement[] = [
			this.env.DB.prepare('DELETE FROM moment_likes'),
			this.env.DB.prepare('DELETE FROM moment_media'),
			this.env.DB.prepare('DELETE FROM moments'),
		]
		for (const moment of snapshot.moments) {
			statements.push(this.env.DB.prepare(`
				INSERT INTO moments (
					id, content, status, tags_json, city, music_json, version,
					published_at, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(moment.id, moment.content, moment.status, JSON.stringify(moment.tags), moment.city, moment.music ? JSON.stringify(moment.music) : null, moment.version, moment.publishedAt, moment.createdAt, moment.updatedAt))
			moment.mediaIds.forEach((mediaId, index) => statements.push(this.env.DB.prepare('INSERT INTO moment_media (moment_id, media_id, sort_order, alt_text) VALUES (?, ?, ?, ?)').bind(moment.id, mediaId, index, '')))
		}
		statements.push(this.env.DB.prepare(`
			INSERT INTO sync_runs (id, kind, status, source_ref, checksum, item_count, created_at, updated_at)
			VALUES (?, 'moment_restore', 'success', ?, ?, ?, ?, ?)
		`).bind(runId, path, snapshot.checksum, snapshot.moments.length, now, now))
		await this.env.DB.batch(statements)
		return { restored: snapshot.moments.length, checksum: snapshot.checksum, path, runId }
	}

	private async readSnapshot(path: string): Promise<MomentBackupSnapshot> {
		if (!/^backups\/moments\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/u.test(path))
			throw new ApiError('VALIDATION_FAILED', 400, 'Moment backup path is invalid')
		const file = await this.github.getFile(path, this.env.GITHUB_DEFAULT_BRANCH)
		let snapshot
		try {
			snapshot = momentBackupSnapshotSchema.parse(JSON.parse(file.content))
		}
		catch (error) {
			throw new ApiError('VALIDATION_FAILED', 400, 'Moment backup snapshot is invalid', error)
		}
		const expected = await checksum({ lastChangedAt: snapshot.lastChangedAt, moments: snapshot.moments })
		if (expected !== snapshot.checksum)
			throw new ApiError('VALIDATION_FAILED', 400, 'Moment backup checksum does not match')
		return snapshot
	}

	private async missingMedia(ids: string[]): Promise<string[]> {
		if (!ids.length)
			return []
		const rows = await this.env.DB.prepare(`SELECT id FROM media_objects WHERE status = 'active' AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: string }>()
		const present = new Set(rows.results.map(row => row.id))
		return ids.filter(id => !present.has(id))
	}

	private async createRun(id: string, kind: string, status: string, checksumValue: string, count: number, at: string) {
		await this.env.DB.prepare(`
			INSERT INTO sync_runs (id, kind, status, checksum, item_count, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).bind(id, kind, status, checksumValue, count, at, at).run()
	}
}
