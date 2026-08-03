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
})
