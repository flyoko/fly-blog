import type { Env } from '../src/env'
import { describe, expect, it, vi } from 'vitest'
import { GitHubRepository } from '../src/features/articles/github-repository'

function createEnv(): Env {
	return {
		GITHUB_API_BASE_URL: 'https://api.github.test',
		GITHUB_OAUTH_BASE_URL: 'https://github.test',
		GITHUB_OWNER: 'flyoko',
		GITHUB_REPO: 'fly-blog',
		GITHUB_DEFAULT_BRANCH: 'setup/personalize',
	} as Env
}

function json(body: unknown, status = 200) {
	return Response.json(body, { status })
}

function encodeUtf8Base64(value: string) {
	const bytes = new TextEncoder().encode(value)
	let binary = ''
	for (const byte of bytes)
		binary += String.fromCharCode(byte)
	return btoa(binary)
}

function decodeUtf8Base64(value: string) {
	const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0))
	return new TextDecoder().decode(bytes)
}

function createRepository(responses: Array<Response | ((request: Request) => Response | Promise<Response>)>) {
	const requests: Request[] = []
	const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(input, init)
		requests.push(request.clone())
		const next = responses.shift()
		if (!next)
			throw new Error(`Unexpected GitHub request: ${request.method} ${request.url}`)
		return typeof next === 'function' ? next(request) : next
	})
	const repository = new GitHubRepository(createEnv(), {
		fetcher,
		tokenProvider: async () => ({ token: 'installation-token', expiresAt: '2099-01-01T00:00:00.000Z' }),
	})
	return { repository, requests, fetcher }
}

describe('gitHubRepository reads', () => {
	it('binds the default Workers fetch implementation to globalThis', async () => {
		const fetcher = vi.fn(function (this: unknown) {
			expect(this).toBe(globalThis)
			return Promise.resolve(json({ object: { sha: 'head-sha' } }))
		})
		vi.stubGlobal('fetch', fetcher)
		try {
			const repository = new GitHubRepository(createEnv(), {
				tokenProvider: async () => ({ token: 'installation-token', expiresAt: '2099-01-01T00:00:00.000Z' }),
			})
			await expect(repository.getBranchHead('main')).resolves.toBe('head-sha')
			expect(fetcher).toHaveBeenCalledOnce()
		}
		finally {
			vi.unstubAllGlobals()
		}
	})

	it('lists blob files under a prefix using installation-token headers', async () => {
		const { repository, requests } = createRepository([
			json({
				truncated: false,
				tree: [
					{ path: 'content/posts/2026/hello.md', type: 'blob', sha: 'a' },
					{ path: 'content/posts/2026', type: 'tree', sha: 'b' },
					{ path: 'README.md', type: 'blob', sha: 'c' },
				],
			}),
		])
		await expect(repository.listFiles('content/posts/', 'setup/personalize')).resolves.toEqual([
			{ path: 'content/posts/2026/hello.md', sha: 'a' },
		])
		const request = requests[0]!
		expect(request.url).toContain('/repos/flyoko/fly-blog/git/trees/setup%2Fpersonalize?recursive=1')
		expect(request.headers.get('authorization')).toBe('Bearer installation-token')
		expect(request.headers.get('x-github-api-version')).toBe('2022-11-28')
	})

	it('decodes UTF-8 file content', async () => {
		const content = '你好，世界\n'
		const encoded = btoa(unescape(encodeURIComponent(content)))
		const { repository } = createRepository([
			json({ type: 'file', path: 'content/posts/2026/hello.md', sha: 'abc', encoding: 'base64', content: encoded }),
		])
		await expect(repository.getFile('content/posts/2026/hello.md', 'main')).resolves.toEqual({
			path: 'content/posts/2026/hello.md',
			sha: 'abc',
			content,
		})
	})
})

