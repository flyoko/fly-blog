import { z } from 'zod'
import { publicHttpUrlSchema } from '../utils/public-url'

export const newsItemSchema = z.object({
	id: z.string().min(1),
	sourceId: z.string().min(1),
	kind: z.enum(['hot', 'daily', 'rss', 'manual']),
	title: z.string().min(1).max(500),
	summary: z.string().max(5000).nullable(),
	url: publicHttpUrlSchema,
	originalUrl: publicHttpUrlSchema.nullable(),
	category: z.string().max(120).nullable(),
	rank: z.number().int().positive().nullable(),
	publishedAt: z.string().datetime().nullable(),
	fetchedAt: z.string().datetime(),
	selected: z.boolean(),
})

export const manualNewsRequestSchema = z.object({
	title: z.string().min(1).max(500),
	summary: z.string().max(5000).optional(),
	url: publicHttpUrlSchema,
	category: z.string().max(120).optional(),
	publishedAt: z.string().datetime().optional(),
	idempotencyKey: z.string().min(8).max(128),
})

export type NewsItemDto = z.infer<typeof newsItemSchema>
