export interface CreateSessionInput {
	idHash: string
	githubUserId: string
	githubLogin: string
	avatarUrl: string
	csrfHash: string
	createdAt: string
	lastSeenAt: string
	expiresAt: string
}

export interface SessionRow {
	idHash: string
	githubUserId: string
	githubLogin: string
	avatarUrl: string
	csrfHash: string
	createdAt: string
	lastSeenAt: string
	expiresAt: string
	revokedAt: string | null
}

interface DatabaseSessionRow {
	id_hash: string
	github_user_id: string
	github_login: string
	avatar_url: string
	csrf_hash: string
	created_at: string
	last_seen_at: string
	expires_at: string
	revoked_at: string | null
}

function mapSession(row: DatabaseSessionRow): SessionRow {
	return {
		idHash: row.id_hash,
		githubUserId: row.github_user_id,
		githubLogin: row.github_login,
		avatarUrl: row.avatar_url,
		csrfHash: row.csrf_hash,
		createdAt: row.created_at,
		lastSeenAt: row.last_seen_at,
		expiresAt: row.expires_at,
		revokedAt: row.revoked_at,
	}
}

export class SessionRepository {
	constructor(private readonly db: D1Database) {}

	async createSession(input: CreateSessionInput): Promise<void> {
		await this.db.prepare(`
			INSERT INTO admin_sessions (
				id_hash, github_user_id, github_login, avatar_url, csrf_hash,
				created_at, last_seen_at, expires_at, revoked_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
		`).bind(
			input.idHash,
			input.githubUserId,
			input.githubLogin,
			input.avatarUrl,
			input.csrfHash,
			input.createdAt,
			input.lastSeenAt,
			input.expiresAt,
		).run()
	}

	async findActiveSession(idHash: string, now: string): Promise<SessionRow | null> {
		const row = await this.db.prepare(`
			SELECT * FROM admin_sessions
			WHERE id_hash = ? AND revoked_at IS NULL AND expires_at > ?
		`).bind(idHash, now).first<DatabaseSessionRow>()
		return row ? mapSession(row) : null
	}

	async touchSession(idHash: string, lastSeenAt: string, expiresAt: string): Promise<void> {
		await this.db.prepare(`
			UPDATE admin_sessions
			SET last_seen_at = ?, expires_at = ?
			WHERE id_hash = ? AND revoked_at IS NULL
		`).bind(lastSeenAt, expiresAt, idHash).run()
	}

	async revokeSession(idHash: string, revokedAt: string): Promise<void> {
		await this.db.prepare(`
			UPDATE admin_sessions
			SET revoked_at = ?
			WHERE id_hash = ? AND revoked_at IS NULL
		`).bind(revokedAt, idHash).run()
	}
}
