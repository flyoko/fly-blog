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

	it('composes the about avatar, planet, and character as one coordinated scene', () => {
		const scene = read('app/components/blog/BlogShinchanScene.vue')
		const page = read('app/pages/me.vue')

		expect(scene).toContain('class="scene-planet"')
		expect(scene).toContain('class="scene-profile-badge"')
		expect(scene).toContain('shinchan-planet-breathe')
		expect(scene).toContain('.is-about.has-custom-character .scene-profile-avatar')
		expect(page).toContain(':character-src="profileAvatar || undefined"')
		expect(page).not.toContain('speech="你好，我是 fly"')
	})
})
