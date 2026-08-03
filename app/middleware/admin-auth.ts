import { resolveAdminAuthNavigation } from '~/types/admin'

export default defineNuxtRouteMiddleware(async (to) => {
	if (import.meta.server)
		return
	const adminStore = useAdminStore()
	const session = await adminStore.loadSession()
	const destination = resolveAdminAuthNavigation(session, to.path)
	if (!destination)
		return
	return navigateTo(destination, { replace: true })
})
