import type { MusicTrack } from '../../shared/admin/music'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
	nextPlayableTrackIndex,
	nextTrackIndex,
	normalizePlayableTracks,
} from '../../app/utils/music-playback'
import { resolvePublicApiUrl } from '../../app/utils/public-api'

const tracks: MusicTrack[] = [
	{ id: 'b', title: 'B', audioUrl: 'https://media.example.com/b.mp3', enabled: true, order: 1 },
	{ id: 'disabled', title: 'Disabled', audioUrl: 'https://media.example.com/off.mp3', enabled: false, order: 2 },
	{ id: 'a', title: 'A', audioUrl: 'https://media.example.com/a.mp3', enabled: true, order: 0 },
]

describe('music playback helpers', () => {
	it('keeps only enabled tracks in stable order', () => {
		expect(normalizePlayableTracks(tracks).map(track => track.id)).toEqual(['a', 'b'])
	})

	it('uses the canonical API origin on the Pages backup domain', () => {
		expect(resolvePublicApiUrl('/api/music/playlist', 'fly-living.pages.dev'))
			.toBe('https://flyovo.cc.cd/api/music/playlist')
		expect(resolvePublicApiUrl('/api/weather', 'fly-living.pages.dev'))
			.toBe('https://flyovo.cc.cd/api/weather')
		expect(resolvePublicApiUrl('/api/music/playlist', 'flyovo.cc.cd'))
			.toBe('/api/music/playlist')
		expect(resolvePublicApiUrl('/api/weather', 'flyovo.cc.cd'))
			.toBe('/api/weather')
	})

	it('keeps the player compact and exposes volume through a vertical popover', () => {
		const source = readFileSync(new URL('../../app/components/music/GlobalPlayer.vue', import.meta.url), 'utf8')
		const detailsIndex = source.indexOf('class="music-player-details"')
		const volumeIndex = source.indexOf('class="music-volume-control"')

		expect(source).toContain('class="music-player-console"')
		expect(source).toContain('class="music-progress-rail"')
		expect(detailsIndex).toBeGreaterThan(-1)
		expect(volumeIndex).toBeGreaterThan(-1)
		expect(volumeIndex).toBeLessThan(detailsIndex)
		expect(source).toContain(':aria-expanded="store.expanded"')
		expect(source).toContain('aria-label="调节音量"')
		expect(source).toContain('aria-orientation="vertical"')
		expect(source).toContain('class="music-volume-panel"')
		expect(source).toContain('writing-mode: vertical-lr')
		expect(source).toContain('store.setVolume')
		expect(source).toContain('store.toggleMuted')
		expect(source).toContain('Math.round(store.volume * 100)')
		expect(source).not.toMatch(/music-player-details[\s\S]*?grid-template-columns: 2rem minmax\(0, 1fr\) 2\.6rem/u)
		expect(source).not.toContain('music-cover-large')
	})

	it('wraps sequence playback and avoids immediate shuffle repeats', () => {
		expect(nextTrackIndex({ currentIndex: 1, length: 2, direction: 1, mode: 'sequence' })).toBe(0)
		expect(nextTrackIndex({ currentIndex: 0, length: 2, direction: -1, mode: 'sequence' })).toBe(1)
		expect(nextTrackIndex({ currentIndex: 0, length: 2, direction: 1, mode: 'shuffle', random: () => 0 })).toBe(1)
	})

	it('skips tracks already attempted during one error traversal', () => {
		const playable = normalizePlayableTracks(tracks)
		expect(nextPlayableTrackIndex({
			tracks: playable,
			currentIndex: 0,
			failedTrackIds: new Set(['a']),
			mode: 'sequence',
		})).toBe(1)
		expect(nextPlayableTrackIndex({
			tracks: playable,
			currentIndex: 1,
			failedTrackIds: new Set(['a', 'b']),
			mode: 'sequence',
		})).toBeNull()
	})
})
