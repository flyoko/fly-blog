import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../..', import.meta.url))

interface WorkflowJob {
	environment?: { name?: string, url?: string }
	if?: unknown
}

interface WorkflowDocument {
	jobs?: Record<string, WorkflowJob>
}

async function workflow(path: string) {
	const source = await readFile(`${root}/${path}`, 'utf8')
	return { source, document: parse(source) as WorkflowDocument }
}

describe('文章发布工作流', () => {
	it('keeps the deploy-preview job and pages-preview deployment while using an article fast path', async () => {
		const { source, document } = await workflow('.github/workflows/pages-preview.yml')
		const jobs = document.jobs ?? {}
		const job = jobs['deploy-preview']

		expect(job).toBeTruthy()
		if (!job)
			throw new Error('deploy-preview job missing')
		expect(Object.keys(jobs)).toEqual(['deploy-preview'])
		expect(job.environment).toMatchObject({ name: 'pages-preview' })
		expect(job.environment?.url).toContain('steps.deploy.outputs.pages-deployment-alias-url')
		expect(source).toContain('fetch-depth: 2')
		expect(source).toContain('HEAD^1 HEAD^2')
		expect(source).not.toContain('HEAD^1...HEAD^2')
		expect(source).toContain('id: article-fast-path')
		expect(source).toContain('startsWith(github.head_ref, \'admin/article/\')')
		expect(source).toContain('bash scripts/is-article-fast-path.sh')
		expect(source).not.toContain('mapfile')
		expect(source).toContain('steps.article-fast-path.outputs.eligible == \'true\'')
		expect(source).toContain('steps.article-fast-path.outputs.eligible != \'true\'')
		expect(source).toContain('pnpm exec eslint "$ARTICLE_PATH"')
		expect(source).toContain('export NUXT_ARTICLE_PREVIEW=1')
		expect(source).toContain('pnpm generate')
		expect(source).toContain('pnpm check:smoke')
		expect(source).toContain('pnpm check:links')
		expect(source).toContain('pnpm check:secrets')
		expect(source).toContain('pnpm verify')
		expect(source).toContain('id: deploy')
	})

	it('keeps the verify job successful for article PRs and the full checks for other changes', async () => {
		const { source, document } = await workflow('.github/workflows/quality.yml')
		const jobs = document.jobs ?? {}
		const job = jobs.verify

		expect(job).toBeTruthy()
		if (!job)
			throw new Error('verify job missing')
		expect(Object.keys(jobs)).toEqual(['verify'])
		expect(job).not.toHaveProperty('if')
		expect(source).toContain('检测文章 PR 快路径')
		expect(source).toContain('fetch-depth: 2')
		expect(source).toContain('HEAD^1 HEAD^2')
		expect(source).not.toContain('HEAD^1...HEAD^2')
		expect(source).toContain('id: article-fast-path')
		expect(source).toContain('startsWith(github.head_ref, \'admin/article/\')')
		expect(source).toContain('bash scripts/is-article-fast-path.sh')
		expect(source).not.toContain('mapfile')
		expect(source).toContain('steps.article-fast-path.outputs.eligible != \'true\'')
		expect(source).toContain('pnpm lint')
		expect(source).toContain('pnpm typecheck')
		expect(source).toContain('pnpm test:unit')
		expect(source).toContain('pnpm test:workers')
		expect(source).toContain('pnpm generate')
		expect(source).toContain('pnpm check:smoke')
		expect(source).toContain('pnpm check:links')
		expect(source).toContain('pnpm check:secrets')
	})
	it('isolates pnpm setup per runner for concurrent self-hosted jobs', async () => {
		const workflowPaths = [
			'.github/workflows/quality.yml',
			'.github/workflows/pages-preview.yml',
			'.github/workflows/pages-production.yml',
			'.github/workflows/workers-production.yml',
		]

		const isolatedPnpmDest = 'dest: $' + '{{ runner.temp }}/setup-pnpm'
		for (const workflowPath of workflowPaths) {
			const { source } = await workflow(workflowPath)
			expect(source).toContain(isolatedPnpmDest)
			expect(source).not.toContain('dest: ~/setup-pnpm')
		}
	})
})
