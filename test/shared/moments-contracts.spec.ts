import { describe, expect, it } from 'vitest'
import { aboutLinksSchema, aboutProfileSchema } from '../../shared/admin/about'
import { momentCreateRequestSchema, momentInputSchema } from '../../shared/admin/moments'

describe('cycle 2 contracts', () => {
	it('normalizes duplicate tags and media ids', () => {
		const mediaId = crypto.randomUUID()
		const parsed = momentInputSchema.parse({
			content: 'hello',
			tags: ['生活', '生活'],
			mediaIds: [mediaId, mediaId],
		})
		expect(parsed.tags).toEqual(['生活'])
		expect(parsed.mediaIds).toEqual([mediaId])
	})

	it('rejects precise coordinate-shaped city values by length and schema boundaries', () => {
		expect(momentInputSchema.safeParse({ content: '', tags: [], mediaIds: [] }).success).toBe(false)
		expect(momentInputSchema.safeParse({ content: 'ok', tags: Array.from({ length: 9 }, (_, i) => String(i)), mediaIds: [] }).success).toBe(false)
	})

	it('requires idempotency keys for moment writes', () => {
		expect(momentCreateRequestSchema.safeParse({ moment: { content: 'hello' } }).success).toBe(false)
	})

	it('rejects non-http about links', () => {
		expect(aboutLinksSchema.safeParse([{ id: 'bad', label: 'bad', url: 'javascript:alert(1)' }]).success).toBe(false)
		expect(aboutProfileSchema.safeParse({ title: 'fly', summary: '', body: 'hello', avatar: 'file:///tmp/a' }).success).toBe(false)
	})
})
