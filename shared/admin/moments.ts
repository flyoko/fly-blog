import { z } from 'zod'

export const momentStatusSchema = z.enum(['draft', 'published', 'withdrawn'])
export type MomentStatus = z.infer<typeof momentStatusSchema>

export const momentMusicSchema = z.object({
	id: z.string().min(1).max(120),
	title: z.string().min(1).max(160),
	artist: z.string().max(160).optional(),
	url: z.string().url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol)),
}).strict()

export const momentInputSchema = z.object({
	content: z.string().min(1).max(10_000),
	status: momentStatusSchema.default('draft'),
	tags: z.array(z.string().trim().min(1).max(32)).max(8).default([]).transform(tags => [...new Set(tags)]),
	city: z.string().trim().min(1).max(80).nullable().optional(),
	music: momentMusicSchema.nullable().optional(),
	mediaIds: z.array(z.string().uuid()).max(9).default([]).transform(ids => [...new Set(ids)]),
})

export const momentCreateRequestSchema = z.object({
	moment: momentInputSchema,
	idempotencyKey: z.string().min(8).max(128),
})

export const momentUpdateRequestSchema = z.object({
	moment: momentInputSchema,
	expectedVersion: z.number().int().positive(),
	idempotencyKey: z.string().min(8).max(128),
})

export const momentTransitionRequestSchema = z.object({
	expectedVersion: z.number().int().positive(),
	idempotencyKey: z.string().min(8).max(128),
})

export interface MomentMediaDto {
	id: string
	url: string
	mime: string
	alt: string
	width?: number
	height?: number
}

export interface MomentDto {
	id: string
	content: string
	status: MomentStatus
	tags: string[]
	city: string | null
	music: z.infer<typeof momentMusicSchema> | null
	media: MomentMediaDto[]
	likeCount: number
	liked?: boolean
	version: number
	publishedAt: string | null
	createdAt: string
	updatedAt: string
}

export interface MomentListDto {
	items: MomentDto[]
	total: number
	page: number
	pageSize: number
}

export const momentBackupSnapshotSchema = z.object({
	schemaVersion: z.literal(1),
	exportedAt: z.string().datetime(),
	lastChangedAt: z.string().datetime().nullable(),
	checksum: z.string().regex(/^[a-f0-9]{64}$/u),
	moments: z.array(z.object({
		id: z.string().uuid(),
		content: z.string(),
		status: momentStatusSchema,
		tags: z.array(z.string()),
		city: z.string().nullable(),
		music: momentMusicSchema.nullable(),
		mediaIds: z.array(z.string().uuid()),
		version: z.number().int().positive(),
		publishedAt: z.string().datetime().nullable(),
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
	})),
})

export type MomentBackupSnapshot = z.infer<typeof momentBackupSnapshotSchema>
