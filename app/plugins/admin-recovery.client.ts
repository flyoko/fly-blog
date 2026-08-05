import { isChunkLoadError } from '#shared/admin/feedback'

const recoveredNoticeKey = 'fly_admin_chunk_recovered'

interface VitePreloadErrorEvent extends Event {
	payload?: unknown
}

export default defineNuxtPlugin((nuxtApp) => {
	const route = useRoute()
	const notifications = useAdminNotifications()
	let recovering = false

	function markRecovery() {
		if (!route.path.startsWith('/admin'))
			return
		try {
			sessionStorage.setItem(recoveredNoticeKey, route.fullPath)
		}
		catch {
			// Storage can be unavailable in private or restricted browser contexts.
		}
	}

	function onPreloadError(event: Event) {
		const preloadEvent = event as VitePreloadErrorEvent
		if (!isChunkLoadError(preloadEvent.payload))
			return
		preloadEvent.preventDefault()
		if (recovering)
			return
		recovering = true
		markRecovery()
	}

	window.addEventListener('vite:preloadError', onPreloadError)

	function showRecoveredNotice() {
		try {
			const recoveredPath = sessionStorage.getItem(recoveredNoticeKey)
			if (!recoveredPath)
				return
			sessionStorage.removeItem(recoveredNoticeKey)
			if (route.path.startsWith('/admin')) {
				notifications.show({
					tone: 'success',
					title: '页面已恢复',
					message: '刚才的内容仍保存在这台设备，可以继续操作。',
					duration: 10_000,
				})
			}
		}
		catch {
			// Recovery should not fail because browser storage is unavailable.
		}
	}

	showRecoveredNotice()

	nuxtApp.hook('vue:error', (error) => {
		if (!route.path.startsWith('/admin') || isChunkLoadError(error))
			return
		notifications.error(error, '页面遇到了一点问题，已为你保留当前内容。', '页面暂时没有完成加载')
	})
})
