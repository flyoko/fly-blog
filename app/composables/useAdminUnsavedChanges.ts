import type { MaybeRefOrGetter } from 'vue'

export function useAdminUnsavedChanges(
	isDirty: MaybeRefOrGetter<boolean>,
	message = '当前页面还有未保存的改动，确定要离开吗？',
) {
	const router = useRouter()
	const bypassOnce = ref(false)
	let removeRouteGuard: (() => void) | undefined

	function shouldBlock() {
		return toValue(isDirty) && !bypassOnce.value
	}

	function beforeUnload(event: BeforeUnloadEvent) {
		if (!shouldBlock())
			return
		event.preventDefault()
		event.returnValue = message
	}

	function allowNextNavigation() {
		bypassOnce.value = true
	}

	onMounted(() => {
		removeRouteGuard = router.beforeEach(() => {
			if (bypassOnce.value) {
				bypassOnce.value = false
				return true
			}
			if (!shouldBlock())
				return true
			// eslint-disable-next-line no-alert -- unsaved edits require a synchronous browser confirmation
			return window.confirm(message)
		})
		window.addEventListener('beforeunload', beforeUnload)
	})

	onBeforeUnmount(() => {
		removeRouteGuard?.()
		window.removeEventListener('beforeunload', beforeUnload)
	})

	return { allowNextNavigation }
}
