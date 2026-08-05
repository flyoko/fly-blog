import type {
	CheckDiagnosticDto,
	CheckSummaryDto,
	DeploymentDto,
	PullRequestDto,
	PullRequestFileDto,
} from '../../../../../shared/admin/publishing'
import type { Env } from '../../env'
import { ApiError } from '../../lib/api-error'
import { getInstallationToken } from '../../lib/github-app'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type TokenProvider = (env: Env) => Promise<{ token: string, expiresAt: string }>

interface GitTreeEntry {
	path?: string
	mode?: string
	type?: string
	sha?: string
}

interface GitHubPullResponse {
	number?: number
	html_url?: string
	title?: string
	state?: 'open' | 'closed'
	head?: { sha?: string, ref?: string }
	base?: { ref?: string }
	mergeable?: boolean | null
	merged?: boolean
}

interface GitHubCheckAnnotation {
	path?: string
	start_line?: number
	start_column?: number
	annotation_level?: 'notice' | 'warning' | 'failure'
	title?: string
	message?: string
	raw_details?: string
	blob_href?: string
}

const maxCheckDiagnostics = 50

const failedCheckConclusions = new Set([
	'action_required',
	'failure',
	'skipped_due_to_failure',
	'slow',
	'startup_failure',
	'timed_out',
])

const successfulCheckConclusions = new Set(['success', 'neutral', 'skipped'])

function assertRepositoryPath(path: string): string {
	if (
		!path
		|| path.startsWith('/')
		|| path.includes('\0')
		|| path.includes('\\')
		|| path.includes('//')
		|| path.split('/').includes('..')
	) {
		throw new ApiError('VALIDATION_FAILED', 400, 'Repository path is invalid')
	}
	return path
}

function assertBranchName(branch: string): string {
	if (!branch || branch.includes('\0') || branch.startsWith('/') || branch.endsWith('/') || branch.includes('..'))
		throw new ApiError('VALIDATION_FAILED', 400, 'Git branch name is invalid')
	return branch
}

function decodeUtf8Base64(value: string): string {
	const normalized = value.replace(/\s/gu, '')
	const binary = atob(normalized)
	const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
	return new TextDecoder().decode(bytes)
}

function encodeUtf8Base64(value: string): string {
	const bytes = new TextEncoder().encode(value)
	let binary = ''
	for (const byte of bytes)
		binary += String.fromCharCode(byte)
	return btoa(binary)
}

function mapPullRequest(payload: GitHubPullResponse): PullRequestDto {
	if (
		typeof payload.number !== 'number'
		|| typeof payload.html_url !== 'string'
		|| typeof payload.title !== 'string'
		|| (payload.state !== 'open' && payload.state !== 'closed')
		|| typeof payload.head?.sha !== 'string'
		|| typeof payload.head?.ref !== 'string'
		|| typeof payload.base?.ref !== 'string'
		|| typeof payload.merged !== 'boolean'
	) {
		throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid pull request')
	}
	return {
		number: payload.number,
		url: payload.html_url,
		title: payload.title,
		state: payload.state,
		headSha: payload.head.sha,
		headBranch: payload.head.ref,
		baseBranch: payload.base.ref,
		mergeable: payload.mergeable ?? null,
		merged: payload.merged,
	}
}

export class GitHubRepository {
	private readonly fetcher: Fetcher
	private readonly tokenProvider: TokenProvider

	constructor(
		private readonly env: Env,
		options: { fetcher?: Fetcher, tokenProvider?: TokenProvider } = {},
	) {
		this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
		this.tokenProvider = options.tokenProvider ?? getInstallationToken
	}

	async listFiles(prefix: string, ref: string): Promise<Array<{ path: string, sha: string }>> {
		const validPrefix = assertRepositoryPath(prefix.replace(/\/$/u, ''))
		const payload = await this.request<{ truncated?: boolean, tree?: GitTreeEntry[] }>(
			`/git/trees/${encodeURIComponent(assertBranchName(ref))}?recursive=1`,
		)
		if (payload.truncated)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub repository tree was truncated')
		if (!Array.isArray(payload.tree))
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid repository tree')
		return payload.tree
			.filter((entry): entry is GitTreeEntry & { path: string, sha: string } => (
				entry.type === 'blob'
				&& typeof entry.path === 'string'
				&& typeof entry.sha === 'string'
				&& (entry.path === validPrefix || entry.path.startsWith(`${validPrefix}/`))
			))
			.map(entry => ({ path: entry.path, sha: entry.sha }))
			.sort((left, right) => left.path.localeCompare(right.path))
	}

