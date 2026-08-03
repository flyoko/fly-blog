import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
	use: {
		baseURL: 'http://127.0.0.1:3000',
		trace: 'retain-on-failure',
	},
	webServer: {
		command: 'pnpm preview:e2e',
		url: 'http://127.0.0.1:3000',
		reuseExistingServer: false,
		timeout: 180_000,
	},
	projects: [
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
	],
})
