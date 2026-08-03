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

	it('contains all ten confirmed navigation entries in the approved order', () => {
		expect(adminNavigation.map(item => item.label)).toEqual([
			'概览',
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

	it('names the later-cycle unavailable sections explicitly', () => {
		expect(adminUnavailableSections.moments).toMatchObject({ title: '瞬间', cycle: 2 })
		expect(adminUnavailableSections['ai-news']).toMatchObject({ title: 'AI 阅闻', cycle: 2 })
		expect(adminUnavailableSections.about).toMatchObject({ title: '自述', cycle: 2 })
		expect(adminUnavailableSections.music).toMatchObject({ title: '随心听', cycle: 2 })
	})

	it('keeps login copy user-facing and GitHub-specific', async () => {
		const login = await source('app/pages/admin/login.vue')
		expect(login).toContain('管理你的创作空间')
		expect(login).toContain('使用 GitHub 登录')
		expect(login).not.toContain('OAuth client')
	})

	it('supports dark mode and reduced motion in the admin stylesheet', async () => {
		const stylesheet = await source('app/assets/css/admin.scss')
		expect(stylesheet).toContain('.dark-mode')
		expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)')
	})
})
