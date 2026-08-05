import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = (path: string) => readFile(`${root}/${path}`, 'utf8')

function createStorage() {
	const values = new Map<string, string>()
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			values.set(key, value)
		}),
		removeItem: vi.fn((key: string) => {
			values.delete(key)
		}),
	}
}

async function loadPlugin(options: { path?: string, fullPath?: string, storage?: ReturnType<typeof createStorage> } = {}) {
	const storage = options.storage ?? createStorage()
	const windowTarget = new EventTarget()
	const reloadNuxtApp = vi.fn()
	const show = vi.fn()
	const route = { path: options.path ?? '/admin/articles', fullPath: options.fullPath ?? '/admin/articles' }
	vi.stubGlobal('window', windowTarget)
	vi.stubGlobal('sessionStorage', storage)
	vi.stubGlobal('reloadNuxtApp', reloadNuxtApp)
	vi.stubGlobal('useRoute', () => route)
	vi.stubGlobal('useAdminNotifications', () => ({ show, error: vi.fn() }))
	vi.stubGlobal('defineNuxtPlugin', (setup: (nuxtApp: { hook: (name: string, callback: () => void) => void }) => void) => setup)
	const { default: plugin } = await import('../../app/plugins/admin-recovery.client')
	plugin({ hook: () => {} } as never)
	return { storage, windowTarget, reloadNuxtApp, show, route }
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

describe('周期 6 后台韧性与写作体验', () => {
	it('在分块失效时立即恢复，并保留应用状态', async () => {
		const config = await source('nuxt.config.ts')
		const plugin = await source('app/plugins/admin-recovery.client.ts')

		expect(config).toContain('emitRouteChunkError: \'automatic-immediate\'')
		expect(config).toContain('restoreState: true')
		const headers = await source('public/_headers')
		expect(headers).toContain('Cache-Control: no-cache, no-store, must-revalidate')
		expect(headers).toContain('/200')
		expect(headers).toContain('/admin/*')
		expect(plugin).toContain('window.addEventListener(\'vite:preloadError\'')
		expect(plugin).toContain('preloadEvent.preventDefault()')
		expect(plugin).toContain('reloadNuxtApp({')
		expect(plugin).toContain('persistState: true')
		expect(plugin).toContain('const recoveryTtl = 10_000')
		expect(plugin).toContain('ttl: recoveryTtl')
		expect(plugin).not.toContain('force: true')
		expect(plugin).toContain('页面已恢复')
		expect(plugin).toContain('duration: 10_000')
		expect(plugin).toContain('showRecoveredNotice()')
		expect(plugin).not.toContain('nuxtApp.hook(\'app:mounted\'')
	})

	it('后台分块事件只拦截并恢复一次，且重复事件不重复处理', async () => {
		const { windowTarget, reloadNuxtApp, storage, show } = await loadPlugin()
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })

		windowTarget.dispatchEvent(event)
		windowTarget.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(true)
		expect(reloadNuxtApp).toHaveBeenCalledTimes(1)
		expect(reloadNuxtApp).toHaveBeenCalledWith({ persistState: true, ttl: 10_000 })
		expect(storage.setItem).toHaveBeenCalledTimes(2)
		expect(show).not.toHaveBeenCalled()
	})

	it('同一路径十秒内跨重载熔断自动恢复并显示友好提示', async () => {
		const storage = createStorage()
		storage.setItem('fly_admin_chunk_recovery_attempt', JSON.stringify({ fullPath: '/admin/articles', expires: Date.now() + 10_000 }))
		const { windowTarget, reloadNuxtApp, show } = await loadPlugin({ storage })
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })
		windowTarget.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(true)
		expect(reloadNuxtApp).not.toHaveBeenCalled()
		expect(show).toHaveBeenCalledWith(expect.objectContaining({
			tone: 'warning',
			title: '页面资源暂时无法恢复',
			message: '请手动刷新页面，当前内容仍保存在这台设备。',
		}))
	})

	it('sessionStorage 不可用时停止自动恢复并显示友好提示', async () => {
		const storage = createStorage()
		storage.setItem.mockImplementation(() => {
			throw new Error('blocked')
		})
		const { windowTarget, reloadNuxtApp, show } = await loadPlugin({ storage })
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })
		windowTarget.dispatchEvent(event)

		expect(reloadNuxtApp).not.toHaveBeenCalled()
		expect(show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning', title: '页面资源暂时无法恢复' }))
		expect(show.mock.calls[0]?.[0]?.message).toBe('请手动刷新页面，当前内容仍保存在这台设备。')
	})

	it('reloadNuxtApp 同步抛错时清理成功标记、显示 warning 且不再次重载', async () => {
		const { windowTarget, reloadNuxtApp, storage, show } = await loadPlugin()
		reloadNuxtApp.mockImplementation(() => {
			throw new Error('reload failed')
		})
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })

		expect(() => windowTarget.dispatchEvent(event)).not.toThrow()
		windowTarget.dispatchEvent(event)

		expect(reloadNuxtApp).toHaveBeenCalledTimes(1)
		expect(storage.removeItem).toHaveBeenCalledWith('fly_admin_chunk_recovered')
		expect(show.mock.calls[0]?.[0]?.message).toBe('请手动刷新页面，当前内容仍保存在这台设备。')
	})

	it.each([
		['损坏 JSON', '{broken'],
		['fullPath 无效', JSON.stringify({ fullPath: 123, expires: Date.now() + 10_000 })],
		['expires 无效', JSON.stringify({ fullPath: '/admin/articles', expires: Infinity })],
	])('attempt 记录%s时清理记录并允许建立新尝试', async (_label, value) => {
		const storage = createStorage()
		storage.setItem('fly_admin_chunk_recovery_attempt', value)
		const { windowTarget, reloadNuxtApp } = await loadPlugin({ storage })
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })

		windowTarget.dispatchEvent(event)

		expect(storage.removeItem).toHaveBeenCalledWith('fly_admin_chunk_recovery_attempt')
		expect(reloadNuxtApp).toHaveBeenCalledTimes(1)
	})

	it('旧路径存在未过期 attempt 时不熔断新 fullPath', async () => {
		const storage = createStorage()
		storage.setItem('fly_admin_chunk_recovery_attempt', JSON.stringify({ fullPath: '/admin/old', expires: Date.now() + 10_000 }))
		const { windowTarget, reloadNuxtApp } = await loadPlugin({ storage, fullPath: '/admin/current' })
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })

		windowTarget.dispatchEvent(event)

		expect(reloadNuxtApp).toHaveBeenCalledTimes(1)
	})

	it('attempt 写入成功但 recovered notice 写入失败时停止重载并显示 warning', async () => {
		const storage = createStorage()
		const originalSetItem = storage.setItem.getMockImplementation()!
		storage.setItem.mockImplementation((key: string, value: string) => {
			if (key === 'fly_admin_chunk_recovered')
				throw new Error('notice blocked')
			originalSetItem(key, value)
		})
		const { windowTarget, reloadNuxtApp, show } = await loadPlugin({ storage })
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })

		windowTarget.dispatchEvent(event)

		expect(reloadNuxtApp).not.toHaveBeenCalled()
		expect(show.mock.calls[0]?.[0]?.message).toBe('请手动刷新页面，当前内容仍保存在这台设备。')
		expect(storage.getItem('fly_admin_chunk_recovered')).toBeNull()
		expect(storage.getItem('fly_admin_chunk_recovery_attempt')).toContain('/admin/articles')
	})

	it('公共页面不拦截分块预加载错误', async () => {
		const { windowTarget, reloadNuxtApp } = await loadPlugin({ path: '/about', fullPath: '/about' })
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })
		windowTarget.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(false)
		expect(reloadNuxtApp).not.toHaveBeenCalled()
	})

	it('后台页面收到普通 Error 时不拦截、不重载且不显示 warning', async () => {
		const { windowTarget, reloadNuxtApp, show } = await loadPlugin()
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('普通页面错误') })

		windowTarget.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(false)
		expect(reloadNuxtApp).not.toHaveBeenCalled()
		expect(show).not.toHaveBeenCalled()
	})

	it('同一 fullPath 的过期 attempt 可覆盖并重新重载一次', async () => {
		const storage = createStorage()
		storage.setItem('fly_admin_chunk_recovery_attempt', JSON.stringify({ fullPath: '/admin/articles', expires: Date.now() - 1 }))
		const { windowTarget, reloadNuxtApp } = await loadPlugin({ storage })
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })

		windowTarget.dispatchEvent(event)

		const attempt = JSON.parse(storage.getItem('fly_admin_chunk_recovery_attempt')!) as { fullPath: string, expires: number }
		expect(reloadNuxtApp).toHaveBeenCalledTimes(1)
		expect(reloadNuxtApp).toHaveBeenCalledWith({ persistState: true, ttl: 10_000 })
		expect(attempt.fullPath).toBe('/admin/articles')
		expect(attempt.expires).toBeGreaterThan(Date.now())
	})

	it.each(['/administrator', '/administer'])('非精确后台路由 %s 不拦截分块预加载错误', async (path) => {
		const { windowTarget, reloadNuxtApp, show } = await loadPlugin({ path, fullPath: path })
		const event = new Event('vite:preloadError', { cancelable: true })
		Object.defineProperty(event, 'payload', { value: new Error('Failed to fetch dynamically imported module') })

		windowTarget.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(false)
		expect(reloadNuxtApp).not.toHaveBeenCalled()
		expect(show).not.toHaveBeenCalled()
	})

	it('只为当前 fullPath 显示恢复成功通知，并清理旧标记', async () => {
		const storage = createStorage()
		storage.setItem('fly_admin_chunk_recovered', '/admin/old')
		const { show } = await loadPlugin({ storage, fullPath: '/admin/current' })

		expect(show).not.toHaveBeenCalled()
		expect(storage.removeItem).toHaveBeenCalledWith('fly_admin_chunk_recovered')
	})

	it('保存的 fullPath 与当前路径一致时显示恢复成功通知', async () => {
		const storage = createStorage()
		storage.setItem('fly_admin_chunk_recovered', '/admin/articles')
		const { show } = await loadPlugin({ storage })

		expect(show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success', title: '页面已恢复' }))
	})

	it('插件不引入旧的页面刷新、强制刷新或第二套通知实现', async () => {
		const plugin = await source('app/plugins/admin-recovery.client.ts')
		expect(plugin).not.toContain('window.location.reload')
		expect(plugin).not.toContain('force: true')
		expect(plugin).not.toContain('runtimeMessage')
		expect(plugin).not.toContain('toast(')
	})

	it('为后台提供全局弹出反馈和无技术栈页面兜底', async () => {
		const layout = await source('app/layouts/admin.vue')
		const toast = await source('app/components/admin/AdminToastCenter.vue')
		const fallback = await source('app/components/admin/AdminRouteFallback.vue')

		expect(layout).toContain('<AdminToastCenter')
		expect(layout).toContain('<NuxtErrorBoundary')
		expect(layout).toContain('<AdminRouteFallback')
		expect(toast).toContain('后台通知')
		expect(fallback).toContain('这个页面暂时没有加载完整')
		expect(fallback).not.toContain('error.message')
	})

	it('预览失败时隐藏底层错误，并支持专注写作和一键重试', async () => {
		const editor = await source('app/components/admin/AdminArticleEditor.vue')

		expect(editor).toContain('专注写作')
		expect(editor).toContain('预览暂时没有更新')
		expect(editor).toContain('重新加载预览')
		expect(editor).not.toContain('error?.message')
		expect(editor).not.toContain('Markdown 预览失败：')
	})
})
