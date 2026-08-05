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

	it('does not reserve desktop width for an empty route aside placeholder', () => {
		const aside = read('app/components/blog/BlogAside.vue')
		const layout = read('app/layouts/default.vue')

		expect(layout).toContain('<BlogAside :has-content="hasAside">')
		expect(aside).toContain('hasContent: boolean')
		expect(aside).toContain('\'has-content\': hasContent')
		expect(aside).toContain('&:not(.has-content)')
		expect(aside).toContain(':show="hasContent && layoutStore.state === \'aside\'"')
	})

	it('composes the about avatar, planet, and character as one coordinated scene', () => {
		const scene = read('app/components/blog/BlogShinchanScene.vue')
		const page = read('app/pages/me.vue')

		expect(scene).toContain('class="scene-planet"')
		expect(scene).toContain('class="scene-profile-badge"')
		expect(scene).toContain('shinchan-planet-breathe')
		expect(scene).toContain('class="scene-profile-halo"')
		expect(scene).toContain('class="scene-avatar-tether"')
		expect(scene).toContain('class="scene-shooting-star"')
		expect(scene).toContain('class="scene-planet-clouds"')
		expect(scene).toContain('class="scene-planet-texture"')
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
		expect(page).toContain('href="#about-story"')
		expect(page).toContain('class="about-hero-features"')
		expect(page).toContain('width: min(calc(100% - 2rem), 78rem)')
		expect(page).toContain('min-height: clamp(23.5rem, 24vw, 27rem)')
		expect(page).not.toContain('margin-top: auto')
		expect(scene).toContain('width: min(19%, 12rem)')
		expect(scene).toContain('width: min(48%, 34rem)')
		expect(page).toContain('写代码')
		expect(page).toContain('持续学习')
		expect(page).toContain('认真生活')
		expect(page).not.toContain('speech="你好，我是 fly"')
	})
})
