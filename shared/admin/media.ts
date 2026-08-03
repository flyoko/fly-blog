import { z } from 'zod'

export const mediaUploadPurposeSchema = z.enum(['article', 'music', 'profile'])
export const mediaKindSchema = z.enum(['image', 'audio'])
export const mediaStatusSchema = z.enum(['active', 'trashed', 'deleted'])

export const mediaObjectSchema = z.object({
	id: z.string().min(1),
	key: z.string().min(1),
	url: z.url(),
	originalName: z.string().min(1),
	purpose: mediaUploadPurposeSchema,
	kind: mediaKindSchema,
	mime: z.string().min(1),
	size: z.number().int().nonnegative(),
	sha256: z.string().regex(/^[a-f0-9]{64}$/u),
	status: mediaStatusSchema,
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	trashedAt: z.iso.datetime().nullable().optional(),
	referenceCount: z.number().int().nonnegative().default(0),
})

export type MediaUploadPurpose = z.infer<typeof mediaUploadPurposeSchema>
export type MediaObjectDto = z.infer<typeof mediaObjectSchema>
