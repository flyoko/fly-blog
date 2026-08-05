import { describe, expect, it } from 'vitest'
import { validateArticleMarkdown } from '../../shared/admin/article-validation'

describe('文章 Markdown 轻量诊断', () => {
	it('诊断结束强调标记前的空格并返回正文行列与建议', () => {
		expect(validateArticleMarkdown('正文 ***标题 ***')).toEqual([
			{
				code: 'markdown/no-space-in-emphasis',
				message: '强调标记结束前不能有空格',
				suggestion: '删除结束标记前的空格',
				bodyLine: 1,
				bodyColumn: 10,
			},
		])
	})

	it('不诊断正常强调标记', () => {
		expect(validateArticleMarkdown('正文 ***标题***')).toEqual([])
	})

	it('不诊断代码围栏中的文本', () => {
		expect(validateArticleMarkdown('```md\n***标题 ***\n```')).toEqual([])
	})

	it('支持同一行多个诊断，并正确计算中文和 emoji 后的列号', () => {
		const diagnostics = validateArticleMarkdown('中😀 ***甲 *** 和 ***乙 ***')
		expect(diagnostics).toHaveLength(2)
		expect(diagnostics.map(item => item.bodyColumn)).toEqual([10, 21])
	})
})
