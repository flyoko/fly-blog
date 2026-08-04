import type { MusicTrack } from '#shared/admin/music'
import type { MusicPlaybackMode } from '~/utils/music-playback'
import {
	nextPlayableTrackIndex,
	nextTrackIndex,
	normalizePlayableTracks,
} from '~/utils/music-playback'

interface StoredMusicState {
	trackId?: string
	progress?: number
	volume?: number
	muted?: boolean
	mode?: MusicPlaybackMode
	expanded?: boolean
}

const storageKey = 'fly-living-music-state-v1'

export const useMusicStore = defineStore('music', () => {
	const tracks = ref<MusicTrack[]>([])
	const currentIndex = ref(0)
	const playing = ref(false)
	const progress = ref(0)
	const duration = ref(0)
	const volume = ref(0.7)
	const muted = ref(false)
	const mode = ref<MusicPlaybackMode>('sequence')
	const expanded = ref(false)
	const playerOpen = ref(false)
	const loading = ref(false)
	const error = ref<string | null>(null)
	const audio = shallowRef<HTMLAudioElement | null>(null)
	let initialized = false
	let loadedTrackUrl: string | null = null
	const failedTrackIds = new Set<string>()
	let lastPersistedSecond = -1

	const currentTrack = computed(() => tracks.value[currentIndex.value] ?? null)
	const hasTracks = computed(() => tracks.value.length > 0)

	function usesMobilePresentation() {
		if (!import.meta.client)
			return false
		return window.matchMedia('(max-width: 768px)').matches
			|| window.matchMedia('(hover: none) and (pointer: coarse)').matches
	}

	function readStored(): StoredMusicState {
		if (!import.meta.client)
			return {}
		try {
			return JSON.parse(localStorage.getItem(storageKey) || '{}') as StoredMusicState
		}
		catch {
			return {}
		}
	}

	function persist() {
		if (!import.meta.client)
			return
		const state: StoredMusicState = {
			trackId: currentTrack.value?.id,
			progress: Math.max(0, progress.value),
			volume: volume.value,
			muted: muted.value,
			mode: mode.value,
			expanded: usesMobilePresentation() ? false : expanded.value,
		}
		try {
			localStorage.setItem(storageKey, JSON.stringify(state))
		}
		catch {
			// Storage can be unavailable in privacy modes; playback must continue.
		}
	}

	function applyAudioPreferences() {
		if (!audio.value)
			return
		audio.value.volume = volume.value
		audio.value.muted = muted.value
	}

	function attachAudio() {
		if (!import.meta.client || audio.value)
			return
		const element = new Audio()
		element.preload = 'metadata'
		element.addEventListener('loadstart', () => {
			loading.value = true
		})
		element.addEventListener('canplay', () => {
			loading.value = false
			duration.value = Number.isFinite(element.duration) ? element.duration : currentTrack.value?.duration ?? 0
		})
		element.addEventListener('loadedmetadata', () => {
			duration.value = Number.isFinite(element.duration) ? element.duration : currentTrack.value?.duration ?? 0
		})
		element.addEventListener('play', () => {
			playing.value = true
			loading.value = false
			error.value = null
			failedTrackIds.clear()
		})
		element.addEventListener('pause', () => {
			playing.value = false
			persist()
		})
		element.addEventListener('timeupdate', () => {
			progress.value = Number.isFinite(element.currentTime) ? element.currentTime : 0
			const second = Math.floor(progress.value)
			if (second !== lastPersistedSecond && second % 5 === 0) {
				lastPersistedSecond = second
				persist()
			}
		})
		element.addEventListener('ended', () => {
			void next(true)
		})
		element.addEventListener('error', () => {
			void handleTrackError()
		})
		audio.value = element
		applyAudioPreferences()
	}

	function pickNextIndex(direction: 1 | -1): number {
		return nextTrackIndex({
			currentIndex: currentIndex.value,
			length: tracks.value.length,
			direction,
			mode: mode.value,
		})
	}

	function loadCurrent(restoreProgress = 0) {
		attachAudio()
		const element = audio.value
		const track = currentTrack.value
		if (!element || !track)
			return
		playing.value = false
		loading.value = true
		error.value = null
		progress.value = Math.max(0, restoreProgress)
		duration.value = track.duration ?? 0
		element.src = track.audioUrl
		loadedTrackUrl = track.audioUrl
		element.load()
		if (restoreProgress > 0) {
			const restore = () => {
				element.currentTime = Math.min(restoreProgress, Number.isFinite(element.duration) ? element.duration : restoreProgress)
				element.removeEventListener('loadedmetadata', restore)
			}
			element.addEventListener('loadedmetadata', restore)
		}
		persist()
	}

	function ensureCurrentLoaded() {
		const track = currentTrack.value
		if (!track || loadedTrackUrl === track.audioUrl)
			return
		loadCurrent(progress.value)
	}

	function initialize(input: MusicTrack[]) {
		const nextTracks = normalizePlayableTracks(input)
		const signature = nextTracks.map(track => `${track.id}:${track.audioUrl}:${track.order}`).join('|')
		const currentSignature = tracks.value.map(track => `${track.id}:${track.audioUrl}:${track.order}`).join('|')
		if (initialized && signature === currentSignature)
			return
		tracks.value = nextTracks
		const stored = readStored()
		volume.value = typeof stored.volume === 'number' ? Math.min(1, Math.max(0, stored.volume)) : 0.7
		muted.value = Boolean(stored.muted)
		mode.value = stored.mode === 'shuffle' ? 'shuffle' : 'sequence'
		expanded.value = usesMobilePresentation() ? false : Boolean(stored.expanded)
		playerOpen.value = false
		const restoredIndex = stored.trackId ? tracks.value.findIndex(track => track.id === stored.trackId) : -1
		currentIndex.value = restoredIndex >= 0 ? restoredIndex : 0
		initialized = true
		loadedTrackUrl = null
		const restoredProgress = typeof stored.progress === 'number' ? Math.max(0, stored.progress) : 0
		progress.value = restoredProgress
		duration.value = currentTrack.value?.duration ?? 0
	}

	async function play(resetFailures = true) {
		if (!hasTracks.value)
			return
		ensureCurrentLoaded()
		if (!audio.value)
			return
		if (resetFailures)
			failedTrackIds.clear()
		loading.value = true
		if (resetFailures)
			error.value = null
		try {
			await audio.value.play()
		}
		catch {
			loading.value = false
			playing.value = false
			error.value = '浏览器需要一次用户操作才能开始播放。'
		}
	}

	function pause() {
		audio.value?.pause()
	}

	async function toggle() {
		if (playing.value)
			pause()
		else
			await play()
	}

	async function changeTrack(index: number, autoplay: boolean, resetFailures = true) {
		if (!tracks.value.length)
			return
		if (resetFailures)
			failedTrackIds.clear()
		const normalized = (index + tracks.value.length) % tracks.value.length
		currentIndex.value = normalized
		loadCurrent(0)
		if (autoplay)
			await play(resetFailures)
	}

	async function next(autoplay = playing.value, resetFailures = true) {
		await changeTrack(pickNextIndex(1), autoplay, resetFailures)
	}

	async function previous() {
		if (audio.value && audio.value.currentTime > 5) {
			seek(0)
			return
		}
		await changeTrack(pickNextIndex(-1), playing.value)
	}

	async function handleTrackError() {
		loading.value = false
		playing.value = false
		if (currentTrack.value)
			failedTrackIds.add(currentTrack.value.id)
		const nextIndex = nextPlayableTrackIndex({
			tracks: tracks.value,
			currentIndex: currentIndex.value,
			failedTrackIds,
			mode: mode.value,
		})
		if (nextIndex === null) {
			audio.value?.pause()
			error.value = '当前歌单暂时都无法播放，请检查音频链接后重试。'
			return
		}
		await changeTrack(nextIndex, false, false)
		error.value = '当前音频加载失败，正在尝试下一首。'
		await play(false)
	}

	function seek(value: number) {
		if (!audio.value)
			return
		const maximum = Number.isFinite(audio.value.duration) ? audio.value.duration : duration.value
		const target = Math.min(Math.max(0, value), maximum || value)
		audio.value.currentTime = target
		progress.value = target
		persist()
	}

	function setVolume(value: number) {
		volume.value = Math.min(1, Math.max(0, value))
		if (volume.value > 0)
			muted.value = false
		applyAudioPreferences()
		persist()
	}

	function toggleMuted() {
		muted.value = !muted.value
		applyAudioPreferences()
		persist()
	}

	function toggleMode() {
		mode.value = mode.value === 'sequence' ? 'shuffle' : 'sequence'
		persist()
	}

	function toggleExpanded() {
		expanded.value = !expanded.value
		persist()
	}

	function setPlayerOpen(value: boolean) {
		playerOpen.value = value
		if (!value)
			return
		if (usesMobilePresentation())
			expanded.value = false
		ensureCurrentLoaded()
	}

	function togglePlayerOpen() {
		setPlayerOpen(!playerOpen.value)
	}

	return {
		tracks,
		currentTrack,
		currentIndex,
		hasTracks,
		playing,
		progress,
		duration,
		volume,
		muted,
		mode,
		expanded,
		playerOpen,
		loading,
		error,
		initialize,
		play,
		pause,
		toggle,
		next,
		previous,
		seek,
		setVolume,
		toggleMuted,
		toggleMode,
		toggleExpanded,
		setPlayerOpen,
		togglePlayerOpen,
	}
})
