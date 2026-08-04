import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	adminNavigation,
	adminUnavailableSections,
	resolveAdminAuthNavigation,
	serviceStatusMeta,
} from '../../app/types/admin'

const root = fileURLToPath(new URL('../..', import.meta.url))

async function source(path: string) {
	return readFile(`${root}/${path}`, 'utf8')
}

describe('admin shell contracts', () => {
	it('redirects unauthenticated private routes and keeps the login route public', () => {
		expect(resolveAdminAuthNavigation({ authenticated: false }, '/admin'))
			.toBe('/admin/login?returnTo=%2Fadmin')
		expect(resolveAdminAuthNavigation({ authenticated: false }, '/admin/login')).toBeNull()
		expect(resolveAdminAuthNavigation({ authenticated: true }, '/admin/login')).toBe('/admin')
		expect(resolveAdminAuthNavigation({ authenticated: true }, '/admin/articles')).toBeNull()
	})

	it('contains all eleven confirmed navigation entries in the approved order', () => {
		expect(adminNavigation.map(item => item.label)).toEqual([
			'概览',
			'访问分析',
			'文章',
			'瞬间',
			'AI 阅闻',
			'自述',
			'媒体库',
			'随心听',
			'模块管理',
			'发布与审核',
			'站点设置',
		])
	})

	it('maps dependency degradation without inventing status data', () => {
		expect(serviceStatusMeta('ok')).toEqual({ label: '运行正常', tone: 'positive' })
		expect(serviceStatusMeta('degraded')).toEqual({ label: '需要关注', tone: 'warning' })
		expect(serviceStatusMeta('down')).toEqual({ label: '暂不可用', tone: 'danger' })
	})

	it('removes all placeholders after cycle 3 modules are implemented', () => {
		expect(Object.keys(adminUnavailableSections)).toEqual([])
	})

	it('keeps login copy user-facing and GitHub-specific', async () => {
		const login = await source('app/pages/admin/login.vue')
		expect(login).toContain('管理你的创作空间')
		expect(login).toContain('使用 GitHub 登录')
		expect(login).not.toContain('OAuth client')
	})

	it('redirects Pages admin entry points to the canonical authenticated origin', async () => {
		const redirects = (await source('public/_redirects'))
			.split('\n')
			.map(line => line.trim())
			.filter(line => line && !line.startsWith('#'))

		expect(redirects.slice(0, 2)).toEqual([
			'/admin https://flyovo.cc.cd/admin 302',
			'/admin/* https://flyovo.cc.cd/admin/:splat 302',
		])
		expect(redirects).not.toContain('/admin/* /200 200')
		expect(redirects).toContain('/moments/* /200 200')
		expect(redirects).toContain('/ai.news/read/* /200 200')
	})

	it('supports dark mode and reduced motion in the admin stylesheet', async () => {
		const stylesheet = await source('app/assets/css/admin.scss')
		expect(stylesheet).toContain('.dark-mode')
		expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)')
	})
})
