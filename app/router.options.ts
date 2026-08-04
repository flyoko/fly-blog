import type { RouterConfig } from '@nuxt/schema'

export default {
	scrollBehavior(to, _from, savedPosition) {
		if (savedPosition)
			return savedPosition

		if (to.hash) {
			return {
				behavior: 'smooth',
				el: to.hash,
				top: 32,
			}
		}

		return { left: 0, top: 0 }
	},
} satisfies RouterConfig
