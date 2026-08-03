import type { MusicTrack } from '#shared/admin/music'

export type MusicPlaybackMode = 'sequence' | 'shuffle'

export function normalizePlayableTracks(input: MusicTrack[]): MusicTrack[] {
	return input
		.filter(track => track.enabled)
		.toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export function nextTrackIndex(input: {
	currentIndex: number
	length: number
	direction: 1 | -1
	mode: MusicPlaybackMode
	random?: () => number
}): number {
	if (input.length <= 1)
		return 0
	if (input.mode === 'shuffle' && input.direction === 1) {
		const random = input.random ?? Math.random
		const candidate = Math.min(input.length - 1, Math.max(0, Math.floor(random() * input.length)))
		return candidate === input.currentIndex ? (candidate + 1) % input.length : candidate
	}
	return (input.currentIndex + input.direction + input.length) % input.length
}

export function nextPlayableTrackIndex(input: {
	tracks: MusicTrack[]
	currentIndex: number
	failedTrackIds: ReadonlySet<string>
	mode: MusicPlaybackMode
	random?: () => number
}): number | null {
	if (!input.tracks.length)
		return null
	const candidates = input.tracks
		.map((track, index) => ({ track, index }))
		.filter(({ track }) => !input.failedTrackIds.has(track.id))
	if (!candidates.length)
		return null
	if (input.mode === 'shuffle') {
		const random = input.random ?? Math.random
		const candidate = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))
		return candidates[candidate]!.index
	}
	for (let offset = 1; offset <= input.tracks.length; offset++) {
		const index = (input.currentIndex + offset) % input.tracks.length
		if (!input.failedTrackIds.has(input.tracks[index]!.id))
			return index
	}
	return null
}
