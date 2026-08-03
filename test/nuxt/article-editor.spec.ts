import type { ArticleDocument } from '../../shared/admin/articles'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	adminDraftKey,
	buildArticleSaveRequest,
	insertMarkdownImage,
	updateArticleFrontmatter,
} from '../../app/composables/useAdminDraft'
import { renderAdminMarkdown } from '../../app/utils/admin-markdown'

const root = fileURLToPath(new URL('../..', import.meta.url))

async function source(path: string) {
	return readFile(`${root}/${path}`, 'utf8')
}

const document: ArticleDocument = {
	path: 'content/posts/2026/hello.md',
	sha: 'base-sha',
	body: '# Hello',
	frontmatter: {
		title: 'Hello',
		categories: ['技术'],
		tags: [],
		custom: { keep: true },
	},
}

describe('article editor helpers', () => {
	it('keys IndexedDB drafts by repository path and base SHA', () => {
		expect(adminDraftKey(document.path, document.sha)).toBe('content/posts/2026/hello.md::base-sha')
		expect(adminDraftKey(document.path, null)).toBe('content/posts/2026/hello.md::new')
	})

	it('inserts a media image at the current cursor without losing surrounding text', () => {
		expect(insertMarkdownImage('before after', 7, 7, 'image', 'https://media.example/a.png')).toEqual({
			body: 'before ![image](https://media.example/a.png)after',
			cursor: 44,
		})
	})

	it('preserves unknown frontmatter while updating known fields', () => {
		const updated = updateArticleFrontmatter(document, {
			title: 'Changed',
			description: 'Description',
			categories: ['开发'],
			tags: ['Nuxt'],
			draft: true,
		})
		expect(updated.frontmatter).toMatchObject({
			title: 'Changed',
			description: 'Description',
			categories: ['开发'],
			tags: ['Nuxt'],
			draft: true,
			custom: { keep: true },
		})
	})

	it('builds direct and PR requests with the same local document and SHA', () => {
		const direct = buildArticleSaveRequest(document, 'direct', 'article-save-direct')
		const pullRequest = buildArticleSaveRequest(document, 'pull_request', 'article-save-pr')
		expect(direct).toMatchObject({ document, expectedSha: 'base-sha', mode: 'direct' })
		expect(pullRequest).toMatchObject({ document, expectedSha: 'base-sha', mode: 'pull_request' })
	})

	it('renders preview Markdown without executable HTML or dangerous protocols', () => {
		const html = renderAdminMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1))')
		expect(html).not.toContain('<script>')
		expect(html).not.toContain('javascript:')
		expect(html).toContain('&lt;script&gt;')
	})

	it('renders GitHub-flavored Markdown extensions used by the project', () => {
		const html = renderAdminMarkdown('| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n~~old~~')
		expect(html).toContain('<table>')
		expect(html).toContain('type="checkbox"')
		expect(html).toContain('<del>old</del>')
	})
})

describe('article editor UI boundaries', () => {
	it('uses IndexedDB and never localStorage for drafts', async () => {
		const composable = await source('app/composables/useAdminDraft.ts')
		expect(composable).toContain('indexedDB.open')
		expect(composable).not.toContain('localStorage')
	})

	it('keeps the last preview on parser failure and exposes conflict actions', async () => {
		const editor = await source('app/components/admin/AdminArticleEditor.vue')
		expect(editor).toContain('lastSuccessfulPreview')
		expect(editor).toContain('重新加载远端')
		expect(editor).toContain('比较原始 Markdown')
		expect(editor).toContain('改用 PR 发布')
	})

	it('offers direct and Pull Request publishing plus media insertion', async () => {
		const editor = await source('app/components/admin/AdminArticleEditor.vue')
		expect(editor).toContain('直接发布')
		expect(editor).toContain('创建 PR')
		expect(editor).toContain('插入媒体')
	})
})
