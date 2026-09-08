export interface MarkdownPreviewBlock {
	start: number
	end: number
}

interface MarkdownLine {
	text: string
	start: number
	end: number
}

const blankLine = /^\s*$/u
const atxHeading = /^ {0,3}#{1,6}(?:\s+|$)/u
const blockQuote = /^ {0,3}>/u
const listItem = /^ {0,3}(?:[-+*]|\d+[.)])\s+/u
const thematicBreak = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u
const mdcContainerOpen = /^ {0,3}::[\w-]+(?:\{[^\n]*\})?\s*$/u
const mdcContainerClose = /^ {0,3}::\s*$/u
const setextUnderline = /^ {0,3}(?:=+|-+)\s*$/u

function markdownLines(markdown: string): MarkdownLine[] {
	const lines: MarkdownLine[] = []
	let start = 0
	for (const value of markdown.split('\n')) {
		const text = value.endsWith('\r') ? value.slice(0, -1) : value
		lines.push({ text, start, end: start + value.length })
		start += value.length + 1
	}
	return lines
}

function isFenceStart(line: string) {
	return line.match(/^ {0,3}(`{3,}|~{3,})/u)
}

function isTableDelimiter(line: string) {
	let value = line.trim()
	if (value.startsWith('|'))
		value = value.slice(1)
	if (value.endsWith('|'))
		value = value.slice(0, -1)
	const cells = value.split('|').map(cell => cell.trim()).filter(Boolean)
	return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/u.test(cell))
}

function isTableStart(lines: MarkdownLine[], index: number) {
	return Boolean(lines[index]?.text.includes('|'))
		&& isTableDelimiter(lines[index + 1]?.text ?? '')
}

function isBlockStarter(lines: MarkdownLine[], index: number) {
	const line = lines[index]?.text ?? ''
	return Boolean(
		isFenceStart(line)
		|| mdcContainerOpen.test(line)
		|| atxHeading.test(line)
		|| blockQuote.test(line)
		|| listItem.test(line)
		|| thematicBreak.test(line)
		|| isTableStart(lines, index),
	)
}

function consumeFence(lines: MarkdownLine[], index: number) {
	const match = isFenceStart(lines[index]!.text)!
	const marker = match[1]![0]!
	const minimumLength = match[1]!.length
	let cursor = index + 1
	const closePattern = new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${minimumLength},}\\s*$`, 'u')
	while (cursor < lines.length) {
		if (closePattern.test(lines[cursor]!.text))
			return cursor + 1
		cursor += 1
	}
	return lines.length
}

function consumeMdcContainer(lines: MarkdownLine[], index: number) {
	let depth = 1
	let cursor = index + 1
	while (cursor < lines.length) {
		const line = lines[cursor]!.text
		if (mdcContainerOpen.test(line)) {
			depth += 1
		}
		else if (mdcContainerClose.test(line)) {
			depth -= 1
			if (depth === 0)
				return cursor + 1
		}
		cursor += 1
	}
	return lines.length
}

function consumeQuote(lines: MarkdownLine[], index: number) {
	let cursor = index + 1
	while (cursor < lines.length && !blankLine.test(lines[cursor]!.text))
		cursor += 1
	return cursor
}

function consumeList(lines: MarkdownLine[], index: number) {
	let cursor = index + 1
	while (cursor < lines.length) {
		const line = lines[cursor]!.text
		if (!blankLine.test(line)) {
			cursor += 1
			continue
		}

		let next = cursor + 1
		while (next < lines.length && blankLine.test(lines[next]!.text))
			next += 1
		if (next >= lines.length)
			return cursor
		if (listItem.test(lines[next]!.text) || /^\s{2,}\S/u.test(lines[next]!.text)) {
			cursor = next + 1
			continue
		}
		return cursor
	}
	return cursor
}

function consumeTable(lines: MarkdownLine[], index: number) {
	let cursor = index + 2
	while (cursor < lines.length) {
		const line = lines[cursor]!.text
		if (blankLine.test(line) || !line.includes('|'))
			break
		cursor += 1
	}
	return cursor
}

function consumeParagraph(lines: MarkdownLine[], index: number) {
	if (setextUnderline.test(lines[index + 1]?.text ?? ''))
		return index + 2

	let cursor = index + 1
	while (cursor < lines.length) {
		if (blankLine.test(lines[cursor]!.text) || isBlockStarter(lines, cursor))
			break
		if (setextUnderline.test(lines[cursor + 1]?.text ?? ''))
			break
		cursor += 1
	}
	return cursor
}

function blockEndOffset(lines: MarkdownLine[], start: number, endExclusive: number) {
	const last = lines[Math.max(start, endExclusive - 1)]!
	return last.end
}

export function collectMarkdownPreviewBlocks(markdown: string): MarkdownPreviewBlock[] {
	const lines = markdownLines(markdown)
	const blocks: MarkdownPreviewBlock[] = []
	let index = 0

	while (index < lines.length) {
		if (blankLine.test(lines[index]!.text)) {
			index += 1
			continue
		}

		const startLine = index
		const line = lines[index]!.text
		let endExclusive: number
		if (isFenceStart(line))
			endExclusive = consumeFence(lines, index)
		else if (mdcContainerOpen.test(line))
			endExclusive = consumeMdcContainer(lines, index)
		else if (atxHeading.test(line) || thematicBreak.test(line))
			endExclusive = index + 1
		else if (blockQuote.test(line))
			endExclusive = consumeQuote(lines, index)
		else if (listItem.test(line))
			endExclusive = consumeList(lines, index)
		else if (isTableStart(lines, index))
			endExclusive = consumeTable(lines, index)
		else
			endExclusive = consumeParagraph(lines, index)

		blocks.push({
			start: lines[startLine]!.start,
			end: blockEndOffset(lines, startLine, endExclusive),
		})
		index = Math.max(index + 1, endExclusive)
	}

	return blocks
}

function firstMeaningfulSourceOffset(source: string) {
	const match = source.match(/[\p{L}\p{N}]/u)
	return match?.index ?? 0
}

export function findMarkdownPreviewPosition(
	markdown: string,
	block: MarkdownPreviewBlock,
	renderedText = '',
) {
	const source = markdown.slice(block.start, block.end)
	const trimmedText = renderedText.replace(/\s+/gu, ' ').trim()
	const candidates = [
		trimmedText,
		...trimmedText.split(/\s+/u),
	]
		.map(value => value.trim())
		.filter(value => value.length >= 2)
		.sort((left, right) => right.length - left.length)

	for (const candidate of candidates) {
		const offset = source.indexOf(candidate)
		if (offset >= 0)
			return block.start + offset
	}

	return block.start + firstMeaningfulSourceOffset(source)
}
