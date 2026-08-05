import { describe, expect, it } from 'vitest'
import { filterArticlePreviewPages } from '../../shared/article-preview-build'

interface TestPage {
	path: string
	file?: string
	children?: TestPage[]
}

describe('article preview build', () => {
	it('removes admin routes while preserving public pages and nested public children', () => {
		const pages: TestPage[] = [
			{ path: '/', file: '/repo/app/pages/index.vue' },
			{
				path: '/public-parent',
				children: [
					{ path: '/public-parent/child', file: '/repo/app/pages/public/child.vue' },
					{ path: '/admin/nested', file: '/repo/app/pages/admin/nested.vue' },
				],
			},
			{
				path: '/admin',
				file: '/repo/app/pages/admin.vue',
				children: [{ path: '/admin/articles', file: '/repo/app/pages/admin/articles/index.vue' }],
			},
			{ path: '/administrator', file: '/repo/app/pages/administrator.vue' },
		]

		const filtered = filterArticlePreviewPages(pages)

		expect(filtered.map(page => page.path)).toEqual(['/', '/public-parent', '/administrator'])
		expect(filtered[1]?.children?.map(page => page.path)).toEqual(['/public-parent/child'])
		expect(pages).toHaveLength(4)
	})
})
