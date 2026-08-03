import type { MusicTrack } from '#shared/admin/music'

export type MusicPlaybackMode = 'sequence' | 'shuffle'

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
	const loading = ref(false)
	const error = ref<string | null>(null)
	const audio = shallowRef<HTMLAudioElement | null>(null)
	let initialized = false
	let consecutiveErrors = 0
	let lastPersistedSecond = -1

	const currentTrack = computed(() => tracks.value[currentIndex.value] ?? null)
	const hasTracks = computed(() => tracks.value.length > 0)

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
			expanded: expanded.value,
		}
		localStorage.setItem(storageKey, JSON.stringify(state))
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
			consecutiveErrors = 0
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
		if (tracks.value.length <= 1)
			return 0
		if (mode.value === 'shuffle' && direction === 1) {
			let candidate = currentIndex.value
			while (candidate === currentIndex.value)
				candidate = Math.floor(Math.random() * tracks.value.length)
			return candidate
		}
		return (currentIndex.value + direction + tracks.value.length) % tracks.value.length
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

	function initialize(input: MusicTrack[]) {
		const nextTracks = input
			.filter(track => track.enabled)
			.toSorted((left, right) => left.order - right.order)
		const signature = nextTracks.map(track => `${track.id}:${track.audioUrl}:${track.order}`).join('|')
		const currentSignature = tracks.value.map(track => `${track.id}:${track.audioUrl}:${track.order}`).join('|')
		if (initialized && signature === currentSignature)
			return
		tracks.value = nextTracks
		const stored = readStored()
		volume.value = typeof stored.volume === 'number' ? Math.min(1, Math.max(0, stored.volume)) : 0.7
		muted.value = Boolean(stored.muted)
		mode.value = stored.mode === 'shuffle' ? 'shuffle' : 'sequence'
		expanded.value = Boolean(stored.expanded)
		const restoredIndex = stored.trackId ? tracks.value.findIndex(track => track.id === stored.trackId) : -1
		currentIndex.value = restoredIndex >= 0 ? restoredIndex : 0
		initialized = true
		if (tracks.value.length)
			loadCurrent(typeof stored.progress === 'number' ? stored.progress : 0)
	}

	async function play() {
		if (!hasTracks.value)
			return
		attachAudio()
		if (!audio.value)
			return
		loading.value = true
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

	async function changeTrack(index: number, autoplay: boolean) {
		if (!tracks.value.length)
			return
		const normalized = (index + tracks.value.length) % tracks.value.length
		currentIndex.value = normalized
		loadCurrent(0)
		if (autoplay)
			await play()
	}

	async function next(autoplay = playing.value) {
		await changeTrack(pickNextIndex(1), autoplay)
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
		consecutiveErrors += 1
		if (consecutiveErrors >= tracks.value.length) {
			error.value = '当前歌单暂时都无法播放，请检查音频链接后重试。'
			return
		}
		error.value = '当前音频加载失败，正在尝试下一首。'
		await next(true)
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
	}
})
