import { isChunkLoadError } from '#shared/admin/feedback'

const recoveredNoticeKey = 'fly_admin_chunk_recovered'
const recoveryAttemptKey = 'fly_admin_chunk_recovery_attempt'
const recoveryTtl = 10_000

interface VitePreloadErrorEvent extends Event {
	payload?: unknown
}

export default defineNuxtPlugin((nuxtApp) => {
	const route = useRoute()
	const notifications = useAdminNotifications()
	let recovering = false
	const isAdminRoute = () => route.path === '/admin' || route.path.startsWith('/admin/')

	function showRecoveryWarning() {
		notifications.show({
			tone: 'warning',
			title: '页面资源暂时无法恢复',
			message: '请手动刷新页面，当前内容仍保存在这台设备。',
			duration: recoveryTtl,
		})
	}

	function readRecoveryAttempt(now: number) {
		const previous = sessionStorage.getItem(recoveryAttemptKey)
		if (!previous)
			return false
		try {
			const attempt = JSON.parse(previous) as { fullPath?: unknown, expires?: unknown }
			if (typeof attempt.fullPath === 'string' && typeof attempt.expires === 'number' && Number.isFinite(attempt.expires))
				return attempt.fullPath === route.fullPath && attempt.expires > now
		}
		catch {
			// 损坏记录按无效记录处理。
		}
		sessionStorage.removeItem(recoveryAttemptKey)
		return false
	}

	function markRecoveryAttempt() {
		try {
			const now = Date.now()
			if (readRecoveryAttempt(now))
				return false
			sessionStorage.setItem(recoveryAttemptKey, JSON.stringify({ fullPath: route.fullPath, expires: now + recoveryTtl }))
			sessionStorage.setItem(recoveredNoticeKey, route.fullPath)
			return true
		}
		catch {
			return false
		}
	}

	function onPreloadError(event: Event) {
		const preloadEvent = event as VitePreloadErrorEvent
		if (!isAdminRoute() || !isChunkLoadError(preloadEvent.payload))
			return
		preloadEvent.preventDefault()
		if (recovering)
			return
		recovering = true
		if (!markRecoveryAttempt()) {
			showRecoveryWarning()
			return
		}
		try {
			reloadNuxtApp({ persistState: true, ttl: recoveryTtl })
		}
		catch {
			try {
				sessionStorage.removeItem(recoveredNoticeKey)
			}
			catch {
				// 存储不可用时仍显示手动刷新提示。
			}
			showRecoveryWarning()
		}
	}

	window.addEventListener('vite:preloadError', onPreloadError)

	function showRecoveredNotice() {
		try {
			const recoveredPath = sessionStorage.getItem(recoveredNoticeKey)
			if (!recoveredPath)
				return
			sessionStorage.removeItem(recoveredNoticeKey)
			if (isAdminRoute() && recoveredPath === route.fullPath) {
				notifications.show({
					tone: 'success',
					title: '页面已恢复',
					message: '刚才的内容仍保存在这台设备，可以继续操作。',
					duration: 10_000,
				})
			}
		}
		catch {
			// 存储不可用时不影响页面继续运行。
		}
	}

	showRecoveredNotice()

	nuxtApp.hook('vue:error', (error) => {
		if (!isAdminRoute() || isChunkLoadError(error))
			return
		notifications.error(error, '页面遇到了一点问题，已为你保留当前内容。', '页面暂时没有完成加载')
	})
})
