import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const e2ePort = process.env.E2E_PORT || '3000'
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
	use: {
		baseURL: e2eBaseUrl,
		trace: 'retain-on-failure',
	},
	webServer: {
		command: `HOST=127.0.0.1 PORT=${e2ePort} pnpm preview:e2e`,
		url: e2eBaseUrl,
		reuseExistingServer: !process.env.CI,
		timeout: 600_000,
	},
	projects: [
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
	],
})
