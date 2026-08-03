import type { AdminSessionDto } from '#shared/admin/auth'

export const useAdminStore = defineStore('admin', () => {
	const session = ref<AdminSessionDto>({ authenticated: false })
	const loaded = ref(false)
	const loading = ref(false)
	const error = ref<string | null>(null)
	let pending: Promise<AdminSessionDto> | undefined

	const isAuthenticated = computed(() => session.value.authenticated)

	async function loadSession(force = false) {
		if (loaded.value && !force)
			return session.value
		if (pending)
			return pending
		loading.value = true
		error.value = null
		pending = useAdminApi<AdminSessionDto>('/api/auth/session')
			.then((value) => {
				session.value = value
				loaded.value = true
				return value
			})
			.catch((cause: unknown) => {
				session.value = { authenticated: false }
				loaded.value = true
				error.value = cause instanceof Error ? cause.message : '无法读取登录状态'
				return session.value
			})
			.finally(() => {
				loading.value = false
				pending = undefined
			})
		return pending
	}

	async function logout() {
		await useAdminApi<void>('/api/auth/logout', { method: 'POST' })
		session.value = { authenticated: false }
		loaded.value = true
		await navigateTo('/admin/login')
	}

	return {
		session,
		loaded,
		loading,
		error,
		isAuthenticated,
		loadSession,
		logout,
	}
})
