import type { MomentDto, MomentStatus } from '../../../../shared/admin/moments'
import { ApiError } from '../lib/api-error'

interface DatabaseMomentRow {
	id: string
	content: string
	status: MomentStatus
	tags_json: string
	city: string | null
	music_json: string | null
	version: number
	published_at: string | null
	created_at: string
	updated_at: string
}

interface DatabaseMomentMediaRow {
	id: string
	public_url: string | null
	mime_type: string
	alt_text: string
}

export interface MomentWriteInput {
	id: string
	content: string
	status: MomentStatus
	tags: string[]
	city: string | null
	music: MomentDto['music']
	mediaIds: string[]
	createdAt: string
	updatedAt: string
	publishedAt: string | null
}

export interface MomentListInput {
	page: number
	pageSize: number
	publicOnly?: boolean
	status?: MomentStatus
	query?: string
	tag?: string
	year?: number
}

function parseJson<T>(value: string | null, fallback: T): T {
	if (!value)
		return fallback
	try {
		return JSON.parse(value) as T
	}
	catch {
		return fallback
	}
}

function placeholders(values: unknown[]): string {
	return values.map(() => '?').join(', ')
}

export class MomentRepository {
	constructor(private readonly db: D1Database) {}

	async create(input: MomentWriteInput): Promise<MomentDto> {
		await this.assertActiveMedia(input.mediaIds)
		const statements = [
			this.db.prepare(`
				INSERT INTO moments (
					id, content, status, tags_json, city, music_json, version,
					published_at, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
			`).bind(
				input.id,
				input.content,
				input.status,
				JSON.stringify(input.tags),
				input.city,
				input.music ? JSON.stringify(input.music) : null,
				input.publishedAt,
				input.createdAt,
				input.updatedAt,
			),
			...input.mediaIds.map((mediaId, index) => this.db.prepare(`
				INSERT INTO moment_media (moment_id, media_id, sort_order, alt_text)
				VALUES (?, ?, ?, '')
			`).bind(input.id, mediaId, index)),
		]
		try {
			await this.db.batch(statements)
		}
		catch (error) {
			if (String(error).includes('UNIQUE'))
				throw new ApiError('CONFLICT', 409, 'Moment already exists')
			throw error
		}
		return (await this.find(input.id, false))!
	}

	async update(id: string, expectedVersion: number, input: Omit<MomentWriteInput, 'id' | 'createdAt'>): Promise<MomentDto> {
		await this.assertActiveMedia(input.mediaIds)
		const nextVersion = expectedVersion + 1
		const statements = [
			this.db.prepare(`
				UPDATE moments SET
					content = ?, status = ?, tags_json = ?, city = ?, music_json = ?,
					version = ?, published_at = ?, withdrawn_at = CASE WHEN ? = 'withdrawn' THEN ? ELSE NULL END,
					updated_at = ?
				WHERE id = ? AND version = ?
			`).bind(
				input.content,
				input.status,
				JSON.stringify(input.tags),
				input.city,
				input.music ? JSON.stringify(input.music) : null,
				nextVersion,
				input.publishedAt,
				input.status,
				input.status === 'withdrawn' ? input.updatedAt : null,
				input.updatedAt,
				id,
				expectedVersion,
			),
			this.db.prepare(`
				DELETE FROM moment_media
				WHERE moment_id = ? AND EXISTS (
					SELECT 1 FROM moments WHERE id = ? AND version = ?
				)
			`).bind(id, id, nextVersion),
			...input.mediaIds.map((mediaId, index) => this.db.prepare(`
				INSERT INTO moment_media (moment_id, media_id, sort_order, alt_text)
				SELECT ?, ?, ?, ''
				WHERE EXISTS (SELECT 1 FROM moments WHERE id = ? AND version = ?)
			`).bind(id, mediaId, index, id, nextVersion)),
		]
		const results = await this.db.batch(statements)
		if ((results[0]?.meta.changes ?? 0) !== 1)
			throw new ApiError('CONFLICT', 409, 'Moment changed since it was loaded')
		return (await this.find(id, false))!
	}

	async transition(id: string, expectedVersion: number, status: MomentStatus, at: string): Promise<MomentDto> {
		const publishedAt = status === 'published' ? at : null
		const result = await this.db.prepare(`
			UPDATE moments SET
				status = ?, version = version + 1,
				published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END,
				withdrawn_at = CASE WHEN ? = 'withdrawn' THEN ? ELSE NULL END,
				updated_at = ?
			WHERE id = ? AND version = ?
		`).bind(status, status, publishedAt, status, status === 'withdrawn' ? at : null, at, id, expectedVersion).run()
		if ((result.meta.changes ?? 0) !== 1)
			throw new ApiError('CONFLICT', 409, 'Moment changed since it was loaded')
		return (await this.find(id, false))!
	}

	async find(id: string, publicOnly = true, visitorHash?: string): Promise<MomentDto | null> {
		const row = await this.db.prepare(`
			SELECT * FROM moments WHERE id = ? ${publicOnly ? 'AND status = \'published\'' : ''}
		`).bind(id).first<DatabaseMomentRow>()
		if (!row)
			return null
		return this.hydrate(row, visitorHash)
	}

