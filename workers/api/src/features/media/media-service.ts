import type {
	MediaObjectDto,
	MediaUploadPurpose,
} from '../../../../../shared/admin/media'
import type { Env } from '../../env'
import type { MediaRow } from '../../repositories/media-repository'
import { jwtVerify, SignJWT } from 'jose'
import { ApiError } from '../../lib/api-error'
import {
	MediaRepository,

} from '../../repositories/media-repository'
import {
	buildMediaKey,
	detectAllowedMedia,
	maxBytesFor,
} from './file-signatures'

export interface PreparedMediaFile {
	name: string
	bytes: Uint8Array
}

export type MediaUploadResult
	= | { ok: true, name: string, media: MediaObjectDto }
		| { ok: false, name: string, error: { code: string, message: string } }

function normalizeOriginalName(value: string): string {
	const name = value.split(/[\\/]/u).at(-1)?.trim() ?? ''
	const hasControlCharacter = Array.from(name).some((character) => {
		const code = character.codePointAt(0) ?? 0
		return code <= 0x1F || code === 0x7F
	})
	if (!name || name.length > 255 || hasControlCharacter)
		throw new ApiError('VALIDATION_FAILED', 400, 'Media filename is invalid')
	return name
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
	return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

function keyFromSecret(secret: string): Uint8Array {
	const normalized = secret.replaceAll('-', '+').replaceAll('_', '/')
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
	const binary = atob(padded)
	const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
	if (bytes.byteLength !== 32)
		throw new Error('SESSION_ENCRYPTION_KEY must decode to 32 bytes')
	return bytes
}

function safePublicUrl(origin: string, key: string): string {
	return `${origin.replace(/\/$/u, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
}

function mediaKind(row: MediaRow): 'image' | 'audio' {
	return row.mimeType.startsWith('image/') ? 'image' : 'audio'
}

export class MediaService {
	private readonly repository: MediaRepository

	constructor(private readonly env: Env) {
		this.repository = new MediaRepository(env.DB)
	}

	async uploadMany(input: {
		purpose: MediaUploadPurpose
		files: PreparedMediaFile[]
		now?: Date
	}): Promise<MediaUploadResult[]> {
		if (input.files.length === 0)
			throw new ApiError('VALIDATION_FAILED', 400, 'At least one media file is required')
		if (input.files.length > 20)
			throw new ApiError('VALIDATION_FAILED', 400, 'At most 20 media files can be uploaded at once')
		const now = input.now ?? new Date()
		const results: MediaUploadResult[] = []
		for (const file of input.files) {
			try {
				results.push({
					ok: true,
					name: file.name,
					media: await this.uploadOne(input.purpose, file, now),
				})
			}
			catch (error) {
				const apiError = error instanceof ApiError
					? error
					: new ApiError('INTERNAL_ERROR', 500, 'Media upload failed')
				results.push({
					ok: false,
					name: file.name,
					error: { code: apiError.code, message: apiError.message },
				})
			}
		}
		return results
	}

	async get(id: string): Promise<MediaObjectDto> {
		const row = await this.repository.findMedia(id)
		if (!row)
			throw new ApiError('NOT_FOUND', 404, 'Media object was not found')
		return this.toDto(row)
	}

	async list(input: {
		page?: number
		pageSize?: number
		type?: 'image' | 'audio'
		query?: string
		status?: MediaRow['status']
	}) {
		const page = Math.max(1, Math.trunc(input.page ?? 1))
		const pageSize = Math.min(40, Math.max(1, Math.trunc(input.pageSize ?? 40)))
		const result = await this.repository.listMedia({
			page,
			pageSize,
			type: input.type,
			query: input.query,
			status: input.status ?? 'active',
		})
		return {
			page,
			pageSize,
			total: result.total,
			items: await Promise.all(result.items.map(row => this.toDto(row))),
		}
	}

	async trash(id: string, now = new Date()): Promise<MediaObjectDto> {
		const row = await this.requireStatus(id, 'active')
		const filename = row.objectKey.split('/').at(-1)
		if (!filename)
			throw new ApiError('INTERNAL_ERROR', 500, 'Media object key is invalid')
		const trashKey = `trash/${row.id}/${filename}`
		await this.copyObject(row.objectKey, trashKey)
		await this.env.MEDIA.delete(row.objectKey)
		try {
			await this.repository.moveToTrash(row.id, trashKey, now.toISOString())
		}
		catch (error) {
			await this.copyObject(trashKey, row.objectKey).catch(() => undefined)
			await this.env.MEDIA.delete(trashKey).catch(() => undefined)
			throw error
		}
		return this.get(id)
	}

	async restore(id: string): Promise<MediaObjectDto> {
		const row = await this.requireStatus(id, 'trashed')
		if (!row.originalKey)
			throw new ApiError('CONFLICT', 409, 'Media original location is missing')
		await this.copyObject(row.objectKey, row.originalKey)
		await this.env.MEDIA.delete(row.objectKey)
		try {
			await this.repository.restoreMediaLocation(row.id)
		}
		catch (error) {
			await this.copyObject(row.originalKey, row.objectKey).catch(() => undefined)
			await this.env.MEDIA.delete(row.originalKey).catch(() => undefined)
			throw error
		}
		return this.get(id)
	}

	async deletePermanently(id: string, confirmationToken?: string): Promise<void> {
		const row = await this.requireStatus(id, 'trashed')
		const referenceCount = await this.repository.countReferences(id)
		if (referenceCount > 0) {
			const confirmed = confirmationToken
				? await this.verifyDeleteConfirmation(id, confirmationToken)
				: false
			if (!confirmed) {
				throw new ApiError('CONFLICT', 409, 'Referenced media requires a second confirmation', {
					referenceCount,
					confirmationToken: await this.createDeleteConfirmation(id),
					expiresInSeconds: 300,
				})
			}
		}
		await this.env.MEDIA.delete(row.objectKey)
		await this.repository.deleteMedia(id, new Date().toISOString())
	}

	private async uploadOne(
		purpose: MediaUploadPurpose,
		file: PreparedMediaFile,
		now: Date,
	): Promise<MediaObjectDto> {
		const name = normalizeOriginalName(file.name)
		const detected = detectAllowedMedia(file.bytes)
		if (!detected)
			throw new ApiError('VALIDATION_FAILED', 400, 'Media file signature is not allowed')
		if (file.bytes.byteLength > maxBytesFor(detected.kind))
			throw new ApiError('VALIDATION_FAILED', 400, `Media file exceeds the ${detected.kind} size limit`)
		if (purpose !== 'music' && detected.kind === 'audio')
			throw new ApiError('VALIDATION_FAILED', 400, 'Audio is allowed only for the music library')
		const id = crypto.randomUUID()
		const key = buildMediaKey({ purpose, extension: detected.extension, now, id })
		const sha256 = await sha256Hex(file.bytes)
		const publicUrl = safePublicUrl(this.env.MEDIA_ORIGIN, key)
		await this.env.MEDIA.put(key, file.bytes, {
			httpMetadata: { contentType: detected.mime },
			customMetadata: { originalName: name, sha256, purpose },
		})
		const stored = await this.env.MEDIA.head(key)
		if (!stored || stored.size !== file.bytes.byteLength) {
			await this.env.MEDIA.delete(key)
			throw new ApiError('UPSTREAM_FAILED', 502, 'R2 did not persist the media object')
		}
		try {
			await this.repository.createMedia({
				id,
				objectKey: key,
				originalName: name,
				purpose,
				mimeType: detected.mime,
				sizeBytes: file.bytes.byteLength,
				sha256,
				publicUrl,
				createdAt: now.toISOString(),
			})
		}
		catch (error) {
			await this.env.MEDIA.delete(key)
			throw error
		}
		return this.get(id)
	}

	private async toDto(row: MediaRow): Promise<MediaObjectDto> {
		return {
			id: row.id,
			key: row.objectKey,
			url: row.publicUrl ?? safePublicUrl(this.env.MEDIA_ORIGIN, row.originalKey ?? row.objectKey),
			originalName: row.originalName,
			purpose: row.purpose as MediaUploadPurpose,
			kind: mediaKind(row),
			mime: row.mimeType,
			size: row.sizeBytes,
			sha256: row.sha256,
			status: row.status,
			createdAt: row.createdAt,
			updatedAt: row.deletedAt ?? row.trashedAt ?? row.createdAt,
			trashedAt: row.trashedAt,
			referenceCount: await this.repository.countReferences(row.id),
		}
	}

	private async requireStatus(id: string, status: MediaRow['status']): Promise<MediaRow> {
		const row = await this.repository.findMedia(id)
		if (!row)
			throw new ApiError('NOT_FOUND', 404, 'Media object was not found')
		if (row.status !== status)
			throw new ApiError('CONFLICT', 409, `Media must be ${status}`)
		return row
	}

	private async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
		const source = await this.env.MEDIA.get(sourceKey)
		if (!source)
			throw new ApiError('NOT_FOUND', 404, 'R2 media object was not found')
		await this.env.MEDIA.put(destinationKey, source.body, {
			httpMetadata: source.httpMetadata,
			customMetadata: source.customMetadata,
		})
		const destination = await this.env.MEDIA.head(destinationKey)
		if (!destination || destination.size !== source.size) {
			await this.env.MEDIA.delete(destinationKey)
			throw new ApiError('UPSTREAM_FAILED', 502, 'R2 media copy could not be verified')
		}
	}

	private async createDeleteConfirmation(mediaId: string): Promise<string> {
		return new SignJWT({ mediaId, operation: 'media-permanent-delete' })
			.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
			.setIssuer('fly-living-admin')
			.setAudience('media-permanent-delete')
			.setIssuedAt()
			.setExpirationTime('5m')
			.sign(keyFromSecret(this.env.SESSION_ENCRYPTION_KEY))
	}

	private async verifyDeleteConfirmation(mediaId: string, token: string): Promise<boolean> {
		try {
			const { payload } = await jwtVerify(token, keyFromSecret(this.env.SESSION_ENCRYPTION_KEY), {
				algorithms: ['HS256'],
				issuer: 'fly-living-admin',
				audience: 'media-permanent-delete',
			})
			return payload.mediaId === mediaId && payload.operation === 'media-permanent-delete'
		}
		catch {
			return false
		}
	}
}
