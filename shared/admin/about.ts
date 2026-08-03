import { z } from 'zod'
import { publicHttpUrlSchema } from '../utils/public-url'

export const aboutProfileSchema = z.object({
	title: z.string().min(1).max(120),
	summary: z.string().max(500),
	body: z.string().max(50_000),
	avatar: publicHttpUrlSchema.optional(),
	updatedAt: z.string().datetime().optional(),
}).passthrough()

export const aboutTimelineSchema = z.array(z.object({
	id: z.string().min(1).max(80),
	date: z.string().min(4).max(32),
	title: z.string().min(1).max(160),
	description: z.string().max(1000).optional(),
	link: publicHttpUrlSchema.optional(),
}).strict()).max(200)

export const aboutLinksSchema = z.array(z.object({
	id: z.string().min(1).max(80),
	label: z.string().min(1).max(80),
	url: publicHttpUrlSchema,
	icon: z.string().min(1).max(120).optional(),
}).strict()).max(50)

export const aboutProfilePublishSchema = z.object({
	profile: aboutProfileSchema,
	expectedSha: z.string().min(1),
	idempotencyKey: z.string().min(8).max(128),
})

export type AboutProfile = z.infer<typeof aboutProfileSchema>
export type AboutTimeline = z.infer<typeof aboutTimelineSchema>
export type AboutLinks = z.infer<typeof aboutLinksSchema>
