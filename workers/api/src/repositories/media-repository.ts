import { ApiError } from '../lib/api-error'

export interface CreateMediaInput {
	id: string
	objectKey: string
	originalKey?: string | null
	originalName: string
	purpose: string
	mimeType: string
	sizeBytes: number
	sha256: string
	publicUrl?: string | null
	createdAt: string
}

export interface MediaListInput {
	page: number
	pageSize: number
	type?: 'image' | 'audio'
	query?: string
	status?: MediaRow['status']
}

export interface MediaListResult {
	items: MediaRow[]
	total: number
}

export interface MediaRow {
	id: string
	objectKey: string
	originalKey: string | null
	originalName: string
	purpose: string
	mimeType: string
	sizeBytes: number
	sha256: string
	status: 'active' | 'trashed' | 'deleted'
	publicUrl: string | null
	createdAt: string
	trashedAt: string | null
	deletedAt: string | null
}

interface DatabaseMediaRow {
	id: string
	object_key: string
	original_key: string | null
	original_name: string
	purpose: string
	mime_type: string
	size_bytes: number
	sha256: string
	status: 'active' | 'trashed' | 'deleted'
	public_url: string | null
	created_at: string
	trashed_at: string | null
	deleted_at: string | null
}

function mapMedia(row: DatabaseMediaRow): MediaRow {
	return {
		id: row.id,
		objectKey: row.object_key,
		originalKey: row.original_key,
		originalName: row.original_name,
		purpose: row.purpose,
		mimeType: row.mime_type,
		sizeBytes: row.size_bytes,
		sha256: row.sha256,
		status: row.status,
		publicUrl: row.public_url,
		createdAt: row.created_at,
		trashedAt: row.trashed_at,
		deletedAt: row.deleted_at,
	}
}

export class MediaRepository {
	constructor(private readonly db: D1Database) {}

	async createMedia(input: CreateMediaInput): Promise<void> {
		await this.db.prepare(`
			INSERT INTO media_objects (
				id, object_key, original_key, original_name, purpose, mime_type,
				size_bytes, sha256, status, public_url, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
		`).bind(
			input.id,
			input.objectKey,
			input.originalKey ?? null,
			input.originalName,
			input.purpose,
			input.mimeType,
			input.sizeBytes,
			input.sha256,
			input.publicUrl ?? null,
			input.createdAt,
		).run()
	}

	async findMedia(id: string): Promise<MediaRow | null> {
		const row = await this.db.prepare('SELECT * FROM media_objects WHERE id = ?')
			.bind(id)
			.first<DatabaseMediaRow>()
		return row ? mapMedia(row) : null
	}

	async listMedia(input: MediaListInput): Promise<MediaListResult> {
		const clauses: string[] = []
		const values: unknown[] = []
		if (input.status) {
			clauses.push('status = ?')
			values.push(input.status)
		}
		if (input.type) {
			clauses.push('mime_type LIKE ?')
			values.push(`${input.type}/%`)
		}
		const query = input.query?.trim()
		if (query) {
			clauses.push('(LOWER(original_name) LIKE ? OR LOWER(object_key) LIKE ?)')
			const pattern = `%${query.toLowerCase()}%`
			values.push(pattern, pattern)
		}
		const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
		const count = await this.db.prepare(`SELECT COUNT(*) AS count FROM media_objects ${where}`)
			.bind(...values)
			.first<{ count: number }>()
		const rows = await this.db.prepare(`
			SELECT * FROM media_objects ${where}
			ORDER BY created_at DESC, id DESC
			LIMIT ? OFFSET ?
		`).bind(...values, input.pageSize, (input.page - 1) * input.pageSize).all<DatabaseMediaRow>()
		return {
			items: rows.results.map(mapMedia),
			total: count?.count ?? 0,
		}
	}

	async trashMedia(id: string, trashedAt: string): Promise<void> {
		await this.transition(id, 'active', 'trashed', 'trashed_at = ?, deleted_at = NULL', [trashedAt])
	}

	async moveToTrash(id: string, trashKey: string, trashedAt: string): Promise<void> {
		const result = await this.db.prepare(`
			UPDATE media_objects
			SET original_key = object_key, object_key = ?, status = 'trashed', trashed_at = ?, deleted_at = NULL
			WHERE id = ? AND status = 'active' AND original_key IS NULL
		`).bind(trashKey, trashedAt, id).run()
		if ((result.meta.changes ?? 0) !== 1)
			throw new ApiError('CONFLICT', 409, 'Media cannot be moved to trash')
	}

	async restoreMedia(id: string): Promise<void> {
		await this.transition(id, 'trashed', 'active', 'trashed_at = NULL, deleted_at = NULL')
	}

	async restoreMediaLocation(id: string): Promise<void> {
		const result = await this.db.prepare(`
			UPDATE media_objects
			SET object_key = original_key, original_key = NULL, status = 'active', trashed_at = NULL, deleted_at = NULL
			WHERE id = ? AND status = 'trashed' AND original_key IS NOT NULL
		`).bind(id).run()
		if ((result.meta.changes ?? 0) !== 1)
			throw new ApiError('CONFLICT', 409, 'Media cannot be restored')
	}

	async deleteMedia(id: string, deletedAt: string): Promise<void> {
		await this.transition(id, 'trashed', 'deleted', 'deleted_at = ?', [deletedAt])
	}

	async replaceReferences(mediaIds: string[], repositoryPath: string, repositorySha: string, createdAt: string): Promise<void> {
		const statements = [
			this.db.prepare('DELETE FROM media_references WHERE repository_path = ?').bind(repositoryPath),
			...mediaIds.map(mediaId => this.db.prepare(`
				INSERT INTO media_references (media_id, repository_path, repository_sha, created_at)
				VALUES (?, ?, ?, ?)
			`).bind(mediaId, repositoryPath, repositorySha, createdAt)),
		]
		await this.db.batch(statements)
	}

	async countReferences(id: string): Promise<number> {
		const row = await this.db.prepare('SELECT COUNT(*) AS count FROM media_references WHERE media_id = ?')
			.bind(id)
			.first<{ count: number }>()
		return row?.count ?? 0
	}

	async countByStatus(status: MediaRow['status']): Promise<number> {
		const row = await this.db.prepare('SELECT COUNT(*) AS count FROM media_objects WHERE status = ?')
			.bind(status)
			.first<{ count: number }>()
		return row?.count ?? 0
	}

	async findIdsByPublicUrls(urls: string[]): Promise<string[]> {
		const unique = [...new Set(urls)]
		if (unique.length === 0)
			return []
		const placeholders = unique.map(() => '?').join(', ')
		const rows = await this.db.prepare(`
			SELECT id FROM media_objects
			WHERE public_url IN (${placeholders}) AND status != 'deleted'
		`).bind(...unique).all<{ id: string }>()
		return rows.results.map(row => row.id)
	}

	private async transition(
		id: string,
		from: MediaRow['status'],
		to: MediaRow['status'],
		extraAssignments: string,
		values: unknown[] = [],
	): Promise<void> {
		const result = await this.db.prepare(`
			UPDATE media_objects SET status = ?, ${extraAssignments}
			WHERE id = ? AND status = ?
		`).bind(to, ...values, id, from).run()
		if ((result.meta.changes ?? 0) !== 1)
			throw new ApiError('CONFLICT', 409, `Media transition ${from} -> ${to} is not allowed`)
	}
}
