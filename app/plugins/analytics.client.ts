import {
	buildClientPageview,
	clientAnalyticsCookieAssignments,
	resolveClientAnalyticsIdentity,
	sendAnalyticsPageview,
	shouldTrackClientNavigation,
} from '../utils/analytics'

export default defineNuxtPlugin((nuxtApp) => {
	const router = useRouter()
	let mounted = false

	nuxtApp.hook('app:mounted', () => {
		mounted = true
	})

	router.afterEach((to, from, failure) => {
		if (!mounted || failure || !shouldTrackClientNavigation(from.fullPath, to.fullPath))
			return
		queueMicrotask(() => {
			const identity = resolveClientAnalyticsIdentity(document.cookie)
			for (const cookie of clientAnalyticsCookieAssignments(identity))
				document.cookie = cookie
			void sendAnalyticsPageview(buildClientPageview({
				to: to.fullPath,
				from: from.fullPath,
				title: document.title,
				origin: window.location.origin,
				visitorToken: identity.visitorToken,
				sessionToken: identity.sessionToken,
			}))
		})
	})
})
