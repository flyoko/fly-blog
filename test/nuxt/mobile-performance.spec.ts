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
		const sidebar = read('app/components/blog/BlogSidebar.vue')
		const panel = read('app/components/blog/BlogPanel.vue')
		const reusable = read('app/assets/css/reusable.scss')
		const article = read('app/components/post/Article.vue')

		expect(atmosphere).toContain('isMobilePerformanceMode')
		expect(atmosphere).toContain('if (!element || !pointerElement || !isDynamic.value || !isFinePointer.value || prefersReducedMotion.value || isMobilePerformanceMode.value || isRouteSettling.value)')
		expect(main).toMatch(/@media \(max-width: \$breakpoint-mobile\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.atmosphere-lens,[\s\S]*?animation: none;/u)
		expect(main).toMatch(/@media \(max-width: \$breakpoint-mobile\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.flow-ribbon-secondary[\s\S]*?display: none;/u)
		expect(main).toMatch(/\.atmosphere-stars-far \{[\s\S]*?animation: none;/u)
		expect(main).toMatch(/\.flow-thread,[\s\S]*?\.flow-signal \{[\s\S]*?animation: none;/u)
		expect(sidebar).toMatch(/@media \(max-width: \$breakpoint-mobile\)[\s\S]*?#blog-sidebar[\s\S]*?backdrop-filter: none;/u)
		expect(panel).toMatch(/@media \(max-width: \$breakpoint-mobile\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?#blog-panel[\s\S]*?backdrop-filter: none;/u)
		expect(reusable).toContain('article or moment card creates one live compositor surface per row')
		expect(reusable).toMatch(/@media \(max-width: \$breakpoint-mobile\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?--glass-material-filter: none;/u)
		expect(article).toContain('loading="lazy"')
		expect(article).toContain('fetchpriority="low"')
		expect(article).toContain('content-visibility: auto')
	})

	it('does not create storyboard particles from coarse-pointer taps', () => {
		const storyboard = read('app/components/blog/BlogStoryboardInteraction.vue')
		expect(storyboard).toContain('if (!isDynamic.value || !isFinePointer.value || prefersReducedMotion.value || event.button > 0)')
		expect(storyboard).toContain('while (layer.childElementCount > 10)')
	})

	it('reduces pointer-reactive work on compact desktop layouts', () => {
		const surface = read('app/components/blog/BlogSurfaceInteraction.vue')
		expect(surface).toContain('useMediaQuery(\'(max-width: 1180px)\')')
		expect(surface).toContain('active && eventTarget instanceof Node && active.contains(eventTarget)')
		expect(surface).toContain('pendingX = event.clientX')
		expect(surface).toContain('if (immersive)')
	})
})