	async getFile(path: string, ref: string): Promise<{ path: string, sha: string, content: string }> {
		const validPath = assertRepositoryPath(path)
		const payload = await this.request<{
			type?: string
			path?: string
			sha?: string
			encoding?: string
			content?: string
		}>(`/contents/${validPath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(assertBranchName(ref))}`)
		if (
			payload.type !== 'file'
			|| typeof payload.path !== 'string'
			|| typeof payload.sha !== 'string'
			|| payload.encoding !== 'base64'
			|| typeof payload.content !== 'string'
		) {
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid file response')
		}
		return { path: payload.path, sha: payload.sha, content: decodeUtf8Base64(payload.content) }
	}

	async getBranchHead(branch: string): Promise<string> {
		const payload = await this.request<{ object?: { sha?: string } }>(
			`/git/ref/heads/${encodeURIComponent(assertBranchName(branch))}`,
		)
		if (!payload.object?.sha)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid branch reference')
		return payload.object.sha
	}

	async createAtomicCommit(input: {
		branch: string
		expectedHeadSha: string
		message: string
		files: Array<{ path: string, content: string | null }>
	}): Promise<{ commitSha: string }> {
		const branch = assertBranchName(input.branch)
		if (!input.expectedHeadSha || !input.message.trim() || input.files.length === 0)
			throw new ApiError('VALIDATION_FAILED', 400, 'Commit input is incomplete')

		const readRefPath = `/git/ref/heads/${encodeURIComponent(branch)}`
		const updateRefPath = `/git/refs/heads/${encodeURIComponent(branch)}`
		const ref = await this.request<{ object?: { sha?: string } }>(readRefPath)
		const currentHead = ref.object?.sha
		if (!currentHead)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid branch reference')
		if (currentHead !== input.expectedHeadSha)
			throw new ApiError('CONFLICT', 409, 'Repository branch changed since it was loaded')

		const commit = await this.request<{ tree?: { sha?: string } }>(`/git/commits/${encodeURIComponent(currentHead)}`)
		const baseTree = commit.tree?.sha
		if (!baseTree)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid commit tree')

		const tree: Array<{ path: string, mode: '100644', type: 'blob', sha: string | null }> = []
		for (const file of input.files) {
			const path = assertRepositoryPath(file.path)
			if (file.content === null) {
				tree.push({ path, mode: '100644', type: 'blob', sha: null })
				continue
			}
			const blob = await this.request<{ sha?: string }>('/git/blobs', {
				method: 'POST',
				body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
			})
			if (!blob.sha)
				throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub did not return a blob SHA')
			tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
		}

		const createdTree = await this.request<{ sha?: string }>('/git/trees', {
			method: 'POST',
			body: JSON.stringify({ base_tree: baseTree, tree }),
		})
		if (!createdTree.sha)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub did not return a tree SHA')
		const createdCommit = await this.request<{ sha?: string }>('/git/commits', {
			method: 'POST',
			body: JSON.stringify({
				message: input.message.trim(),
				tree: createdTree.sha,
				parents: [currentHead],
			}),
		})
		if (!createdCommit.sha)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub did not return a commit SHA')
		await this.request(updateRefPath, {
			method: 'PATCH',
			body: JSON.stringify({ sha: createdCommit.sha, force: false }),
		}, new Set([409, 422]))
		return { commitSha: createdCommit.sha }
	}

	async createBranch(input: { name: string, fromSha: string }): Promise<void> {
		const name = assertBranchName(input.name)
		if (!input.fromSha)
			throw new ApiError('VALIDATION_FAILED', 400, 'Branch source SHA is required')
		await this.request('/git/refs', {
			method: 'POST',
			body: JSON.stringify({ ref: `refs/heads/${name}`, sha: input.fromSha }),
		}, new Set([409, 422]))
	}

