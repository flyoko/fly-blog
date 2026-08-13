import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../..', import.meta.url))

interface WorkflowJob {
	environment?: { name?: string, url?: string }
	if?: unknown
	needs?: unknown
	outputs?: Record<string, unknown>
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
		expect(source).toContain('pnpm verify:pages')
		expect(source).not.toContain('\n      - run: pnpm verify\n')
		expect(source).toContain('id: deploy')
	})

	it('runs pull-request quality checks in parallel after a lightweight article route decision', async () => {
		const { source, document } = await workflow('.github/workflows/quality.yml')
		const jobs = document.jobs ?? {}
		const routeJob = jobs.article_fast_path
		const verifyJob = jobs.verify
		const mobileJob = jobs['mobile-quality']

		expect(Object.keys(jobs)).toEqual(['article_fast_path', 'verify', 'mobile-quality'])
		expect(routeJob).toBeTruthy()
		expect(verifyJob).toBeTruthy()
		expect(mobileJob).toBeTruthy()
		if (!routeJob || !verifyJob || !mobileJob)
			throw new Error('quality jobs missing')
		expect(source).toContain('pull_request:')
		expect(source).toContain('workflow_dispatch:')
		expect(source).not.toContain('\n  push:')
		expect(routeJob.outputs).toHaveProperty('eligible')
		expect(verifyJob.needs).toBe('article_fast_path')
		expect(mobileJob.needs).toBe('article_fast_path')
		expect(source).toContain('needs.article_fast_path.outputs.eligible != \'true\'')
		expect(source).toContain('id: detect')
		expect(source).toContain('startsWith(github.head_ref, \'admin/article/\')')
		expect(source).toContain('bash scripts/is-article-fast-path.sh')
		expect(source).toContain('pnpm lint')
		expect(source).toContain('pnpm typecheck')
		expect(source).toContain('pnpm test:unit')
		expect(source).toContain('pnpm test:workers')
		expect(source).toContain('pnpm generate')
	})

	it('runs source and Pages build gates in parallel before production deployment', async () => {
		const { source, document } = await workflow('.github/workflows/pages-production.yml')
		const jobs = document.jobs ?? {}
		const sourceJob = jobs.source_quality
		const buildJob = jobs.build_pages
		const deployJob = jobs.deploy_production
		const packageJson = JSON.parse(await readFile(`${root}/package.json`, 'utf8')) as { scripts: Record<string, string> }

		expect(Object.keys(jobs)).toEqual(['source_quality', 'build_pages', 'deploy_production'])
		expect(sourceJob).toBeTruthy()
		expect(buildJob).toBeTruthy()
		expect(deployJob).toBeTruthy()
		if (!sourceJob || !buildJob || !deployJob)
			throw new Error('production jobs missing')
		expect(packageJson.scripts['verify:pages-source']).toBe('pnpm lint && nuxt typecheck && pnpm test:unit')
		expect(packageJson.scripts['verify:pages']).toBe('pnpm generate && pnpm check:smoke && pnpm check:links && pnpm check:secrets')
		expect(source).toContain('cancel-in-progress: true')
		expect(source).toContain('- \'workers/**\'')
		expect(source).toContain('- \'test/**\'')
		expect(source).toContain('- \'e2e/**\'')
		expect(source).toContain('pnpm verify:pages-source')
		expect(source).toContain('pnpm verify:pages')
		expect(source).toContain('actions/upload-artifact@v4')
		expect(source).toContain('actions/download-artifact@v4')
		expect(deployJob.needs).toEqual(['source_quality', 'build_pages'])
		expect(source).toContain('pages deploy .output/public --project-name=fly-living --branch=main')
		expect(source).toContain('pnpm check:production')
		expect(source).not.toContain('\n      - run: pnpm verify\n')
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
