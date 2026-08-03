import { z } from 'zod'
import { publicHttpUrlSchema } from '../utils/public-url'

const coordinatePairPattern = /^[+-]?\d{1,3}(?:\.\d+)?(?:\s*[,，;/]\s*|\s+)[+-]?\d{1,3}(?:\.\d+)?$/u
const degreeCoordinatePattern = /\d{1,3}[°º]\s*\d{1,2}(?:['′]\s*\d{1,2}(?:\.\d+)?["″]?)?\s*[NSEW北南东西]/iu
const plusCodePattern = /\b[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,3}\b/iu
const ipAddressPattern = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f]*:[0-9a-f:]+$/iu
const locationMetadataPattern = /\b(?:gps|lat(?:itude)?|lng|lon(?:gitude)?)\b|经度|纬度|坐标|geo:|:\/\//iu
const postalCodePattern = /\b\d{5,6}(?:-\d{4})?\b/u
const streetAddressPattern = /\d+\s*(?:[号栋幢室楼]|单元)|[路街巷弄]|大道|公路|小区|大厦|园区|门牌|\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|suite|apartment|apt\.?)\b/iu

export const coarseLocationSchema = z.string().trim().min(1).max(80).refine((value) => {
	return !coordinatePairPattern.test(value)
		&& !degreeCoordinatePattern.test(value)
		&& !ipAddressPattern.test(value)
		&& !locationMetadataPattern.test(value)
		&& !plusCodePattern.test(value)
		&& !postalCodePattern.test(value)
		&& !streetAddressPattern.test(value)
}, 'Only city, region, or country-level locations are allowed')

export const momentStatusSchema = z.enum(['draft', 'published', 'withdrawn'])
export type MomentStatus = z.infer<typeof momentStatusSchema>

export const momentMusicSchema = z.object({
	id: z.string().min(1).max(120),
	title: z.string().min(1).max(160),
	artist: z.string().max(160).optional(),
	url: publicHttpUrlSchema,
}).strict()

export const momentInputSchema = z.object({
	content: z.string().min(1).max(10_000),
	status: momentStatusSchema.default('draft'),
	tags: z.array(z.string().trim().min(1).max(32)).max(8).default([]).transform(tags => [...new Set(tags)]),
	city: coarseLocationSchema.nullable().optional(),
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
		city: coarseLocationSchema.nullable(),
		music: momentMusicSchema.nullable(),
		mediaIds: z.array(z.string().uuid()),
		version: z.number().int().positive(),
		publishedAt: z.string().datetime().nullable(),
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
	})),
})

export type MomentBackupSnapshot = z.infer<typeof momentBackupSnapshotSchema>
