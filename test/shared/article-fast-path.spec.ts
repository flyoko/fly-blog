import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const script = `${root}/scripts/is-article-fast-path.sh`
const configScript = `${root}/scripts/is-admin-config-fast-path.sh`

function classify(paths: string[]) {
	const result = spawnSync('bash', [script, ...paths], { encoding: 'utf8' })
	return {
		status: result.status,
		stdout: result.stdout.trim(),
		stderr: result.stderr.trim(),
	}
}

function classifyConfig(branch: string, path: string) {
	const result = spawnSync('bash', [configScript, branch, path], { encoding: 'utf8' })
	return {
		status: result.status,
		stdout: result.stdout.trim(),
		stderr: result.stderr.trim(),
	}
}

describe('article pull request fast path', () => {
	it('accepts exactly one normalized article markdown path', () => {
		expect(classify(['content/posts/2026/hello-world.md'])).toEqual({
			status: 0,
			stdout: 'content/posts/2026/hello-world.md',
			stderr: '',
		})
	})

	it('rejects article presentation config so the workflow can fall back to full verification', () => {
		expect(classify(['config/site/article.json']).status).toBe(1)
	})

	it('rejects multiple files and malformed article paths', () => {
		expect(classify([
			'content/posts/2026/hello.md',
			'content/posts/2026/world.md',
		]).status).toBe(1)
		expect(classify(['content/posts/2026/Hello_World.md']).status).toBe(1)
	})
})

describe('admin config mobile visual exemption', () => {
	const validCases = [
		['article', 'config/site/article.json'],
		['categories', 'config/taxonomy/categories.json'],
		['navigation', 'config/site/navigation.json'],
		['footer', 'config/site/footer.json'],
		['modules', 'config/site/modules.json'],
		['weather', 'config/site/weather.json'],
		['newsSources', 'config/news/sources.json'],
		['aboutTimeline', 'config/about/timeline.json'],
		['aboutLinks', 'config/about/links.json'],
	] as const

	it.each(validCases)('accepts %s only for its fixed config path', (kind, path) => {
		expect(classifyConfig(`admin/config/${kind}/20260825-120000-abc123`, path)).toEqual({
			status: 0,
			stdout: path,
			stderr: '',
		})
	})

	it('fails closed for wrong branches, unknown kinds, and path mismatches', () => {
		expect(classifyConfig('feature/about', 'config/about/timeline.json').status).toBe(1)
		expect(classifyConfig('admin/config/unknown/20260825-120000-abc123', 'config/about/timeline.json').status).toBe(1)
		expect(classifyConfig('admin/config/aboutTimeline/20260825-120000-abc123', 'config/site/footer.json').status).toBe(1)
		expect(classifyConfig('admin/config/aboutTimeline/not-a-publish-branch', 'config/about/timeline.json').status).toBe(1)
	})
})
