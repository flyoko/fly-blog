import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/nuxt/**/*.spec.ts', 'test/shared/**/*.spec.ts'],
		restoreMocks: true,
	},
})