describe('gitHubRepository atomic commits', () => {
	it('creates blobs, a tree and commit, then updates the ref without force', async () => {
		const { repository, requests } = createRepository([
			json({ object: { sha: 'head-sha' } }),
			json({ sha: 'head-sha', tree: { sha: 'base-tree' } }),
			json({ sha: 'blob-1' }, 201),
			json({ sha: 'new-tree' }, 201),
			json({ sha: 'new-commit' }, 201),
			json({ object: { sha: 'new-commit' } }),
		])
		await expect(repository.createAtomicCommit({
			branch: 'setup/personalize',
			expectedHeadSha: 'head-sha',
			message: '发布文章',
			files: [
				{ path: 'content/posts/2026/hello.md', content: '# Hello' },
				{ path: 'content/posts/2026/old.md', content: null },
			],
		})).resolves.toEqual({ commitSha: 'new-commit' })

		const blobBody = await requests[2]!.json() as Record<string, unknown>
		expect(blobBody).toEqual({ content: '# Hello', encoding: 'utf-8' })
		const treeBody = await requests[3]!.json() as { base_tree: string, tree: Array<Record<string, unknown>> }
		expect(treeBody.base_tree).toBe('base-tree')
		expect(treeBody.tree).toEqual([
			{ path: 'content/posts/2026/hello.md', mode: '100644', type: 'blob', sha: 'blob-1' },
			{ path: 'content/posts/2026/old.md', mode: '100644', type: 'blob', sha: null },
		])
		expect(requests[5]!.url).toContain('/git/refs/heads/setup%2Fpersonalize')
		const updateBody = await requests[5]!.json() as Record<string, unknown>
		expect(updateBody).toEqual({ sha: 'new-commit', force: false })
	})

	it('rejects a stale expected head before creating blobs', async () => {
		const { repository, fetcher } = createRepository([
			json({ object: { sha: 'newer-head' } }),
		])
		await expect(repository.createAtomicCommit({
			branch: 'main',
			expectedHeadSha: 'stale-head',
			message: 'stale',
			files: [{ path: 'content/posts/2026/hello.md', content: '# Hello' }],
		})).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it('maps a non-fast-forward ref update to conflict', async () => {
		const { repository } = createRepository([
			json({ object: { sha: 'head-sha' } }),
			json({ sha: 'head-sha', tree: { sha: 'base-tree' } }),
			json({ sha: 'blob-1' }, 201),
			json({ sha: 'new-tree' }, 201),
			json({ sha: 'new-commit' }, 201),
			json({ message: 'Reference update failed' }, 422),
		])
		await expect(repository.createAtomicCommit({
			branch: 'main',
			expectedHeadSha: 'head-sha',
			message: 'publish',
			files: [{ path: 'content/posts/2026/hello.md', content: '# Hello' }],
		})).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
	})
})

describe('gitHubRepository single-file commits', () => {
	it('uses the Contents API with UTF-8 Base64 and the existing file SHA', async () => {
		const content = '你好，emoji 😀\n第二行\n'
		const { repository, requests } = createRepository([
			json({ object: { sha: 'head-sha' } }),
			json({ commit: { sha: 'content-commit' } }, 201),
		])

		await expect(repository.createFileCommit({
			branch: 'admin/article/test',
			expectedHeadSha: 'head-sha',
			path: 'content/posts/2026/hello.md',
			content,
			fileSha: 'existing-blob-sha',
			message: '发布文章：你好',
		})).resolves.toEqual({ commitSha: 'content-commit' })

		expect(requests).toHaveLength(2)
		expect(requests[1]!.method).toBe('PUT')
		expect(requests[1]!.url).toContain('/contents/content/posts/2026/hello.md')
		const body = await requests[1]!.json() as {
			message: string
			content: string
			branch: string
			sha: string
		}
		expect(body).toMatchObject({
			message: '发布文章：你好',
			branch: 'admin/article/test',
			sha: 'existing-blob-sha',
		})
		expect(decodeUtf8Base64(body.content)).toBe(content)
	})

	it('omits the file SHA for a new article', async () => {
		const { repository, requests } = createRepository([
			json({ object: { sha: 'head-sha' } }),
			json({ commit: { sha: 'new-commit' } }, 201),
		])

		await repository.createFileCommit({
			branch: 'admin/article/new',
			expectedHeadSha: 'head-sha',
			path: 'content/posts/2026/new.md',
			content: '# New',
			message: '发布文章：New',
		})

		const body = await requests[1]!.json() as Record<string, unknown>
		expect(body).not.toHaveProperty('sha')
	})

	it('rejects a stale branch before writing the file', async () => {
		const { repository, fetcher } = createRepository([
			json({ object: { sha: 'newer-head' } }),
		])

		await expect(repository.createFileCommit({
			branch: 'main',
			expectedHeadSha: 'stale-head',
			path: 'content/posts/2026/hello.md',
			content: '# Hello',
			message: '发布文章',
		})).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
		expect(fetcher).toHaveBeenCalledTimes(1)
	})
})

describe('gitHubRepository reviews and status', () => {
	it('creates branches and pull requests', async () => {
		const { repository, requests } = createRepository([
			json({ ref: 'refs/heads/admin/change' }, 201),
			json({ number: 12, html_url: 'https://github.test/pr/12' }, 201),
		])
		await repository.createBranch({ name: 'admin/change', fromSha: 'abc' })
		await expect(repository.createPullRequest({
			head: 'admin/change',
			base: 'main',
			title: 'Change config',
			body: 'Details',
		})).resolves.toEqual({ number: 12, url: 'https://github.test/pr/12' })
		expect(await requests[0]!.json()).toEqual({ ref: 'refs/heads/admin/change', sha: 'abc' })
	})

	it('closes a pull request with a bounded GitHub update', async () => {
		const { repository, requests } = createRepository([
			json({
				number: 12,
				html_url: 'https://github.test/pr/12',
				title: 'Change config',
				state: 'closed',
				head: { sha: 'head-sha', ref: 'admin/change' },
				base: { ref: 'main' },
				mergeable: false,
				merged: false,
			}),
		])

		await expect(repository.closePullRequest(12)).resolves.toBeUndefined()

		expect(requests[0]!.method).toBe('PATCH')
		expect(requests[0]!.url).toContain('/pulls/12')
		expect(await requests[0]!.json()).toEqual({ state: 'closed' })
	})

	it('lists pull request files with bounded structured patches', async () => {
		const longPatch = `@@ -1 +1 @@\n-${'a'.repeat(25_000)}\n+new`
		const { repository, requests } = createRepository([
			json([{
				filename: 'config/site/footer.json',
				status: 'modified',
				additions: 3,
				deletions: 2,
				changes: 5,
				patch: longPatch,
			}]),
		])
		const files = await repository.getPullRequestFiles(12)
		expect(files).toHaveLength(1)
		expect(files[0]).toMatchObject({
			filename: 'config/site/footer.json',
			status: 'modified',
			additions: 3,
			deletions: 2,
			changes: 5,
		})
		expect(files[0]!.patch).toHaveLength(20_000)
		expect(requests[0]!.url).toContain('/pulls/12/files?per_page=100')
	})

	it('reads and merges a pull request only at the expected head', async () => {
		const pull = {
			number: 12,
			html_url: 'https://github.test/pr/12',
			title: 'Change config',
			state: 'open',
			head: { sha: 'head-sha', ref: 'admin/change' },
			base: { ref: 'main' },
			mergeable: true,
			merged: false,
		}
		const { repository, requests } = createRepository([
			json(pull),
			json({ merged: true, sha: 'merge-sha' }),
		])
		await expect(repository.mergePullRequest(12, 'head-sha')).resolves.toEqual({ merged: true, sha: 'merge-sha' })
		expect(await requests[1]!.json()).toMatchObject({ sha: 'head-sha', merge_method: 'squash' })
	})

	it('aggregates check runs and extracts the latest deployment URL', async () => {
		const { repository, requests } = createRepository([
			json({
				total_count: 3,
				check_runs: [
					{ status: 'completed', conclusion: 'success' },
					{ status: 'completed', conclusion: 'neutral' },
					{ status: 'in_progress', conclusion: null },
				],
			}),
			json([{ id: 9, ref: 'feature', environment: 'Preview', created_at: '2026-08-03T00:00:00Z' }]),
			json([{ state: 'success', environment_url: 'https://preview.example.test', updated_at: '2026-08-03T01:00:00Z' }]),
		])
		await expect(repository.getChecks('feature')).resolves.toEqual({
			status: 'pending',
			total: 3,
			successful: 2,
			failed: 0,
			pending: 1,
		})
		await expect(repository.getDeployment('feature')).resolves.toEqual({
			id: '9',
			ref: 'feature',
			environment: 'Preview',
			url: 'https://preview.example.test',
			status: 'success',
			updatedAt: '2026-08-03T01:00:00Z',
		})
		expect(requests[1]!.url).toContain('/deployments?ref=feature&per_page=20')
	})

	it('maps failed check annotations to article-body positions with a bounded payload', async () => {
		const path = 'content/posts/2026/hello.md'
		const source = '---\ntitle: Hello\ncategories: []\ntags: []\n---\n第一行\n***标题 ***\n'
		const annotations = Array.from({ length: 100 }, (_, index) => ({
			path,
			start_line: 7,
			start_column: 7,
			annotation_level: 'failure' as const,
			title: `markdown/rule-${index}`,
			message: `格式错误 ${index}`,
			raw_details: `修复建议 ${index}`,
			blob_href: `https://github.test/blob/${index}`,
		}))
		const { repository, requests } = createRepository([
			json({
				total_count: 1,
				check_runs: [{
					id: 77,
					name: 'deploy-preview',
					status: 'completed',
					conclusion: 'failure',
					html_url: 'https://github.test/actions/jobs/77',
				}],
			}),
			json({ type: 'file', path, sha: 'article-sha', encoding: 'base64', content: encodeUtf8Base64(source) }),
			json(annotations),
		])

		const summary = await repository.getChecks('feature', path)
		expect(summary).toMatchObject({
			status: 'failure',
			total: 1,
			successful: 0,
			failed: 1,
			pending: 0,
		})
		expect(summary.diagnostics).toHaveLength(50)
		expect(summary.diagnostics?.at(-1)).toEqual({
			checkName: 'deploy-preview',
			path,
			line: 7,
			column: 7,
			bodyLine: 2,
			bodyColumn: 7,
			level: 'failure',
			rule: 'markdown/rule-49',
			message: '格式错误 49',
			rawDetails: '修复建议 49',
			detailsUrl: 'https://github.test/blob/49',
		})
		expect(requests).toHaveLength(3)
		expect(requests[2]!.url).toContain('/check-runs/77/annotations?per_page=100&page=1')
	})

	it('does not read article source or annotations before a check fails', async () => {
		const path = 'content/posts/2026/hello.md'
		const { repository, requests } = createRepository([
			json({
				total_count: 2,
				check_runs: [
					{ status: 'completed', conclusion: 'success' },
					{ status: 'in_progress', conclusion: null },
				],
			}),
		])

		await expect(repository.getChecks('feature', path)).resolves.toMatchObject({
			status: 'pending',
			failed: 0,
		})
		expect(requests).toHaveLength(1)
	})

	it('keeps frontmatter annotations out of article-body coordinates', async () => {
		const path = 'content/posts/2026/hello.md'
		const source = '---\ntitle: Hello\ncategories: []\ntags: []\n---\n正文\n'
		const { repository } = createRepository([
			json({
				total_count: 1,
				check_runs: [{ id: 79, name: 'verify', status: 'completed', conclusion: 'failure' }],
			}),
			json({ type: 'file', path, sha: 'article-sha', encoding: 'base64', content: encodeUtf8Base64(source) }),
			json([{
				path,
				start_line: 2,
				start_column: 1,
				annotation_level: 'failure',
				message: 'Title is invalid',
			}]),
		])

		const summary = await repository.getChecks('feature', path)
		expect(summary.diagnostics?.[0]).toMatchObject({ path, line: 2, column: 1 })
		expect(summary.diagnostics?.[0]).not.toHaveProperty('bodyLine')
		expect(summary.diagnostics?.[0]).not.toHaveProperty('bodyColumn')
	})

	it('keeps the failed status when annotation retrieval is unavailable', async () => {
		const { repository } = createRepository([
			json({
				total_count: 1,
				check_runs: [{ id: 88, name: 'verify', status: 'completed', conclusion: 'failure' }],
			}),
			json({ message: 'temporarily unavailable' }, 500),
		])

		await expect(repository.getChecks('feature')).resolves.toEqual({
			status: 'failure',
			total: 1,
			successful: 0,
			failed: 1,
			pending: 0,
		})
	})

	it('keeps cancelled and stale checks pending instead of reporting a false failure', async () => {
		const { repository } = createRepository([
			json({
				total_count: 3,
				check_runs: [
					{ status: 'completed', conclusion: 'success' },
					{ status: 'completed', conclusion: 'cancelled' },
					{ status: 'completed', conclusion: 'stale' },
				],
			}),
		])

		await expect(repository.getChecks('main')).resolves.toEqual({
			status: 'pending',
			total: 3,
			successful: 1,
			failed: 0,
			pending: 2,
		})
	})

	it('queries deployments by sha, ignores inactive states, and prefers the site over health checks', async () => {
		const sha = 'a'.repeat(40)
		const { repository, requests } = createRepository([
			json([
				{ id: 10, ref: 'main', environment: 'production', created_at: '2026-08-03T00:02:00Z' },
				{ id: 11, ref: 'main', environment: 'production', created_at: '2026-08-03T00:01:00Z' },
			]),
			json([
				{ state: 'inactive', environment_url: 'https://github.test/actions/health', updated_at: '2026-08-03T02:00:00Z' },
				{ state: 'success', environment_url: 'https://blog.example.test/api/health', updated_at: '2026-08-03T01:00:00Z' },
			]),
			json([
				{ state: 'inactive', environment_url: 'https://github.test/actions/pages', updated_at: '2026-08-03T02:00:00Z' },
				{ state: 'success', environment_url: 'https://production.example.test', updated_at: '2026-08-03T01:00:00Z' },
			]),
		])

		await expect(repository.getDeployment(sha)).resolves.toMatchObject({
			id: '11',
			ref: 'main',
			environment: 'production',
			url: 'https://production.example.test',
			status: 'success',
		})
		expect(requests[0]!.url).toContain(`/deployments?sha=${sha}&per_page=20`)
		expect(requests[1]!.url).toContain('/deployments/10/statuses?per_page=10')
	})

	it('reads commit change counts for no-op direct publishes', async () => {
		const sha = 'b'.repeat(40)
		const { repository, requests } = createRepository([json({ files: [] })])
		await expect(repository.getCommitChangeCount(sha)).resolves.toBe(0)
		expect(requests[0]!.url).toContain(`/commits/${sha}`)
	})
})
