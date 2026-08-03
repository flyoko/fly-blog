import { z } from 'zod'
import { publicHttpUrlSchema } from '../utils/public-url'

export const musicTrackSchema = z.object({
	id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
	title: z.string().min(1).max(160),
	artist: z.string().max(160).nullable().optional(),
	source: z.string().max(240).nullable().optional(),
	audioUrl: publicHttpUrlSchema,
	coverUrl: publicHttpUrlSchema.nullable().optional(),
	duration: z.number().int().nonnegative().nullable().optional(),
	enabled: z.boolean(),
	order: z.number().int().nonnegative(),
}).passthrough()

export const musicPlaylistSchema = z.object({
	title: z.string().min(1).max(160),
	description: z.string().max(1000).default(''),
	tracks: z.array(musicTrackSchema).max(200),
}).passthrough().superRefine((playlist, ctx) => {
	const ids = new Set<string>()
	const orders = new Set<number>()
	playlist.tracks.forEach((track, index) => {
		if (ids.has(track.id))
			ctx.addIssue({ code: 'custom', path: ['tracks', index, 'id'], message: `Duplicate track id: ${track.id}` })
		if (orders.has(track.order))
			ctx.addIssue({ code: 'custom', path: ['tracks', index, 'order'], message: `Duplicate track order: ${track.order}` })
		ids.add(track.id)
		orders.add(track.order)
	})
})

export const musicPlaylistPublishSchema = z.object({
	playlist: musicPlaylistSchema,
	expectedSha: z.string().min(1),
	idempotencyKey: z.string().min(8).max(128),
})

export type MusicTrack = z.infer<typeof musicTrackSchema>
export type MusicPlaylist = z.infer<typeof musicPlaylistSchema>
