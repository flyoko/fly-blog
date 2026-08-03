export type PublishRunKind = 'direct' | 'pull_request'

export interface CreatePublishRunInput {
	id: string
	kind: PublishRunKind
	status: string
	repositoryRef: string
	resourcePath?: string | null
	createdAt: string
}

export interface UpdatePublishRunInput {
	status?: string
	commitSha?: string | null
	pullNumber?: number | null
	pullRequestUrl?: string | null
	workflowRunId?: number | null
	deploymentUrl?: string | null
	errorCode?: string | null
	errorMessage?: string | null
	updatedAt: string
}

export interface PublishRunRow {
	id: string
	kind: PublishRunKind
	status: string
	repositoryRef: string
	resourcePath: string | null
	commitSha: string | null
	pullNumber: number | null
	pullRequestUrl: string | null
	workflowRunId: number | null
	deploymentUrl: string | null
	errorCode: string | null
	errorMessage: string | null
	createdAt: string
	updatedAt: string
}

interface DatabasePublishRunRow {
	id: string
	kind: PublishRunKind
	status: string
	repository_ref: string
	resource_path: string | null
	commit_sha: string | null
	pull_number: number | null
	pull_request_url: string | null
	workflow_run_id: number | null
	deployment_url: string | null
	error_code: string | null
	error_message: string | null
	created_at: string
	updated_at: string
}

function mapPublishRun(row: DatabasePublishRunRow): PublishRunRow {
	return {
		id: row.id,
		kind: row.kind,
		status: row.status,
		repositoryRef: row.repository_ref,
		resourcePath: row.resource_path,
		commitSha: row.commit_sha,
		pullNumber: row.pull_number,
		pullRequestUrl: row.pull_request_url,
		workflowRunId: row.workflow_run_id,
		deploymentUrl: row.deployment_url,
		errorCode: row.error_code,
		errorMessage: row.error_message,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export class PublishRepository {
	constructor(private readonly db: D1Database) {}

	async createRun(input: CreatePublishRunInput): Promise<void> {
		await this.db.prepare(`
			INSERT INTO publish_runs (
				id, kind, status, repository_ref, resource_path, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`).bind(
			input.id,
			input.kind,
			input.status,
			input.repositoryRef,
			input.resourcePath ?? null,
			input.createdAt,
			input.createdAt,
		).run()
	}

	async findRun(id: string): Promise<PublishRunRow | null> {
		const row = await this.db.prepare('SELECT * FROM publish_runs WHERE id = ?')
			.bind(id)
			.first<DatabasePublishRunRow>()
		return row ? mapPublishRun(row) : null
	}

	async findByPullNumber(pullNumber: number): Promise<PublishRunRow | null> {
		const row = await this.db.prepare('SELECT * FROM publish_runs WHERE pull_number = ? ORDER BY created_at DESC LIMIT 1')
			.bind(pullNumber)
			.first<DatabasePublishRunRow>()
		return row ? mapPublishRun(row) : null
	}

	async listRuns(page: number, pageSize: number): Promise<{ items: PublishRunRow[], total: number }> {
		const total = await this.db.prepare('SELECT COUNT(*) AS count FROM publish_runs')
			.first<{ count: number }>()
		const rows = await this.db.prepare(`
			SELECT * FROM publish_runs
			ORDER BY created_at DESC, id DESC
			LIMIT ? OFFSET ?
		`).bind(pageSize, (page - 1) * pageSize).all<DatabasePublishRunRow>()
		return { items: rows.results.map(mapPublishRun), total: total?.count ?? 0 }
	}

	async countByStatuses(statuses: string[]): Promise<number> {
		if (statuses.length === 0)
			return 0
		const placeholders = statuses.map(() => '?').join(', ')
		const row = await this.db.prepare(`SELECT COUNT(*) AS count FROM publish_runs WHERE status IN (${placeholders})`)
			.bind(...statuses)
			.first<{ count: number }>()
		return row?.count ?? 0
	}

	async countOpenPullRequests(): Promise<number> {
		const row = await this.db.prepare(`
			SELECT COUNT(*) AS count FROM publish_runs
			WHERE kind = 'pull_request'
				AND status IN ('created', 'commit_created', 'checks_pending', 'preview_ready')
		`).first<{ count: number }>()
		return row?.count ?? 0
	}

	async latestRun(): Promise<PublishRunRow | null> {
		const row = await this.db.prepare('SELECT * FROM publish_runs ORDER BY created_at DESC, id DESC LIMIT 1')
			.first<DatabasePublishRunRow>()
		return row ? mapPublishRun(row) : null
	}

	async updateRun(id: string, input: UpdatePublishRunInput): Promise<void> {
		const assignments: string[] = []
		const values: unknown[] = []
		const columns: Array<[keyof Omit<UpdatePublishRunInput, 'updatedAt'>, string]> = [
			['status', 'status'],
			['commitSha', 'commit_sha'],
			['pullNumber', 'pull_number'],
			['pullRequestUrl', 'pull_request_url'],
			['workflowRunId', 'workflow_run_id'],
			['deploymentUrl', 'deployment_url'],
			['errorCode', 'error_code'],
			['errorMessage', 'error_message'],
		]
		for (const [key, column] of columns) {
			if (key in input) {
				assignments.push(`${column} = ?`)
				values.push(input[key])
			}
		}
		assignments.push('updated_at = ?')
		values.push(input.updatedAt, id)
		await this.db.prepare(`UPDATE publish_runs SET ${assignments.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run()
	}
}
