import { describe, expect, it } from 'vitest'
import { parseAboutProfile, serializeAboutProfile } from '../src/features/about/codec'

describe('about profile codec', () => {
	it('round trips structured frontmatter and markdown body', () => {
		const content = serializeAboutProfile({
			title: '关于我',
			summary: 'summary',
			body: '\nHello **world**.\n',
			updatedAt: '2026-08-03T00:00:00.000Z',
		})
		expect(parseAboutProfile({ sha: 'sha', content })).toMatchObject({
			sha: 'sha',
			title: '关于我',
			summary: 'summary',
			body: 'Hello **world**.\n',
		})
	})
	it('preserves unknown legal frontmatter while excluding the repository sha', () => {
		const parsed = parseAboutProfile({
			sha: 'profile-sha',
			content: `---
 title: 关于我
 summary: summary
 updatedAt: 2026-08-03T00:00:00.000Z
 date: 2026-08-03
 sitemap: false
 customMeta:
   preserved: true
 ---
 Hello.
 `.replace(/^ /gmu, ''),
		})
		expect(parsed).toMatchObject({
			sha: 'profile-sha',
			date: '2026-08-03',
			sitemap: false,
			customMeta: { preserved: true },
		})

		const { sha, ...profile } = parsed
		expect(sha).toBe('profile-sha')
		const serialized = serializeAboutProfile(profile)
		expect(serialized).not.toContain('sha:')
		expect(parseAboutProfile({ sha: 'next-sha', content: serialized })).toMatchObject({
			date: '2026-08-03',
			sitemap: false,
			customMeta: { preserved: true },
		})
	})

})
