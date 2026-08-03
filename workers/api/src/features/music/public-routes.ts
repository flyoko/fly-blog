import type { MusicPlaylist, PublicMusicPlaylist } from '../../../../../shared/admin/music'
import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import modulesRaw from '../../../../../config/site/modules.json'
import playlistRaw from '../../../../../content/playlists/default.json'
import { musicPlaylistSchema, publicMusicPlaylistSchema } from '../../../../../shared/admin/music'
import { modulesConfigSchema } from '../../../../../shared/admin/site-config'
import { success } from '../../lib/api-error'
import { publicCacheData } from '../../lib/public-cache'

const configuredModules = modulesConfigSchema.parse(modulesRaw)
const configuredPlaylist = musicPlaylistSchema.parse(playlistRaw)
const configuredEnabled = configuredModules.some(module => module.id === 'music' && module.enabled)

export interface PublicMusicRoutesOptions {
	enabled?: boolean
	playlist?: MusicPlaylist
	configVersion?: string
}

function publicPlaylist(enabled: boolean, playlist: MusicPlaylist): PublicMusicPlaylist {
	return publicMusicPlaylistSchema.parse({
		enabled,
		title: playlist.title,
		description: playlist.description,
		tracks: enabled
			? playlist.tracks.filter(track => track.enabled).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
			: [],
	})
}

export function createPublicMusicRoutes(options: PublicMusicRoutesOptions = {}) {
	const routes = new Hono<AppEnvironment>()
	const enabled = options.enabled ?? configuredEnabled
	const playlist = options.playlist ?? configuredPlaylist
	const configVersion = options.configVersion ?? JSON.stringify({ enabled, playlist })

	routes.get('/playlist', async (c) => {
		const cached = await publicCacheData(c, configVersion, async () => publicPlaylist(enabled, playlist), 1800)
		c.header('Cache-Control', 'public, max-age=1800')
		c.header('X-Fly-Cache', cached.status)
		return success(c, cached.data)
	})

	return routes
}

export const publicMusicRoutes = createPublicMusicRoutes()
