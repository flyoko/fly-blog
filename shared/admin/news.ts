import { z } from 'zod'

export const newsItemSchema = z.object({
	id: z.string().min(1),
	sourceId: z.string().min(1),
	kind: z.enum(['hot', 'daily', 'rss', 'manual']),
	title: z.string().min(1).max(500),
	summary: z.string().max(5000).nullable(),
	url: z.string().url(),
	originalUrl: z.string().url().nullable(),
	category: z.string().max(120).nullable(),
	rank: z.number().int().positive().nullable(),
	publishedAt: z.string().datetime().nullable(),
	fetchedAt: z.string().datetime(),
	selected: z.boolean(),
})

export const manualNewsRequestSchema = z.object({
	title: z.string().min(1).max(500),
	summary: z.string().max(5000).optional(),
	url: z.string().url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol)),
	category: z.string().max(120).optional(),
	publishedAt: z.string().datetime().optional(),
	idempotencyKey: z.string().min(8).max(128),
})

export type NewsItemDto = z.infer<typeof newsItemSchema>
