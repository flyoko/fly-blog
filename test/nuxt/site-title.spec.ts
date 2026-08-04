import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('site title template', () => {
	it('uses a function fallback so an empty page title never exposes template placeholders', () => {
		const app = read('app/app.vue')
		const nuxt = read('nuxt.config.ts')

		expect(nuxt).toContain('title: blogConfig.title')
		expect(nuxt).not.toContain('%separator')
		expect(nuxt).not.toContain('templateParams:')
		expect(app).toContain('titleTemplate: titleChunk => titleChunk')
		expect(app).toMatch(/`\$\{titleChunk\} \| \$\{appConfig\.title\}`/u)
		expect(app).toContain(': appConfig.title')
	})
})