	async list(input: MomentListInput, visitorHash?: string): Promise<{ items: MomentDto[], total: number }> {
		const clauses: string[] = []
		const values: unknown[] = []
		if (input.publicOnly) {
			clauses.push('status = \'published\'')
		}
		else if (input.status) {
			clauses.push('status = ?')
			values.push(input.status)
		}
		const query = input.query?.trim()
		if (query) {
			clauses.push('LOWER(content) LIKE ?')
			values.push(`%${query.toLowerCase()}%`)
		}
		const tag = input.tag?.trim()
		if (tag) {
			clauses.push('EXISTS (SELECT 1 FROM json_each(tags_json) WHERE json_each.value = ?)')
			values.push(tag)
		}
		if (input.year) {
			clauses.push('CAST(strftime(\'%Y\', COALESCE(published_at, created_at)) AS INTEGER) = ?')
			values.push(input.year)
		}
		const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
		const count = await this.db.prepare(`SELECT COUNT(*) AS count FROM moments ${where}`)
			.bind(...values)
			.first<{ count: number }>()
		const rows = await this.db.prepare(`
			SELECT * FROM moments ${where}
			ORDER BY COALESCE(published_at, created_at) DESC, id DESC
			LIMIT ? OFFSET ?
		`).bind(...values, input.pageSize, (input.page - 1) * input.pageSize).all<DatabaseMomentRow>()
		return {
			items: await Promise.all(rows.results.map(row => this.hydrate(row, visitorHash))),
			total: count?.count ?? 0,
		}
	}

	async like(id: string, visitorHash: string, createdAt: string): Promise<{ liked: boolean, likeCount: number }> {
		const moment = await this.db.prepare('SELECT id FROM moments WHERE id = ? AND status = \'published\'')
			.bind(id)
			.first<{ id: string }>()
		if (!moment)
			throw new ApiError('NOT_FOUND', 404, 'Moment not found')
		const result = await this.db.prepare(`
			INSERT OR IGNORE INTO moment_likes (moment_id, visitor_hash, created_at)
			VALUES (?, ?, ?)
		`).bind(id, visitorHash, createdAt).run()
		return { liked: true, likeCount: await this.countLikes(id), ...(result.meta.changes === 0 ? {} : {}) }
	}

	async unlike(id: string, visitorHash: string): Promise<{ liked: boolean, likeCount: number }> {
		await this.db.prepare('DELETE FROM moment_likes WHERE moment_id = ? AND visitor_hash = ?')
			.bind(id, visitorHash)
			.run()
		return { liked: false, likeCount: await this.countLikes(id) }
	}

	async exportRows(): Promise<Array<{
		id: string
		content: string
		status: MomentStatus
		tags: string[]
		city: string | null
		music: MomentDto['music']
		mediaIds: string[]
		version: number
		publishedAt: string | null
		createdAt: string
		updatedAt: string
	}>> {
		const rows = await this.db.prepare('SELECT * FROM moments ORDER BY created_at, id').all<DatabaseMomentRow>()
		return Promise.all(rows.results.map(async row => ({
			id: row.id,
			content: row.content,
			status: row.status,
			tags: parseJson<string[]>(row.tags_json, []),
			city: row.city,
			music: parseJson<MomentDto['music']>(row.music_json, null),
			mediaIds: (await this.db.prepare('SELECT media_id FROM moment_media WHERE moment_id = ? ORDER BY sort_order, media_id')
				.bind(row.id)
				.all<{ media_id: string }>()).results.map(item => item.media_id),
			version: row.version,
			publishedAt: row.published_at,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		})))
	}

	async lastChangedAt(): Promise<string | null> {
		const row = await this.db.prepare('SELECT MAX(updated_at) AS value FROM moments').first<{ value: string | null }>()
		return row?.value ?? null
	}

	private async hydrate(row: DatabaseMomentRow, visitorHash?: string): Promise<MomentDto> {
		const media = await this.db.prepare(`
			SELECT mo.id, mo.public_url, mo.mime_type, mm.alt_text
			FROM moment_media mm
			JOIN media_objects mo ON mo.id = mm.media_id
			WHERE mm.moment_id = ? AND mo.status = 'active'
			ORDER BY mm.sort_order, mo.id
		`).bind(row.id).all<DatabaseMomentMediaRow>()
		const likeCount = await this.countLikes(row.id)
		const liked = visitorHash
			? Boolean(await this.db.prepare('SELECT 1 AS liked FROM moment_likes WHERE moment_id = ? AND visitor_hash = ?')
					.bind(row.id, visitorHash)
					.first<{ liked: number }>())
			: undefined
		return {
			id: row.id,
			content: row.content,
			status: row.status,
			tags: parseJson<string[]>(row.tags_json, []),
			city: row.city,
			music: parseJson<MomentDto['music']>(row.music_json, null),
			media: media.results.filter(item => item.public_url).map(item => ({
				id: item.id,
				url: item.public_url!,
				mime: item.mime_type,
				alt: item.alt_text,
			})),
			likeCount,
			...(liked === undefined ? {} : { liked }),
			version: row.version,
			publishedAt: row.published_at,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}
	}

	private async countLikes(id: string): Promise<number> {
		const row = await this.db.prepare('SELECT COUNT(*) AS count FROM moment_likes WHERE moment_id = ?')
			.bind(id)
			.first<{ count: number }>()
		return row?.count ?? 0
	}

	private async assertActiveMedia(mediaIds: string[]): Promise<void> {
		if (mediaIds.length === 0)
			return
		const rows = await this.db.prepare(`
			SELECT id FROM media_objects
			WHERE id IN (${placeholders(mediaIds)}) AND status = 'active'
		`).bind(...mediaIds).all<{ id: string }>()
		if (rows.results.length !== mediaIds.length)
			throw new ApiError('VALIDATION_FAILED', 400, 'Moment references unavailable media')
	}
}
