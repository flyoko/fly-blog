export interface ArticleShareTextInput {
	siteTitle: string
	title?: string | null
	description?: string | null
	url: string
}

function normalizeSharePart(value?: string | null): string {
	return value?.replace(/\s+/gu, ' ').trim() || ''
}

export function formatArticleShareText(input: ArticleShareTextInput): string {
	const siteTitle = normalizeSharePart(input.siteTitle)
	const title = normalizeSharePart(input.title) || siteTitle || '文章'
	const description = normalizeSharePart(input.description)
	const url = input.url.trim()
	const brand = siteTitle ? `【${siteTitle}】` : ''
	const headline = title === siteTitle && brand ? brand : `${brand}${title}`
	const summary = description && description !== title ? `｜${description}` : ''

	return `${headline}${summary} ${url} 复制此链接，打开浏览器阅读全文！`.trim()
}
