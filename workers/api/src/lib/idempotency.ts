import { ApiError } from './api-error'

interface IdempotencyRow {
	key: string
	scope: string
	request_hash: string
	response_status: number | null
	response_body: string | null
	state: 'running' | 'complete' | 'failed'
	expires_at: string
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value))
		return value.map(stableValue)
	if (!value || typeof value !== 'object')
		return value
	return Object.fromEntries(Object.entries(value)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, nested]) => [key, stableValue(nested)]))
}

async function requestHash(scope: string, body: unknown): Promise<string> {
	const encoded = new TextEncoder().encode(JSON.stringify({ scope, body: stableValue(body) }))
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))
	return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function findRow(db: D1Database, key: string): Promise<IdempotencyRow | null> {
	return db.prepare('SELECT * FROM idempotency_keys WHERE key = ?')
		.bind(key)
		.first<IdempotencyRow>()
}

export async function withIdempotency<T>(options: {
	db: D1Database
	key: string
	scope: string
	requestBody: unknown
	execute: () => Promise<{ status: number, body: T }>
}): Promise<{ status: number, body: T, replayed: boolean }> {
	const hash = await requestHash(options.scope, options.requestBody)
	const now = new Date()
	const nowIso = now.toISOString()
	const runningExpiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
	const completeExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()

	const validateExisting = (row: IdempotencyRow) => {
		if (row.scope !== options.scope || row.request_hash !== hash)
			throw new ApiError('CONFLICT', 409, 'Idempotency key was reused with a different request')
	}
	const replay = (row: IdempotencyRow) => {
		if (row.state !== 'complete' || row.response_status === null || row.response_body === null)
			return null
		return {
			status: row.response_status,
			body: JSON.parse(row.response_body) as T,
			replayed: true,
		}
	}

	const inserted = await options.db.prepare(`
		INSERT OR IGNORE INTO idempotency_keys (
			key, scope, request_hash, state, created_at, expires_at
		) VALUES (?, ?, ?, 'running', ?, ?)
	`).bind(options.key, options.scope, hash, nowIso, runningExpiresAt).run()
	let ownsClaim = inserted.meta.changes === 1

	if (!ownsClaim) {
		const existing = await findRow(options.db, options.key)
		if (!existing)
			throw new ApiError('INTERNAL_ERROR', 500, 'Idempotency claim could not be loaded')
		validateExisting(existing)
		const existingReplay = replay(existing)
		if (existingReplay)
			return existingReplay
		if (existing.state === 'running' && existing.expires_at > nowIso)
			throw new ApiError('CONFLICT', 409, 'An identical request is already running')

		const reclaimed = await options.db.prepare(`
			UPDATE idempotency_keys
			SET state = 'running', request_hash = ?, response_status = NULL,
				response_body = NULL, created_at = ?, expires_at = ?
			WHERE key = ? AND (state = 'failed' OR expires_at <= ?)
		`).bind(hash, nowIso, runningExpiresAt, options.key, nowIso).run()
		ownsClaim = reclaimed.meta.changes === 1
		if (!ownsClaim) {
			const latest = await findRow(options.db, options.key)
			if (!latest)
				throw new ApiError('INTERNAL_ERROR', 500, 'Idempotency claim disappeared')
			validateExisting(latest)
			const latestReplay = replay(latest)
			if (latestReplay)
				return latestReplay
			throw new ApiError('CONFLICT', 409, 'An identical request is already running')
		}
	}

	try {
		const result = await options.execute()
		await options.db.prepare(`
			UPDATE idempotency_keys
			SET state = 'complete', response_status = ?, response_body = ?, expires_at = ?
			WHERE key = ? AND state = 'running' AND request_hash = ?
		`).bind(result.status, JSON.stringify(result.body), completeExpiresAt, options.key, hash).run()
		return { ...result, replayed: false }
	}
	catch (error) {
		await options.db.prepare(`
			UPDATE idempotency_keys SET state = 'failed', expires_at = ?
			WHERE key = ? AND state = 'running' AND request_hash = ?
		`).bind(nowIso, options.key, hash).run()
		throw error
	}
}
