import type { ArticleDocument } from '../../shared/admin/articles'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import {
	adminDraftKey,
	applyMarkdownEdit,
	buildArticleSaveRequest,
	cloneArticleDocument,
	insertMacWindowBlock,
	insertMarkdownImage,
	updateArticleFrontmatter,
} from '../../app/composables/useAdminDraft'
import { normalizeArticleList } from '../../app/composables/useArticle'
import { isDraftFrontmatter } from '../../shared/content/drafts'

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
	it('normalizes a missing public article query to an empty list', () => {
		expect(normalizeArticleList(null)).toEqual([])
		expect(normalizeArticleList(undefined)).toEqual([])
	})

	it('detects only explicit draft frontmatter', () => {
		expect(isDraftFrontmatter('---\ntitle: 私密草稿\ndraft: true\n---\n正文')).toBe(true)
		expect(isDraftFrontmatter('---\ntitle: 已发布\ndraft: false\n---\n正文')).toBe(false)
		expect(isDraftFrontmatter('---\ntitle: 默认发布\n---\n正文')).toBe(false)
		expect(isDraftFrontmatter('---\nseo:\n  draft: true\n---\n正文')).toBe(false)
	})

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

	it('clones Vue reactive documents before writing them to IndexedDB', () => {
		const reactiveDocument = reactive(structuredClone(document))
		expect(cloneArticleDocument(reactiveDocument)).toEqual(document)
	})

	it('wraps selected text and preserves the editable selection', () => {
		expect(applyMarkdownEdit('hello', 0, 5, {
			type: 'wrap',
			before: '**',
			after: '**',
			placeholder: '粗体文本',
		})).toEqual({
			body: '**hello**',
			selectionStart: 2,
			selectionEnd: 7,
		})
	})

	it('prefixes every selected line without losing content', () => {
		expect(applyMarkdownEdit('one\ntwo', 0, 7, {
			type: 'line-prefix',
			prefix: '> ',
			placeholder: '引用内容',
		})).toEqual({
			body: '> one\n> two',
			selectionStart: 0,
			selectionEnd: 11,
		})
	})

	it('inserts an editable fenced block for an empty document', () => {
		expect(applyMarkdownEdit('', 0, 0, {
			type: 'block',
			before: '```text\n',
			after: '\n```',
			placeholder: '代码',
		})).toEqual({
			body: '```text\n代码\n```',
			selectionStart: 8,
			selectionEnd: 10,
		})
	})

	it('inserts a macOS window block with stable surrounding spacing', () => {
		expect(insertMacWindowBlock('前\n\n后', 2, 2)).toEqual({
			body: '前\n\n::mac-window\n在这里填写窗口内容\n::\n\n后',
			selectionStart: 16,
			selectionEnd: 25,
		})
	})
})

describe('public article visibility', () => {
	it('filters drafts from every public article query', async () => {
		const [contentConfig, articleQuery, articlePage, surroundings, atomFeed, stats] = await Promise.all([
			source('content.config.ts'),
			source('app/composables/useArticle.ts'),
			source('app/pages/[...slug].vue'),
			source('app/components/post/PostSurround.vue'),
			source('server/routes/atom.xml.get.ts'),
			source('server/api/stats.get.ts'),
		])

		expect(articleQuery).toContain('.where(\'draft\', \'=\', false)')
		expect(surroundings).toContain('.where(\'draft\', \'=\', false)')
		expect(atomFeed).toContain('.where(\'draft\', \'=\', false)')
		expect(stats).toContain('.where(\'draft\', \'=\', false)')
		expect(contentConfig).toContain('exclude: draftContentFiles')

		const detailFilterIndex = articlePage.indexOf('.where(\'draft\', \'=\', false)')
		const detailPathIndex = articlePage.indexOf('.path(route.path)')
		expect(detailFilterIndex).toBeGreaterThan(-1)
		expect(detailPathIndex).toBeGreaterThan(detailFilterIndex)
	})

	it('renders macOS windows as repeatable MDC blocks instead of a page wrapper', async () => {
		const [articlePage, macWindow] = await Promise.all([
			source('app/pages/[...slug].vue'),
			source('app/components/content/MacWindow.global.vue'),
		])

		expect(articlePage).not.toContain('<div class="article-window">')
		expect(articlePage).toContain('<ContentRenderer')
		expect(macWindow).toContain('class="article-window"')
		expect(macWindow).toContain('<slot />')
		expect(macWindow).toContain('aria-hidden="true"')
	})
})

