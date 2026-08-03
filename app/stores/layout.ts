export type LayoutState = 'none' | 'sidebar' | 'aside' | 'search' | 'lightbox'

export const useLayoutStore = defineStore('layout', () => {
	const router = useRouter()

	const state = ref<LayoutState>('none')
	const avoidTargets = ref<AvoidTarget[]>([])
	let triggerElement: HTMLElement | null = null
	let previousOverflow = ''

	const restoreFocus = () => {
		if (!import.meta.client)
			return
		const target = triggerElement
		triggerElement = null
		requestAnimationFrame(() => target?.focus())
	}

	const close = () => {
		if (state.value === 'none')
			return
		state.value = 'none'
		restoreFocus()
	}

	const toggle = (key: LayoutState) => {
		if (state.value === key)
			return close()
		if (import.meta.client && document.activeElement instanceof HTMLElement)
			triggerElement = document.activeElement
		state.value = key
	}

	useEventListener('keydown', (e) => {
		if (state.value !== 'none' && e.key === 'Escape') {
			e.preventDefault()
			close()
		}
	})

	watch(state, (value, previous) => {
		if (!import.meta.client)
			return
		if (previous === 'none' && value !== 'none') {
			previousOverflow = document.body.style.overflow
			document.body.style.overflow = 'hidden'
		}
		else if (previous !== 'none' && value === 'none') {
			document.body.style.overflow = previousOverflow
		}
	})

	router.beforeEach(() => {
		close()
	})

	onScopeDispose(() => {
		if (import.meta.client)
			document.body.style.overflow = previousOverflow
	})

	return {
		state,
		avoidTargets,
		close,
		toggle,
	}
})
