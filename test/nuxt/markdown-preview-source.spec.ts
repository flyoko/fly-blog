import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { describe, expect, it } from 'vitest'
import {
	collectMarkdownPreviewBlocks,
	findMarkdownPreviewPosition,
} from '../../app/utils/markdown-preview-source'

const markdown = [
	'## 二级标题',
	'',
	'第一段 **粗体**',
	'继续一行',
	'',
	'> 引用第一行',
	'> 引用第二行',
	'',
	'- 第一项',
	'- 第二项',
	'',
	'| 列1 | 列2 |',
	'| --- | --- |',
	'| A | B |',
	'',
	'```ts',
	'const answer = 42',
	'```',
	'',
	'::copy-block',
	'复制第一行',
	'复制第二行',
	'::',
	'',
	'::mac-window',
	'窗口正文',
	'::',
].join('\n')

describe('markdown preview source mapping', () => {
	it('keeps one source range for each top-level preview block', () => {
		const blocks = collectMarkdownPreviewBlocks(markdown)
		expect(blocks).toHaveLength(8)
		expect(blocks.map(block => markdown.slice(block.start, block.end))).toEqual([
			'## 二级标题',
			'第一段 **粗体**\n继续一行',
			'> 引用第一行\n> 引用第二行',
			'- 第一项\n- 第二项',
			'| 列1 | 列2 |\n| --- | --- |\n| A | B |',
			'```ts\nconst answer = 42\n```',
			'::copy-block\n复制第一行\n复制第二行\n::',
			'::mac-window\n窗口正文\n::',
		])
	})

	it('matches the MDC top-level block count for supported editor content', async () => {
		const parsed = await parseMarkdown(markdown)
		expect(collectMarkdownPreviewBlocks(markdown)).toHaveLength(parsed.body.children.length)
	})

	it('maps clicked nested preview text back inside its source block', () => {
		const blocks = collectMarkdownPreviewBlocks(markdown)
		expect(findMarkdownPreviewPosition(markdown, blocks[0]!, '二级标题')).toBe(markdown.indexOf('二级标题'))
		expect(findMarkdownPreviewPosition(markdown, blocks[1]!, '粗体')).toBe(markdown.indexOf('粗体'))
		expect(findMarkdownPreviewPosition(markdown, blocks[3]!, '第二项')).toBe(markdown.indexOf('第二项'))
		expect(findMarkdownPreviewPosition(markdown, blocks[5]!, 'const answer = 42')).toBe(markdown.indexOf('const answer = 42'))
	})

	it('falls back to the first meaningful source character when rendered text has no literal match', () => {
		const blocks = collectMarkdownPreviewBlocks(markdown)
		expect(findMarkdownPreviewPosition(markdown, blocks[0]!, '不存在')).toBe(markdown.indexOf('二级标题'))
	})
})
