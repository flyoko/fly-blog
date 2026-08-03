import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { mediaStatusSchema, mediaUploadPurposeSchema } from '../../../../../shared/admin/media'
import { ApiError, success } from '../../lib/api-error'
import { withIdempotency } from '../../lib/idempotency'
import {
	enforceRateLimit,
	requireCsrf,
	requireSession,
} from '../../middleware/session'
import { AuditRepository } from '../../repositories/audit-repository'
import { MediaService } from './media-service'
import { prepareUploadedFiles } from './upload-preflight'

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
	return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
	if (value === undefined || value === '')
		return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
		throw new ApiError('VALIDATION_FAILED', 400, 'Pagination value is invalid')
	return parsed
}

export const mediaRoutes = new Hono<AppEnvironment>()

mediaRoutes.use('*', requireSession)

mediaRoutes.get('/', async (c) => {
	const typeValue = c.req.query('type')
	const statusValue = c.req.query('status') ?? 'active'
	const type = typeValue === undefined || typeValue === ''
		? undefined
		: typeValue === 'image' || typeValue === 'audio'
			? typeValue
			: (() => { throw new ApiError('VALIDATION_FAILED', 400, 'Media type is invalid') })()
	const status = mediaStatusSchema.safeParse(statusValue)
	if (!status.success)
		throw new ApiError('VALIDATION_FAILED', 400, 'Media status is invalid')
	const data = await new MediaService(c.env).list({
		page: positiveInteger(c.req.query('page'), 1, 1_000_000),
		pageSize: positiveInteger(c.req.query('pageSize'), 40, 40),
		type,
		query: c.req.query('query'),
		status: status.data,
	})
	return success(c, data)
})

mediaRoutes.post('/', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.id}:media:upload`, async () => {
		const idempotencyKey = c.req.header('x-idempotency-key')
		if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
			throw new ApiError('VALIDATION_FAILED', 400, 'A valid x-idempotency-key header is required')
		const form = await c.req.formData()
		const purpose = mediaUploadPurposeSchema.safeParse(form.get('purpose'))
		if (!purpose.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Media purpose is invalid')
		const fileValues = form.getAll('files')
		if (!fileValues.length || fileValues.some(value => !(value instanceof File)))
			throw new ApiError('VALIDATION_FAILED', 400, 'Multipart field files must contain uploaded files')
		const files = await prepareUploadedFiles(fileValues as File[], purpose.data)
		const fingerprints = await Promise.all(files.map(async file => ({
			name: file.name,
			size: file.bytes.byteLength,
			sha256: await sha256Hex(file.bytes),
		})))
		const execution = await withIdempotency({
			db: c.env.DB,
			key: idempotencyKey,
			scope: `media.upload:${session.id}`,
			requestBody: { purpose: purpose.data, files: fingerprints },
			execute: async () => {
				const body = await new MediaService(c.env).uploadMany({ purpose: purpose.data, files })
				await new AuditRepository(c.env.DB).writeAudit({
					actorId: session.id,
					actorLogin: session.login,
					action: 'media.upload',
					targetType: 'media',
					result: 'success',
					requestId: c.get('requestId'),
					metadata: {
						purpose: purpose.data,
						total: body.length,
						succeeded: body.filter(item => item.ok).length,
					},
				})
				return { status: 201, body }
			},
		})
		return success(c, execution.body, 201)
	})
})

mediaRoutes.delete('/:id', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.id}:media:trash`, async () => {
		const media = await new MediaService(c.env).trash(c.req.param('id'))
		await new AuditRepository(c.env.DB).writeAudit({
			actorId: session.id,
			actorLogin: session.login,
			action: 'media.trash',
			targetType: 'media',
			targetId: media.id,
			result: 'success',
			requestId: c.get('requestId'),
		})
		return success(c, media)
	})
})

mediaRoutes.post('/:id/restore', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.id}:media:restore`, async () => {
		const media = await new MediaService(c.env).restore(c.req.param('id'))
		await new AuditRepository(c.env.DB).writeAudit({
			actorId: session.id,
			actorLogin: session.login,
			action: 'media.restore',
			targetType: 'media',
			targetId: media.id,
			result: 'success',
			requestId: c.get('requestId'),
		})
		return success(c, media)
	})
})

mediaRoutes.delete('/:id/permanent', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.id}:media:permanent-delete`, async () => {
		const id = c.req.param('id')
		await new MediaService(c.env).deletePermanently(id, c.req.header('x-confirmation-token'))
		await new AuditRepository(c.env.DB).writeAudit({
			actorId: session.id,
			actorLogin: session.login,
			action: 'media.permanent-delete',
			targetType: 'media',
			targetId: id,
			result: 'success',
			requestId: c.get('requestId'),
		})
		return c.body(null, 204)
	})
})
