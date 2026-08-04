import { z } from 'zod'
import { publicHttpUrlSchema } from '../utils/public-url'

export const newsContentModeSchema = z.enum(['full', 'summary'])

export const newsImageSchema = z.object({
	url: publicHttpUrlSchema,
	alt: z.string().max(500).nullable(),
	mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
})

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
	readerPath: z.string().startsWith('/ai.news/read/').nullable(),
	contentMode: newsContentModeSchema.nullable(),
	coverImage: newsImageSchema.nullable().default(null),
})

export const newsDocumentSchema = z.object({
	item: newsItemSchema,
	readerKey: z.string().regex(/^[a-f0-9]{32}$/u),
	bodyText: z.string().min(1).max(100_000),
	images: z.array(newsImageSchema).max(6).default([]),
	contentMode: newsContentModeSchema,
	attribution: z.object({
		name: z.string().min(1).max(160),
		url: publicHttpUrlSchema,
	}),
	sourceUrl: publicHttpUrlSchema,
	originalUrl: publicHttpUrlSchema.nullable(),
	fetchedAt: z.string().datetime(),
})

export const manualNewsRequestSchema = z.object({
	title: z.string().min(1).max(500),
	summary: z.string().max(5000).optional(),
	url: publicHttpUrlSchema,
	category: z.string().max(120).optional(),
	publishedAt: z.string().datetime().optional(),
	idempotencyKey: z.string().min(8).max(128),
})

export const deleteNewsRequestSchema = z.object({
	id: z.string().min(1).max(2_000),
})

export type NewsContentMode = z.infer<typeof newsContentModeSchema>
export type NewsImageDto = z.infer<typeof newsImageSchema>
export type NewsItemDto = z.infer<typeof newsItemSchema>
export type NewsDocumentDto = z.infer<typeof newsDocumentSchema>
