import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const script = `${root}/scripts/is-article-fast-path.sh`

function classify(paths: string[]) {
	const result = spawnSync('bash', [script, ...paths], { encoding: 'utf8' })
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
