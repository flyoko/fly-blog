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

	it('keeps the supplied character scene scoped to dynamic mode', () => {
		const scene = read('app/components/blog/BlogShinchanScene.vue')
		expect(existsSync('public/assets/shinchan-user-cutout.webp')).toBe(true)
		expect(scene).toContain(':global(.dynamic .shinchan-scene)')
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
			expect(source).toContain(':global(.dynamic .')
		}
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

	it('renders condition-specific weather scenes from the production API response', () => {
		const weather = read('app/components/widget/Weather.vue')
		expect(weather).toContain('$fetch<ApiSuccess<PublicWeather>>(\'/api/weather\')')
		expect(weather).toContain('toWeatherMotionState(weather.value.weatherCode)')
		expect(weather).toContain('if (configuredEnabled.value)')
		for (const scene of ['weather-sun', 'weather-moon', 'weather-cloud', 'weather-rain', 'weather-lightning', 'weather-fog', 'weather-snow'])
			expect(weather).toContain(scene)
		expect(weather).toContain('prefers-reduced-motion: reduce')
	})
})
