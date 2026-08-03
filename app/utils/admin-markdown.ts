import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

export function renderAdminMarkdown(markdown: string): string {
	return micromark(markdown || '开始写下正文…', {
		allowDangerousHtml: false,
		allowDangerousProtocol: false,
		extensions: [gfm()],
		htmlExtensions: [gfmHtml()],
	})
}
