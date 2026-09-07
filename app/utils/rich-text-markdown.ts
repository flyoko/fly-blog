const ignoredElements = new Set([
	'SCRIPT',
	'STYLE',
	'NOSCRIPT',
	'TEMPLATE',
	'IFRAME',
	'BUTTON',
	'SVG',
	'PATH',
	'CANVAS',
])

const blockElements = new Set([
	'ADDRESS',
	'ARTICLE',
	'ASIDE',
	'DIV',
	'FOOTER',
	'HEADER',
	'MAIN',
	'NAV',
	'SECTION',
])

function normalizeInline(value: string) {
	return value.replace(/[\t\r\n ]+/gu, ' ')
}

function escapeInline(value: string) {
	return normalizeInline(value).replace(/([\\*_[\]<>])/gu, '\\$1')
}

function collapseBlankLinesOutsideCode(value: string) {
	const lines = value.split('\n')
	const normalized: string[] = []
	let activeFence = ''

	for (const line of lines) {
		if (activeFence) {
			normalized.push(line)
			if (line.trim() === activeFence)
				activeFence = ''
			continue
		}

		const openingFence = /^(`{3,})[\w+.-]*$/u.exec(line.trim())?.[1]
		if (openingFence) {
			activeFence = openingFence
			normalized.push(line)
			continue
		}

		if (!line.trim() && normalized.at(-1) === '')
			continue
		normalized.push(line)
	}

	return normalized.join('\n')
}

function trimBlock(value: string) {
	return collapseBlankLinesOutsideCode(value.replace(/[ \t]+\n/gu, '\n')).trim()
}

function safeLanguage(value: string | null | undefined) {
	return value && /^[\w+.-]{1,40}$/u.test(value) ? value : ''
}

function languageFor(element: Element, code: Element | null) {
	const candidates = [element, code].filter((candidate): candidate is Element => Boolean(candidate))
	for (const candidate of candidates) {
		const dataLanguage = candidate.getAttribute('data-language')
		if (dataLanguage !== null)
			return safeLanguage(dataLanguage)
		const rawClassName = candidate.getAttribute('class') || ''
		if (/[\r\n`]/u.test(rawClassName))
			return ''
		for (const className of candidate.classList) {
			const match = /^(?:language|lang)-(.+)$/u.exec(className)
			if (match)
				return safeLanguage(match[1])
		}
	}
	return ''
}

function safeLink(href: string) {
	const value = href.trim()
	if (!value)
		return null

	const safeDestination = (destination: string) => destination.replace(/[\s()<>`"\\]/gu, (character) => {
		if (character === '(')
			return '%28'
		if (character === ')')
			return '%29'
		return encodeURIComponent(character)
	})
	if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../'))
		return safeDestination(value)
	try {
		const parsed = new URL(value)
		return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? safeDestination(value) : null
	}
	catch {
		return null
	}
}

function tableMarkdown(table: Element, render: (node: Node) => string) {
	const rows = [...table.querySelectorAll('tr')]
		.map(row => [...row.children]
			.filter(cell => cell.matches('th, td'))
			.map(cell => normalizeInline(trimBlock(render(cell))).trim().replace(/\|/gu, '\\|')))
		.filter(row => row.length)
	if (!rows.length)
		return ''
	const width = Math.max(...rows.map(row => row.length))
	const normalized = rows.map(row => [...row, ...Array.from({ length: width - row.length }).fill('')])
	const header = normalized[0]!
	return [
		`| ${header.join(' | ')} |`,
		`| ${header.map(() => '---').join(' | ')} |`,
		...normalized.slice(1).map(row => `| ${row.join(' | ')} |`),
	].join('\n')
}

export function convertRichTextHtmlToMarkdown(html: string): string {
	if (!html.trim() || typeof DOMParser !== 'function' || typeof Node === 'undefined' || typeof Element === 'undefined')
		return ''
	const document = new DOMParser().parseFromString(html, 'text/html')

	function renderChildren(node: Node, context: { listDepth?: number } = {}): string {
		return [...node.childNodes].map(child => render(child, context)).join('')
	}

	function renderList(element: Element, ordered: boolean, depth: number): string {
		let index = 0
		return [...element.children]
			.filter(child => child.tagName === 'LI')
			.map((item) => {
				index += 1
				const marker = ordered ? `${index}. ` : '- '
				const indent = '  '.repeat(depth)
				const content = [...item.childNodes]
					.filter(child => !(child instanceof Element && ['UL', 'OL'].includes(child.tagName)))
					.map(child => render(child, { listDepth: depth }))
					.join('')
					.trim()
				const nested = [...item.children]
					.filter(child => ['UL', 'OL'].includes(child.tagName))
					.map(child => renderList(child, child.tagName === 'OL', depth + 1))
					.join('\n')
				return `${indent}${marker}${content}${nested ? `\n${nested}` : ''}`
			})
			.join('\n')
	}

	function render(node: Node, context: { listDepth?: number } = {}): string {
		if (node.nodeType === Node.TEXT_NODE)
			return escapeInline(node.textContent || '')
		if (!(node instanceof Element) || ignoredElements.has(node.tagName))
			return ''

		const children = () => renderChildren(node, context)
		const tag = node.tagName
		if (/^H[1-6]$/u.test(tag))
			return `\n\n${'#'.repeat(Number(tag.slice(1)))} ${trimBlock(children())}\n\n`
		if (tag === 'P' || blockElements.has(tag))
			return `\n\n${trimBlock(children())}\n\n`
		if (tag === 'STRONG' || tag === 'B')
			return `**${children().trim()}**`
		if (tag === 'EM' || tag === 'I')
			return `*${children().trim()}*`
		if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE')
			return `~~${children().trim()}~~`
		if (tag === 'A') {
			const label = children().trim()
			const href = safeLink(node.getAttribute('href') || '')
			return href && label ? `[${label}](${href})` : label
		}
		if (tag === 'BLOCKQUOTE') {
			const content = trimBlock(children())
			return `\n\n${content.split('\n').map(line => `> ${line}`).join('\n')}\n\n`
		}
		if (tag === 'UL' || tag === 'OL')
			return `\n\n${renderList(node, tag === 'OL', context.listDepth || 0)}\n\n`
		if (tag === 'LI')
			return children()
		if (tag === 'PRE') {
			const code = node.querySelector(':scope > code')
			const value = (code?.textContent ?? node.textContent ?? '').replace(/^\n|\n$/gu, '')
			const longestRun = Math.max(0, ...[...value.matchAll(/`+/gu)].map(match => match[0].length))
			const fence = '`'.repeat(Math.max(3, longestRun + 1))
			return `\n\n${fence}${languageFor(node, code)}\n${value}\n${fence}\n\n`
		}
		if (tag === 'CODE') {
			const value = node.textContent || ''
			const longestRun = Math.max(0, ...[...value.matchAll(/`+/gu)].map(match => match[0].length))
			const fence = '`'.repeat(Math.max(1, longestRun + 1))
			const padding = /^ | $/u.test(value) ? ' ' : ''
			return `${fence}${padding}${value}${padding}${fence}`
		}
		if (tag === 'TABLE')
			return `\n\n${tableMarkdown(node, child => render(child))}\n\n`
		if (tag === 'BR')
			return '  \n'
		if (tag === 'HR')
			return '\n\n---\n\n'
		if (tag === 'IMG')
			return escapeInline(node.getAttribute('alt') || '')
		return children()
	}

	return trimBlock(renderChildren(document.body))
}
