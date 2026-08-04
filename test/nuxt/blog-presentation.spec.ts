import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('public blog presentation', () => {
	it('uses concrete article dates unless relative time is explicitly requested', () => {
		const date = read('app/components/util/Date.vue')

		expect(date).toContain('props.relative && !props.absolute')
		expect(date).toContain('year="2-digit"')
		expect(date).not.toContain('today.since(zdt.value')
	})

	it('shows the author age for every archive year', () => {
		const config = read('app/app.config.ts')
		const archive = read('app/pages/archive.vue')

		expect(config).toContain('birthYear: 2002')
		expect(archive).toContain('v-if="birthYear > 0"')
		expect(archive).toContain('Number(year) - birthYear')
		expect(2026 - 2002).toBe(24)
		expect(2025 - 2002).toBe(23)
		expect(2024 - 2002).toBe(22)
	})

	it('composes the about avatar, planet, and character as one coordinated scene', () => {
		const scene = read('app/components/blog/BlogShinchanScene.vue')
		const page = read('app/pages/me.vue')

		expect(scene).toContain('class="scene-planet"')
		expect(scene).toContain('class="scene-profile-badge"')
		expect(scene).toContain('shinchan-planet-breathe')
		expect(scene).toContain('class="scene-profile-halo"')
		expect(scene).toContain('class="scene-avatar-tether"')
		expect(scene).toContain('shinchan-click-ripple')
		expect(scene).toContain('object-fit: cover')
		expect(scene).toContain('fetchpriority="high"')
		expect(scene).toContain('props.portraitSrc || props.characterSrc')
		expect(page).toContain(':portrait-src="profilePortrait || undefined"')
		expect(page).toContain('/assets/profile-cat-hero.webp')
		expect(page).toContain('\'is-dynamic-mode\': isDynamicMode')
		expect(page).toContain('.about-hero.is-dynamic-mode')
		expect(page).toContain('root.classList.contains(\'dynamic\')')
		expect(page).toContain('new MutationObserver(syncDynamicMode)')
		expect(scene).toContain('.is-about.has-custom-character .scene-profile-avatar')
		expect(page).toContain(':character-src="profileAvatar || undefined"')
		expect(page).not.toContain('speech="你好，我是 fly"')
	})
})
