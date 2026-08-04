import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('mobile player and performance contracts', () => {
	it('keeps the player closed on every viewport until the user opens it from the shared panel', () => {
		const player = read('app/components/music/GlobalPlayer.vue')
		const panel = read('app/components/blog/BlogPanel.vue')
		const layout = read('app/layouts/default.vue')
		const store = read('app/stores/music.ts')
		const avoid = read('app/composables/useAvoid.ts')

		expect(layout).toContain(':music-enabled="musicEnabled"')
		expect(panel).toContain('打开音乐播放器')
		expect(panel).toContain(':aria-expanded="musicStore.playerOpen"')
		expect(panel).toContain('musicStore.togglePlayerOpen')
		expect(panel).not.toContain('toggle-music mobile-only')
		expect(player).toContain('\'is-open\': store.playerOpen')
		expect(player).toContain('class="music-player-console"')
		expect(player).toContain('class="music-progress-rail"')
		expect(player).toMatch(/\.music-player \{[\s\S]*?display: none;[\s\S]*?&\.is-open \{[\s\S]*?display: block;/u)
		expect(player).toMatch(/@media \(max-width: \$breakpoint-mobile\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.music-player-console \{[\s\S]*?min-height: 2\.75rem;/u)
		expect(store).toContain('const playerOpen = ref(false)')
		expect(store).toContain('playerOpen.value = false')
		expect(store).toContain('function ensureCurrentLoaded()')
		expect(store).toMatch(/function setPlayerOpen[\s\S]*?ensureCurrentLoaded\(\)/u)
		expect(store).not.toContain('if (tracks.value.length && !usesMobilePresentation())')
		expect(store).not.toMatch(/StoredMusicState[\s\S]*?playerOpen\??:/u)
		expect(avoid).toContain('useResizeObserver(originRef, updateOriginPosition)')
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
