import { describe, expect, it } from 'vitest'
import {
	disabledModulePathPrefixes,
	filterAndSortModuleItems,
	isModuleEnabled,
	moduleIdForPublicPath,
} from '../../shared/admin/modules'
import { modulesConfigSchema } from '../../shared/admin/site-config'

const modules = modulesConfigSchema.parse([
	{ id: 'weather', enabled: true, order: 0 },
	{ id: 'ai-news', enabled: true, order: 1 },
	{ id: 'articles', enabled: false, order: 2 },
	{ id: 'moments', enabled: true, order: 3 },
	{ id: 'about', enabled: true, order: 4 },
	{ id: 'music', enabled: false, order: 5 },
	{ id: 'links', enabled: true, order: 6 },
	{ id: 'archive', enabled: false, order: 7 },
])

describe('public module runtime', () => {
	it('filters disabled navigation entries and follows configured module order', () => {
		const items = [
			{ id: 'articles', text: '文章' },
			{ id: 'moments', text: '瞬间' },
			{ id: 'ai-news', text: 'AI 阅闻' },
			{ id: 'about', text: '自述' },
			{ id: 'links', text: '友链' },
			{ id: 'archive', text: '归档' },
		]

		expect(filterAndSortModuleItems(items, modules).map(item => item.id)).toEqual([
			'ai-news',
			'moments',
			'about',
			'links',
		])
	})

	it('reports enabled state from the committed module configuration', () => {
		expect(isModuleEnabled(modules, 'ai-news')).toBe(true)
		expect(isModuleEnabled(modules, 'articles')).toBe(false)
	})

	it('skips disabled public routes during static prerendering', () => {
		expect(disabledModulePathPrefixes(modules)).toEqual([
			'/atom.xml',
			'/preview',
			'/raw/',
			'/archive',
		])
	})

	it('rejects an archive configuration that would expose dead article links', () => {
		expect(() => modulesConfigSchema.parse(modules.map(module =>
			module.id === 'archive' ? { ...module, enabled: true } : module,
		))).toThrow(/Archive module requires the articles module/u)
	})

	it('maps public routes to their controlling modules', () => {
		expect(moduleIdForPublicPath('/')).toBe('articles')
		expect(moduleIdForPublicPath('/2026/welcome')).toBe('articles')
		expect(moduleIdForPublicPath('/moments/abc')).toBe('moments')
		expect(moduleIdForPublicPath('/ai.news/read/abc')).toBe('ai-news')
		expect(moduleIdForPublicPath('/me')).toBe('about')
		expect(moduleIdForPublicPath('/link')).toBe('links')
		expect(moduleIdForPublicPath('/archive')).toBe('archive')
		expect(moduleIdForPublicPath('/admin/modules')).toBeNull()
	})
})