	async createFileCommit(input: { branch: string, expectedHeadSha: string, path: string, content: string, fileSha?: string, message: string }): Promise<{ commitSha: string }> {
		const branch = assertBranchName(input.branch)
		const path = assertRepositoryPath(input.path)
		const ref = await this.request<{ object?: { sha?: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`)
		if (ref.object?.sha !== input.expectedHeadSha)
			throw new ApiError('CONFLICT', 409, 'Repository branch changed since it was loaded')
		const payload = await this.request<{ commit?: { sha?: string } }>(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
			method: 'PUT',
			body: JSON.stringify({ message: input.message.trim(), content: encodeUtf8Base64(input.content), branch, ...(input.fileSha ? { sha: input.fileSha } : {}) }),
		}, new Set([409, 422]))
		if (!payload.commit?.sha)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub did not return a commit SHA')
		return { commitSha: payload.commit.sha }
	}

	async createPullRequest(input: { head: string, base: string, title: string, body: string }): Promise<{ number: number, url: string }> {
		const payload = await this.request<{ number?: number, html_url?: string }>('/pulls', {
			method: 'POST',
			body: JSON.stringify({
				head: assertBranchName(input.head),
				base: assertBranchName(input.base),
				title: input.title.trim(),
				body: input.body,
			}),
		}, new Set([409, 422]))
		if (typeof payload.number !== 'number' || typeof payload.html_url !== 'string')
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid pull request result')
		return { number: payload.number, url: payload.html_url }
	}

	async getPullRequest(number: number): Promise<PullRequestDto> {
		if (!Number.isInteger(number) || number < 1)
			throw new ApiError('VALIDATION_FAILED', 400, 'Pull request number is invalid')
		return mapPullRequest(await this.request<GitHubPullResponse>(`/pulls/${number}`))
	}

	async getPullRequestFiles(number: number): Promise<PullRequestFileDto[]> {
		if (!Number.isInteger(number) || number < 1)
			throw new ApiError('VALIDATION_FAILED', 400, 'Pull request number is invalid')
		const payload = await this.request<Array<{
			filename?: string
			status?: PullRequestFileDto['status']
			additions?: number
			deletions?: number
			changes?: number
			patch?: string
		}>>(`/pulls/${number}/files?per_page=100`)
		if (!Array.isArray(payload))
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned invalid pull request files')
		return payload.map((file) => {
			if (
				typeof file.filename !== 'string'
				|| !['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged'].includes(file.status ?? '')
				|| !Number.isInteger(file.additions)
				|| !Number.isInteger(file.deletions)
				|| !Number.isInteger(file.changes)
			) {
				throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid pull request file')
			}
			return {
				filename: assertRepositoryPath(file.filename),
				status: file.status!,
				additions: file.additions!,
				deletions: file.deletions!,
				changes: file.changes!,
				patch: typeof file.patch === 'string' ? file.patch.slice(0, 20_000) : null,
			}
		})
	}

	async mergePullRequest(number: number, expectedHeadSha: string): Promise<{ merged: boolean, sha?: string }> {
		const pullRequest = await this.getPullRequest(number)
		if (pullRequest.headSha !== expectedHeadSha)
			throw new ApiError('CONFLICT', 409, 'Pull request changed since it was reviewed')
		const payload = await this.request<{ merged?: boolean, sha?: string }>(`/pulls/${number}/merge`, {
			method: 'PUT',
			body: JSON.stringify({ sha: expectedHeadSha, merge_method: 'squash' }),
		}, new Set([405, 409, 422]))
		return { merged: payload.merged === true, ...(payload.sha ? { sha: payload.sha } : {}) }
	}

	async getChecks(ref: string, resourcePath?: string): Promise<CheckSummaryDto> {
		const payload = await this.request<{
			total_count?: number
			check_runs?: Array<{ id?: number, name?: string, status?: string, conclusion?: string | null, html_url?: string }>
		}>(`/commits/${encodeURIComponent(assertBranchName(ref))}/check-runs?per_page=100`)
		if (!Array.isArray(payload.check_runs))
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned invalid check runs')

		let successful = 0
		let failed = 0
		let pending = 0
		for (const check of payload.check_runs) {
			if (check.status !== 'completed' || !check.conclusion) {
				pending++
			}
			else if (failedCheckConclusions.has(check.conclusion)) {
				failed++
			}
			else if (successfulCheckConclusions.has(check.conclusion)) {
				successful++
			}
			else {
				pending++
			}
		}

		const diagnostics: CheckDiagnosticDto[] = []
		let frontmatterLines = 0
		if (failed > 0 && resourcePath) {
			try {
				const article = await this.getFile(resourcePath, ref)
				const lines = article.content.split('\n')
				if (lines[0]?.trim() === '---') {
					const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
					frontmatterLines = end >= 0 ? end + 1 : 0
				}
			}
			catch {
				frontmatterLines = 0
			}
		}

		for (const check of payload.check_runs) {
			if (diagnostics.length >= maxCheckDiagnostics)
				break
			if (!check.id || !failedCheckConclusions.has(check.conclusion ?? ''))
				continue
			try {
				let page = 1
				while (diagnostics.length < maxCheckDiagnostics) {
					const annotations = await this.request<GitHubCheckAnnotation[]>(
						`/check-runs/${check.id}/annotations?per_page=100&page=${page}`,
					)
					if (!Array.isArray(annotations))
						throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned invalid check annotations')

					for (const annotation of annotations) {
						if (diagnostics.length >= maxCheckDiagnostics)
							break
						if (!annotation.message)
							continue

						const startLine = annotation.start_line
						const belongsToArticleBody = annotation.path === resourcePath
							&& startLine !== undefined
							&& frontmatterLines > 0
							&& startLine > frontmatterLines
						diagnostics.push({
							checkName: check.name ?? 'GitHub Check',
							path: annotation.path,
							line: annotation.start_line,
							column: annotation.start_column,
							level: annotation.annotation_level,
							rule: annotation.title,
							message: annotation.message,
							rawDetails: annotation.raw_details,
							detailsUrl: annotation.blob_href ?? check.html_url,
							...(belongsToArticleBody
								? {
										bodyLine: startLine - frontmatterLines,
										...(annotation.start_column ? { bodyColumn: annotation.start_column } : {}),
									}
								: {}),
						})
					}

					if (annotations.length < 100 || diagnostics.length >= maxCheckDiagnostics)
						break
					page++
				}
			}
			catch {
				continue
			}
		}

		return {
			status: failed > 0 ? 'failure' : pending > 0 ? 'pending' : 'success',
			total: payload.check_runs.length,
			successful,
			failed,
			pending,
			...(diagnostics.length ? { diagnostics } : {}),
		}
	}

	async getCommitChangeCount(ref: string): Promise<number> {
		const payload = await this.request<{ files?: unknown[] }>(
			`/commits/${encodeURIComponent(assertBranchName(ref))}`,
		)
		if (!Array.isArray(payload.files))
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned invalid commit details')
		return payload.files.length
	}

	async getDeployment(ref: string): Promise<DeploymentDto | null> {
		const validRef = assertBranchName(ref)
		const queryKey = /^[a-f0-9]{40}$/iu.test(validRef) ? 'sha' : 'ref'
		const deployments = await this.request<Array<{
			id?: number
			ref?: string
			environment?: string
			created_at?: string
		}>>(`/deployments?${queryKey}=${encodeURIComponent(validRef)}&per_page=20`)
		let healthFallback: DeploymentDto | null = null
		for (const deployment of deployments) {
			if (typeof deployment.id !== 'number')
				continue
			const statuses = await this.request<Array<{
				state?: string
				environment_url?: string
				target_url?: string
				updated_at?: string
			}>>(`/deployments/${deployment.id}/statuses?per_page=10`)
			const latest = statuses.find((status) => {
				const url = status.environment_url || status.target_url
				return status.state !== 'inactive' && Boolean(url)
			})
			const url = latest?.environment_url || latest?.target_url
			if (!latest || !url)
				continue
			const status: DeploymentDto['status'] = latest.state === 'success'
				? 'success'
				: ['error', 'failure'].includes(latest.state ?? '')
						? 'failure'
						: 'pending'
			const result: DeploymentDto = {
				id: deployment.id.toString(),
				ref: deployment.ref ?? ref,
				environment: deployment.environment ?? 'unknown',
				url,
				status,
				updatedAt: latest.updated_at ?? deployment.created_at ?? new Date(0).toISOString(),
			}
			if (new URL(url).pathname === '/api/health') {
				healthFallback ??= result
				continue
			}
			return result
		}
		return healthFallback
	}

	private async request<T = unknown>(
		path: string,
		init: RequestInit = {},
		conflictStatuses: Set<number> = new Set(),
	): Promise<T> {
		const { token } = await this.tokenProvider(this.env)
		const response = await this.fetcher(`${this.repositoryUrl()}${path}`, {
			...init,
			headers: {
				'accept': 'application/vnd.github+json',
				'authorization': `Bearer ${token}`,
				'content-type': 'application/json',
				'user-agent': 'fly-living-admin',
				'x-github-api-version': '2022-11-28',
				...init.headers,
			},
		})
		if (!response.ok) {
			if (conflictStatuses.has(response.status))
				throw new ApiError('CONFLICT', 409, 'GitHub rejected the repository update')
			if (response.status === 404)
				throw new ApiError('NOT_FOUND', 404, 'GitHub repository resource was not found')
			throw new ApiError('UPSTREAM_FAILED', 502, `GitHub request failed with status ${response.status}`)
		}
		if (response.status === 204)
			return undefined as T
		return await response.json() as T
	}

	private repositoryUrl(): string {
		return `${this.env.GITHUB_API_BASE_URL}/repos/${encodeURIComponent(this.env.GITHUB_OWNER)}/${encodeURIComponent(this.env.GITHUB_REPO)}`
	}
}
