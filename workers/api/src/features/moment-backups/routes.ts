import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { z } from 'zod'
import { ApiError, success } from '../../lib/api-error'
import { enforceRateLimit, requireCsrf, requireSession } from '../../middleware/session'
import { AuditRepository } from '../../repositories/audit-repository'
import { MomentBackupService } from './service'

const pathSchema = z.string().regex(/^backups\/moments\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/u)

export const momentBackupRoutes = new Hono<AppEnvironment>()
momentBackupRoutes.use('*', requireSession)

momentBackupRoutes.get('/', async c => success(c, await new MomentBackupService(c.env).status()))

momentBackupRoutes.post('/run', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:moment-backup`, async () => {
		const result = await new MomentBackupService(c.env).backup()
		await new AuditRepository(c.env.DB).writeAudit({ actorId: session.id, actorLogin: session.login, action: 'moment.backup.run', targetType: 'moment_backup', targetId: result.path, result: 'success', requestId: c.get('requestId'), metadata: { changed: result.changed, checksum: result.checksum } })
		return success(c, result)
	})
})

momentBackupRoutes.post('/preview', requireCsrf, async (c) => {
	const raw = await c.req.json().catch(() => {
		throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
	})
	const path = pathSchema.safeParse(raw?.path)
	if (!path.success)
		throw new ApiError('VALIDATION_FAILED', 400, 'Moment backup path is invalid')
	return success(c, await new MomentBackupService(c.env).preview(path.data))
})

momentBackupRoutes.post('/restore', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:moment-restore`, async () => {
		const raw = await c.req.json().catch(() => {
			throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
		})
		const path = pathSchema.safeParse(raw?.path)
		if (!path.success || raw?.confirmation !== 'RESTORE')
			throw new ApiError('VALIDATION_FAILED', 400, 'Restore path and confirmation are required')
		const result = await new MomentBackupService(c.env).restore(path.data)
		await new AuditRepository(c.env.DB).writeAudit({ actorId: session.id, actorLogin: session.login, action: 'moment.restore', targetType: 'moment_backup', targetId: path.data, result: 'success', requestId: c.get('requestId'), metadata: { checksum: result.checksum, restored: result.restored } })
		return success(c, result)
	})
})
