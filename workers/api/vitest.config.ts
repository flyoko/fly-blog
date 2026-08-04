import { fileURLToPath, URL as NodeURL } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const migrationsPath = fileURLToPath(new NodeURL('./migrations', import.meta.url))
const testMigrations = await readD1Migrations(migrationsPath)

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				bindings: { TEST_MIGRATIONS: testMigrations },
			},
			wrangler: {
				configPath: './wrangler.jsonc',
			},
		}),
	],
	test: {
		include: ['test/**/*.spec.ts'],
		restoreMocks: true,
		testTimeout: 60_000,
	},
})
