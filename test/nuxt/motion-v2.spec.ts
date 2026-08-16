import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toWeatherMotionState } from '../../app/utils/weather-motion'

const read = (path: string) => readFileSync(path, 'utf8')

describe('motion v2 production integration', () => {
	it('maps WMO weather codes to clear visual motion states', () => {
		expect(toWeatherMotionState(0)).toBe('clear')
		expect(toWeatherMotionState(2)).toBe('cloudy')
		expect(toWeatherMotionState(45)).toBe('fog')
		expect(toWeatherMotionState(61)).toBe('rain')
		expect(toWeatherMotionState(75)).toBe('snow')
		expect(toWeatherMotionState(95)).toBe('storm')
	})

	it('shares the supplied character scene across every public theme', () => {
		const scene = read('app/components/blog/BlogShinchanScene.vue')
		expect(existsSync('public/assets/shinchan-user-cutout.webp')).toBe(true)
		expect(scene).toContain('display: block')
		expect(scene).toContain('class="shinchan-scene"')
		expect(scene).toContain('class="scene-atmosphere"')
		expect(scene).not.toContain('!isDynamic.value')
		expect(scene).toContain('prefers-reduced-motion: reduce')
		expect(read('app/components/blog/BlogHeader.global.vue')).toContain('<BlogShinchanScene variant="header"')
		expect(read('app/pages/moments/index.vue')).toContain('variant="moments"')
		expect(read('app/pages/me.vue')).toContain('variant="about"')
	})

	it('prevents dynamic ancestor selectors from leaking onto the html element', () => {
		for (const file of [
			'app/components/blog/BlogHeader.global.vue',
			'app/components/blog/BlogShinchanScene.vue',
			'app/pages/moments/index.vue',
			'app/pages/me.vue',
		]) {
			const source = read(file)
			expect(source).not.toContain(':global(.dynamic) .')
			expect(source).not.toContain(':global(.light) .')
			expect(source).not.toContain(':global(.dark) .')
		}
	})

	it('keeps a low-power ambient layer in light and dark while reserving pointer particles for dynamic mode', () => {
		const atmosphere = read('app/components/blog/BlogAtmosphere.vue')
		const surface = read('app/components/blog/BlogSurfaceInteraction.vue')
		const storyboard = read('app/components/blog/BlogStoryboardInteraction.vue')
		const main = read('app/assets/css/main.scss')
		expect(atmosphere).toContain('!isDynamic.value')
		expect(atmosphere).toContain('const isDynamic = computed(() => colorMode.value === \'dynamic\')')
		expect(surface).not.toContain('!isDynamic.value')
		expect(storyboard).toContain('!isDynamic.value')
		expect(main).toContain('.light .blog-atmosphere')
		expect(main).toContain('.dark .blog-atmosphere')
		expect(main).toContain('.dynamic .blog-atmosphere')
		expect(main).toContain(':is(.light, .dark) .atmosphere-lens-a')
		expect(main).toContain('animation-duration: 26s')
		expect(main).toContain(':is(.light, .dark) .atmosphere-stars-near')
		expect(main).toContain('animation-duration: 48s')
		expect(storyboard).toContain('trailDistance')
		expect(storyboard).toContain('const trailInterval = 120')
	})

	it('adds storyboard pointer feedback without intercepting controls', () => {
		const interaction = read('app/components/blog/BlogStoryboardInteraction.vue')
		const layout = read('app/layouts/default.vue')
		expect(layout).toContain('<BlogStoryboardInteraction />')
		expect(interaction).toContain('pointer-events: none')
		expect(interaction).toContain('useEventListener(\'pointerdown\'')
		expect(interaction).toContain('prefersReducedMotion')
		expect(interaction).toContain('onBeforeUnmount(clearEffects)')
		expect(interaction).toContain('cleanupTimers.clear()')
	})

	it('keeps public route changes atomic and geometry-stable', () => {
		const app = read('app/app.vue')
		const atmosphere = read('app/components/blog/BlogAtmosphere.vue')
		const animation = read('app/assets/css/animation.scss')
		const main = read('app/assets/css/main.scss')
		const polish = read('app/assets/css/polish.scss')
		const router = read('app/router.options.ts')

		expect(app).toContain('<NuxtPage />')
		expect(app).not.toContain(':transition=')
		expect(polish).not.toContain('.page-enter-active')
		expect(polish).not.toContain('.page-leave-active')
		expect(atmosphere).not.toContain('is-route-pulse')
		expect(animation).not.toContain('atmosphere-route-pulse')
		expect(main).toContain('scroll-behavior: auto')
		expect(main).toContain('scrollbar-gutter: stable')
		expect(router).toContain('behavior: \'smooth\'')
		expect(router).toContain('return { left: 0, top: 0 }')
	})

	it('isolates route-sensitive compositor motion without stopping ambient animation', () => {
		const atmosphere = read('app/components/blog/BlogAtmosphere.vue')
		const header = read('app/components/blog/BlogHeader.global.vue')
		const main = read('app/assets/css/main.scss')
		const surface = read('app/components/blog/BlogSurfaceInteraction.vue')

		expect(surface).not.toContain('.pagination, .blog-header')
		expect(surface).not.toContain('.sidebar-nav-item, .pagination, .blog-header')
		expect(header).toContain('contain: layout paint')
		expect(header).toContain('class="blog-logo-motion"')
		expect(header).toContain('isolation: isolate')
		expect(header).toContain('transform: translate3d(0, -1px, 0) scale(1.045) rotate(0.8deg)')
		expect(header).toContain('.blog-header.is-route-settling::before')
		expect(header).toContain('animation-play-state: paused')
		expect(header).not.toContain('backdrop-filter: blur(18px)')
		expect(header).not.toContain('.blog-header:hover .blog-logo.is-profile-avatar')
		expect(header).not.toContain('animation-play-state: running')
		expect(atmosphere).toContain('watch(() => route.fullPath')
		expect(atmosphere).not.toContain('targetX = currentX')
		expect(atmosphere).toContain('performance.now() < pointerResumeAt')
		expect(atmosphere).toContain('function canAnimatePointer()')
		expect(atmosphere).toContain('&& !isRouteSettling.value')
		expect(atmosphere).toContain('useState<boolean>(\'route-compositor-settling\'')
		expect(atmosphere).not.toContain('flowElement.style.transform')
		expect(atmosphere).toContain('pointerElement.style.transform')
		expect(atmosphere).toContain('nuxtApp.hook(\'page:loading:start\', beginRouteSettling)')
		expect(atmosphere).toContain('nuxtApp.hook(\'page:loading:end\', scheduleRouteResume)')
		expect(atmosphere).toContain('nuxtApp.hook(\'page:start\', beginRouteSettling)')
		expect(atmosphere).toContain('nuxtApp.hook(\'page:finish\', scheduleRouteResume)')
		expect(atmosphere).toContain('Number.POSITIVE_INFINITY')
		expect(atmosphere).toContain('const routePointerSettleMs = 360')
		expect(atmosphere).toContain('const routePointerFailSafeMs = 4_000')
		expect(atmosphere).toContain('pointerResumeAt = 0')
		expect(atmosphere).toMatch(/isRouteSettling\.value = false[\s\S]*?resumePointerAnimation\(\)/u)
		expect(main).not.toContain('.blog-atmosphere.is-route-settling')
		expect(main).toContain('width: 48rem')
		expect(main).not.toContain('--pointer-x')
		expect(main).not.toContain('--pointer-shift-x')
		expect(main).not.toMatch(/\.atmosphere-flow \{[\s\S]*?transition: transform/u)
	})

	it('renders condition-specific weather scenes from the production API response', () => {
		const weather = read('app/components/widget/Weather.vue')
		expect(weather).toContain('$fetch<ApiSuccess<PublicWeather>>(weatherUrl)')
		expect(weather).toContain('resolvePublicApiUrl(\'/api/weather\', globalThis.location.hostname)')
		expect(weather).toContain('toWeatherMotionState(weather.value.weatherCode)')
		expect(weather).toContain('if (configuredEnabled.value)')
		for (const scene of ['weather-sun', 'weather-moon', 'weather-cloud', 'weather-rain', 'weather-lightning', 'weather-fog', 'weather-snow'])
			expect(weather).toContain(scene)
		expect(weather).toContain('prefers-reduced-motion: reduce')
	})

	it('uses organic weather particles without repeating dot grids', () => {
		const weather = read('app/components/widget/Weather.vue')

		expect(weather).toContain('weatherStarMap')
		expect(weather).toContain('weather-star-twinkle')
		expect(weather).toContain('weather-sun-corona')
		expect(weather).toContain('weather-rain-drop')
		expect(weather).not.toContain('weather-stars-a')
		expect(weather).not.toContain('weather-stars-b')
	})
})
