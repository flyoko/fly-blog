import type { MomentDto } from '../../../../../shared/admin/moments'
import type { Env, Variables } from '../../env'
import { ApiError } from '../../lib/api-error'
import { AuditRepository } from '../../repositories/audit-repository'
import { MomentRepository } from '../../repositories/moment-repository'

export interface MomentActor {
	id: string
	login: string
	requestId: string
}

export class MomentService {
	private readonly repository: MomentRepository
	private readonly audit: AuditRepository

	constructor(private readonly env: Env) {
		this.repository = new MomentRepository(env.DB)
		this.audit = new AuditRepository(env.DB)
	}

	async create(input: {
		moment: {
			content: string
			status: MomentDto['status']
			tags: string[]
			city?: string | null
			music?: MomentDto['music']
			mediaIds: string[]
		}
		actor: MomentActor
	}): Promise<MomentDto> {
		const at = new Date().toISOString()
		const created = await this.repository.create({
			id: crypto.randomUUID(),
			content: input.moment.content,
			status: input.moment.status,
			tags: input.moment.tags,
			city: input.moment.city ?? null,
			music: input.moment.music ?? null,
			mediaIds: input.moment.mediaIds,
			createdAt: at,
			updatedAt: at,
			publishedAt: input.moment.status === 'published' ? at : null,
		})
		await this.writeAudit('moment.create', created.id, input.actor, { status: created.status, version: created.version })
		return created
	}

	async update(id: string, expectedVersion: number, input: {
		moment: {
			content: string
			status: MomentDto['status']
			tags: string[]
			city?: string | null
			music?: MomentDto['music']
			mediaIds: string[]
		}
		actor: MomentActor
	}): Promise<MomentDto> {
		const current = await this.repository.find(id, false)
		if (!current)
			throw new ApiError('NOT_FOUND', 404, 'Moment not found')
		const at = new Date().toISOString()
		const updated = await this.repository.update(id, expectedVersion, {
			content: input.moment.content,
			status: input.moment.status,
			tags: input.moment.tags,
			city: input.moment.city ?? null,
			music: input.moment.music ?? null,
			mediaIds: input.moment.mediaIds,
			updatedAt: at,
			publishedAt: input.moment.status === 'published' ? (current.publishedAt ?? at) : current.publishedAt,
		})
		await this.writeAudit('moment.update', id, input.actor, { status: updated.status, version: updated.version })
		return updated
	}

	async transition(id: string, expectedVersion: number, status: 'draft' | 'published' | 'withdrawn', actor: MomentActor) {
		const current = await this.repository.find(id, false)
		if (!current)
			throw new ApiError('NOT_FOUND', 404, 'Moment not found')
		if (status === 'draft' && current.status !== 'withdrawn')
			throw new ApiError('CONFLICT', 409, 'Only withdrawn moments can return to draft')
		const updated = await this.repository.transition(id, expectedVersion, status, new Date().toISOString())
		await this.writeAudit(`moment.${status}`, id, actor, { version: updated.version })
		return updated
	}

	private async writeAudit(action: string, targetId: string, actor: MomentActor, metadata: Record<string, unknown>) {
		await this.audit.writeAudit({
			actorId: actor.id,
			actorLogin: actor.login,
			action,
			targetType: 'moment',
			targetId,
			result: 'success',
			requestId: actor.requestId,
			metadata,
		})
	}
}

export function momentActor(session: NonNullable<Variables['session']>, requestId: string): MomentActor {
	return { id: session.id, login: session.login, requestId }
}
