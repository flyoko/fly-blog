import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	reporter: 'list',
	use: {
		baseURL: 'http://127.0.0.1:3000',
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
	],
})
