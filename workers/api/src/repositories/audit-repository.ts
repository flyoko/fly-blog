import { ApiError } from '../lib/api-error'

export interface AuditInput {
	id?: string
	actorId?: string | null
	actorLogin?: string | null
	action: string
	targetType: string
	targetId?: string | null
	result: 'success' | 'failure'
	requestId: string
	metadata?: unknown
	createdAt?: string
}

const forbiddenMetadataKey = /secret|token|private.?key|authorization/i

function assertSafeMetadata(value: unknown): void {
	if (Array.isArray(value)) {
		for (const item of value)
			assertSafeMetadata(item)
		return
	}
	if (!value || typeof value !== 'object')
		return
	for (const [key, nested] of Object.entries(value)) {
		if (forbiddenMetadataKey.test(key))
			throw new ApiError('VALIDATION_FAILED', 400, `Audit metadata key is forbidden: ${key}`)
		assertSafeMetadata(nested)
	}
}

export class AuditRepository {
	constructor(private readonly db: D1Database) {}

	prepareAudit(input: AuditInput): D1PreparedStatement {
		const metadata = input.metadata ?? {}
		assertSafeMetadata(metadata)
		return this.db.prepare(`
			INSERT INTO audit_logs (
				id, actor_id, actor_login, action, target_type, target_id,
				result, request_id, metadata_json, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			input.id ?? crypto.randomUUID(),
			input.actorId ?? null,
			input.actorLogin ?? null,
			input.action,
			input.targetType,
			input.targetId ?? null,
			input.result,
			input.requestId,
			JSON.stringify(metadata),
			input.createdAt ?? new Date().toISOString(),
		)
	}

	async writeAudit(input: AuditInput): Promise<void> {
		await this.prepareAudit(input).run()
	}
}
