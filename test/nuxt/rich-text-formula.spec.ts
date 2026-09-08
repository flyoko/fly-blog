// @vitest-environment happy-dom

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { convertRichTextHtmlToMarkdown, normalizePastedMathText } from '../../app/utils/rich-text-markdown'

const root = process.cwd()

async function source(path: string) {
	return readFile(`${root}/${path}`, 'utf8')
}

describe('article formula paste and rendering', () => {
	it('extracts KaTeX source once and restores Markdown math delimiters', () => {
		const html = String.raw`
			<p>公式：<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">cos(A,B)=A·B//A//B//</span></span></p>
			<div class="katex-display"><span class="katex"><span class="katex-mathml"><math display="block"><semantics><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">E = mc²</span></span></div>
		`

		const markdown = convertRichTextHtmlToMarkdown(html)
		expect(markdown).toBe(String.raw`公式：$\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}$

$$
E=mc^2
$$`)
		expect(markdown).not.toContain('A·B//A//B//')
		expect(markdown.match(/\\cos/gu)).toHaveLength(1)
	})

	it('normalizes common copied TeX into math Markdown without changing ordinary plain text', () => {
		expect(normalizePastedMathText(String.raw`\(a^2+b^2=c^2\)`))
			.toBe(String.raw`$a^2+b^2=c^2$`)
		expect(normalizePastedMathText(String.raw`\[\frac{A \cdot B}{\|A\|\|B\|}\]`))
			.toBe(String.raw`$$
\frac{A \cdot B}{\|A\|\|B\|}
$$`)
		expect(normalizePastedMathText(String.raw`\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}`))
			.toBe(String.raw`$$
\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}
$$`)
		expect(normalizePastedMathText('原生纯文本')).toBe('原生纯文本')
		expect(normalizePastedMathText(String.raw`\path\to\file`)).toBe(String.raw`\path\to\file`)
	})

	it('recovers MathML alt text and raw standalone TeX paragraphs', () => {
		const mathml = String.raw`<math display="block" alttext="\frac{A \cdot B}{\|A\|\|B\|}"><mrow><mi>A</mi></mrow></math>`
		expect(convertRichTextHtmlToMarkdown(mathml)).toBe(String.raw`$$
\frac{A \cdot B}{\|A\|\|B\|}
$$`)

		const rawParagraph = String.raw`<p>\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}</p>`
		expect(convertRichTextHtmlToMarkdown(rawParagraph)).toBe(String.raw`$$
\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}
$$`)
	})

	it('uses local KaTeX CSS for editor and article pages instead of a runtime CDN stylesheet', async () => {
		const [editor, articlePage, config, packageJson, workspace] = await Promise.all([
			source('app/components/admin/AdminArticleEditor.vue'),
			source('app/pages/[...slug].vue'),
			source('nuxt.config.ts'),
			source('package.json'),
			source('pnpm-workspace.yaml'),
		])

		expect(editor).toContain('import \'katex/dist/katex.min.css\'')
		expect(articlePage).toContain('import \'katex/dist/katex.min.css\'')
		expect(config).toContain('\'remark-math\': {}')
		expect(config).toContain('\'rehype-katex\': {}')
		expect(config).not.toContain('cdnjs.snrat.com/ajax/libs/KaTeX')
		expect(config).toContain('katexLegacyFontSourcePattern')
		expect(config).toContain('name: \'fly:katex-woff2-only\'')
		expect(config).toContain('plugins: [katexWoff2OnlyPlugin]')
		expect(packageJson).toContain('"rehype-katex": "catalog:content"')
		expect(workspace).toContain('shamefullyHoist: true')
	})
})
