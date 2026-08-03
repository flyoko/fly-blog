import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('public site smoke', async () => {
	await setup({
		rootDir: fileURLToPath(new URL('../..', import.meta.url)),
		server: true,
	})

	it('renders the existing home page', async () => {
		const html = await $fetch<string>('/')
		expect(html).toContain('fly living')
	})
})
