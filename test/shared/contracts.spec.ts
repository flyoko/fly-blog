import { describe, expect, it } from 'vitest'
import footerConfig from '../../config/site/footer.json'
import weatherConfig from '../../config/site/weather.json'
import {
	articleDocumentSchema,
	decodeArticleId,
	encodeArticleId,
} from '../../shared/admin/articles'
import {
	categoriesConfigSchema,
	footerConfigSchema,
	modulesConfigSchema,
	navigationConfigSchema,
	weatherConfigSchema,
} from '../../shared/admin/site-config'

describe('admin contracts', () => {
	it('round-trips an article repository path', () => {
		const path = 'content/posts/2026/welcome.md'
		expect(decodeArticleId(encodeArticleId(path))).toBe(path)
	})

	it('preserves unknown legal frontmatter', () => {
		const parsed = articleDocumentSchema.parse({
			path: 'content/posts/2026/welcome.md',
			sha: 'abc',
			body: '# Hello',
			frontmatter: { title: 'Hello', custom: 'keep-me' },
		})
		expect(parsed.frontmatter.custom).toBe('keep-me')
	})

	it('rejects article paths outside content/posts', () => {
		expect(() => articleDocumentSchema.parse({
			path: '../secrets.txt',
			sha: 'abc',
			body: '',
			frontmatter: {},
		})).toThrow()
	})

	it('rejects duplicate category names', () => {
		expect(() => categoriesConfigSchema.parse([
			{ name: '技术', icon: 'tabler:code' },
			{ name: '技术', icon: 'tabler:mouse' },
		])).toThrow()
	})

	it('rejects duplicate navigation ids', () => {
		expect(() => navigationConfigSchema.parse([
			{ id: 'articles', title: '', items: [] },
			{ id: 'articles', title: '重复', items: [] },
		])).toThrow()
	})

	it('rejects unknown module ids', () => {
		expect(() => modulesConfigSchema.parse([
			{ id: 'unknown', enabled: false, order: 1 },
		])).toThrow()
	})

	it('hides theme and site source links while keeping personal GitHub enabled', () => {
		const parsed = footerConfigSchema.parse(footerConfig)
		expect(parsed.showPersonalGitHub).toBe(true)
		expect(parsed.showThemeSource).toBe(false)
		expect(parsed.showSiteSource).toBe(false)
		const social = parsed.nav.find(group => group.id === 'social')
		expect(social?.items).toContainEqual(expect.objectContaining({
			id: 'qq-email',
			text: '2960257447@qq.com',
			url: 'mailto:2960257447@qq.com',
		}))
	})

	it('enables the fixed Hangzhou weather location', () => {
		expect(weatherConfigSchema.parse(weatherConfig)).toMatchObject({
			enabled: true,
			city: '杭州',
			latitude: 30.2741,
			longitude: 120.1551,
		})
	})
})
