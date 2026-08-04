import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('mobile player and performance contracts', () => {
	it('keeps the mobile player closed until the user opens it from the shared panel', () => {
		const player = read('app/components/music/GlobalPlayer.vue')
		const panel = read('app/components/blog/BlogPanel.vue')
		const layout = read('app/layouts/default.vue')
		const store = read('app/stores/music.ts')

		expect(layout).toContain(':music-enabled="musicEnabled"')
		expect(panel).toContain('打开音乐播放器')
		expect(panel).toContain(':aria-expanded="musicStore.mobileOpen"')
		expect(panel).toContain('musicStore.toggleMobileOpen')
		expect(player).toContain('\'is-mobile-open\': store.mobileOpen')
		expect(store).toContain('const mobileOpen = ref(false)')
		expect(store).toContain('mobileOpen.value = false')
		expect(store).not.toMatch(/StoredMusicState[\s\S]*?mobileOpen\??:/u)
	})

	it('turns the expensive atmosphere into a static mobile composition', () => {
		const atmosphere = read('app/components/blog/BlogAtmosphere.vue')
		const main = read('app/assets/css/main.scss')

		expect(atmosphere).toContain('isMobilePerformanceMode')
		expect(atmosphere).toContain('if (!element || prefersReducedMotion.value || isMobilePerformanceMode.value)')
		expect(main).toMatch(/@media \(max-width: \$breakpoint-mobile\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.atmosphere-lens,[\s\S]*?animation: none;/u)
		expect(main).toMatch(/@media \(max-width: \$breakpoint-mobile\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.flow-ribbon-secondary[\s\S]*?display: none;/u)
	})

	it('does not create storyboard particles from coarse-pointer taps', () => {
		const storyboard = read('app/components/blog/BlogStoryboardInteraction.vue')
		expect(storyboard).toContain('if (!isFinePointer.value || prefersReducedMotion.value || event.button > 0)')
	})
})
