const canonicalRuntimePrefixes = ['/moments', '/ai.news']

export default defineNuxtRouteMiddleware((to) => {
	if (globalThis.location.hostname !== 'fly-living.pages.dev')
		return

	const requiresCanonicalRuntime = canonicalRuntimePrefixes.some(prefix => (
		to.path === prefix || to.path.startsWith(`${prefix}/`)
	))
	if (!requiresCanonicalRuntime)
		return

	return navigateTo(`https://flyovo.cc.cd${to.fullPath}`, {
		external: true,
		replace: true,
	})
})
