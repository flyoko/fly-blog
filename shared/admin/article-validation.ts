export interface ArticleDiagnostic {
	code: string
	message: string
	suggestion: string
	bodyLine: number
	bodyColumn: number
}

const emphasisPattern = /\*{3}[^\n]*?\s\*{3}(?!\*)/gu
const incompleteLinkTargetPattern = /\]\((?:https?:\/\/|mailto:)\)/gu

export function validateArticleMarkdown(body: string): ArticleDiagnostic[] {
	const diagnostics: ArticleDiagnostic[] = []
	let inFence = false

	for (const [lineIndex, line] of body.split('\n').entries()) {
		if (/^\s*```/u.test(line)) {
			inFence = !inFence
			continue
		}
		if (inFence)
			continue

		for (const match of line.matchAll(emphasisPattern)) {
			const matchIndex = match.index ?? 0
			const closingMarkerIndex = match[0].lastIndexOf('***')
			diagnostics.push({
				code: 'markdown/no-space-in-emphasis',
				message: '强调标记结束前不能有空格',
				suggestion: '删除结束标记前的空格',
				bodyLine: lineIndex + 1,
				bodyColumn: matchIndex + closingMarkerIndex + 1,
			})
		}

		for (const match of line.matchAll(incompleteLinkTargetPattern)) {
			const matchIndex = match.index ?? 0
			diagnostics.push({
				code: 'markdown/incomplete-link-target',
				message: '链接地址不完整',
				suggestion: '粘贴完整网页地址，或删除这个链接',
				bodyLine: lineIndex + 1,
				bodyColumn: matchIndex + 3,
			})
		}
	}

	return diagnostics
}
