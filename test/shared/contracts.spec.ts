import { describe, expect, it } from 'vitest'
import articleConfig from '../../config/site/article.json'
import footerConfig from '../../config/site/footer.json'
import weatherConfig from '../../config/site/weather.json'
import { analyticsVisitorQuerySchema } from '../../shared/admin/analytics'
import {
	articleDocumentSchema,
	decodeArticleId,
	encodeArticleId,
} from '../../shared/admin/articles'
import {
	articlePresentationConfigSchema,
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

	it('defaults recent visitor pagination to ten rows', () => {
		const parsed = analyticsVisitorQuerySchema.parse({
			from: '2026-08-01T00:00:00.000Z',
			to: '2026-08-04T00:00:00.000Z',
		})
		expect(parsed.page).toBe(1)
		expect(parsed.pageSize).toBe(10)
	})

	it('validates backend-managed article header ads', () => {
		expect(articlePresentationConfigSchema.parse(articleConfig)).toEqual({ headerAds: [] })
		expect(() => articlePresentationConfigSchema.parse({
			headerAds: [{ id: 'promo', enabled: true, label: '广告', title: '', description: '', image: '', href: '' }],
		})).toThrow()
		expect(articlePresentationConfigSchema.parse({
			headerAds: [{ id: 'promo', enabled: true, label: '广告', title: '推荐服务', description: '', image: '/media/banner.webp', href: 'https://example.com' }],
		}).headerAds).toHaveLength(1)
		expect(() => articlePresentationConfigSchema.parse({
			headerAds: [{ id: 'escape', enabled: true, label: '广告', title: '危险跳转', description: '', image: '', href: '/\\evil.example/path' }],
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