describe('article editor UI boundaries', () => {
	it('uses IndexedDB and never localStorage for drafts', async () => {
		const composable = await source('app/composables/useAdminDraft.ts')
		expect(composable).toContain('indexedDB.open')
		expect(composable).not.toContain('localStorage')
	})

	it('uses the shared MDC renderer and exposes detailed formatting controls', async () => {
		const [editor, nuxtConfig] = await Promise.all([
			source('app/components/admin/AdminArticleEditor.vue'),
			source('nuxt.config.ts'),
		])

		expect(editor).toContain('<MDC')
		expect(editor).toContain('插入 macOS 窗口')
		expect(editor).toContain('label: \'粗体\'')
		expect(editor).toContain('label: \'引用\'')
		expect(editor).toContain('ariaLabel: \'H2\'')
		expect(editor).toContain('ariaLabel: \'H3\'')
		expect(editor).toContain(':aria-label="action.ariaLabel || action.label"')
		expect(editor).not.toContain('v-html')
		expect(editor).not.toContain('renderAdminMarkdown')
		expect(editor).not.toContain('lastSuccessfulPreview')
		expect(editor).toContain('<NuxtErrorBoundary')
		expect(editor).toContain('Markdown 预览失败')
		expect(nuxtConfig).toContain('const markdownRemarkPlugins')
		expect(nuxtConfig).toContain('const markdownRehypePlugins')
		expect(nuxtConfig).toContain('\tmdc: {')
	})

	it('keeps conflict recovery actions available', async () => {
		const editor = await source('app/components/admin/AdminArticleEditor.vue')
		expect(editor).toContain('重新加载远端')
		expect(editor).toContain('比较原始 Markdown')
		expect(editor).toContain('改用 PR 发布')
	})

	it('uses a route-aware full-width layout without negative margin compensation', async () => {
		const [layout, adminStyles, editorStyles] = await Promise.all([
			source('app/layouts/admin.vue'),
			source('app/assets/css/admin.scss'),
			source('app/assets/css/admin-management.scss'),
		])

		expect(layout).toContain('admin-content-editor')
		expect(layout).toContain('isArticleEditor')
		expect(adminStyles).toContain('.admin-content.admin-content-editor')
		expect(editorStyles).not.toContain('margin: -2rem')
		expect(editorStyles).not.toContain('margin: -1rem')
	})

	it('adds a default-hidden article header advertisement between excerpt and content', async () => {
		const [config, articlePage, headerAd] = await Promise.all([
			source('blog.config.ts'),
			source('app/pages/[...slug].vue'),
			source('app/components/post/PostHeaderAd.vue'),
		])

		expect(config).toContain('headerAd: {')
		expect(config).toContain('enabled: false')
		const excerptIndex = articlePage.indexOf('<PostExcerpt')
		const adIndex = articlePage.indexOf('<PostHeaderAd')
		const contentIndex = articlePage.indexOf('<ContentRenderer')
		expect(adIndex).toBeGreaterThan(excerptIndex)
		expect(contentIndex).toBeGreaterThan(adIndex)
		expect(headerAd).toContain('ad.enabled')
		expect(headerAd).toContain('ad.title.trim()')
		expect(headerAd).toContain('ad.href.trim()')
		expect(headerAd).toContain('const isExternal')
		expect(headerAd).toContain(':target="isExternal ?')
		expect(headerAd).toContain(':rel="isExternal ?')
	})

	it('offers direct and Pull Request publishing plus media insertion', async () => {
		const editor = await source('app/components/admin/AdminArticleEditor.vue')
		expect(editor).toContain('保存草稿')
		expect(editor).toContain('发布文章')
		expect(editor).toContain('提交审核')
		expect(editor).toContain('插入媒体')
		expect(editor).toContain('<h1 class="visually-hidden">')
	})
})
