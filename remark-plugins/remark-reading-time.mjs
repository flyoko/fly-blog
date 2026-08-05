import { visit } from 'unist-util-visit'

const cjkRanges = [
	[0x3040, 0x309F],
	[0x4E00, 0x9FFF],
	[0xAC00, 0xD7A3],
	[0x20000, 0x2EBE0],
]
const punctuationRanges = [
	[0x21, 0x2F],
	[0x3A, 0x40],
	[0x5B, 0x60],
	[0x7B, 0x7E],
	[0x3000, 0x303F],
	[0xFF00, 0xFFEF],
]

function codeIsInRanges(code, ranges) {
	return ranges.some(([lower, upper]) => lower <= code && code <= upper)
}

function isCjk(character) {
	return typeof character === 'string' && codeIsInRanges(character.codePointAt(0), cjkRanges)
}

function isWordBoundary(character) {
	return typeof character === 'string' && ' \n\r\t'.includes(character)
}

function isPunctuation(character) {
	return typeof character === 'string' && codeIsInRanges(character.codePointAt(0), punctuationRanges)
}

function calculateReadingTime(text, wordsPerMinute = 200) {
	let words = 0
	let start = 0
	let end = text.length - 1

	while (start <= end && isWordBoundary(text[start]))
		start++
	while (end >= start && isWordBoundary(text[end]))
		end--

	const normalizedText = `${text}\n`
	for (let index = start; index <= end; index++) {
		if (
			isCjk(normalizedText[index])
			|| (!isWordBoundary(normalizedText[index])
				&& (isWordBoundary(normalizedText[index + 1]) || isCjk(normalizedText[index + 1])))
		) {
			words++
		}

		if (isCjk(normalizedText[index])) {
			while (
				index <= end
				&& (isPunctuation(normalizedText[index + 1]) || isWordBoundary(normalizedText[index + 1]))
			) {
				index++
			}
		}
	}

	const minutes = words / wordsPerMinute
	return {
		text: `${Math.ceil(Number(minutes.toFixed(2)))} min read`,
		minutes,
		time: Math.round(minutes * 60 * 1000),
		words,
	}
}

export default function remarkReadingTime({ attribute = 'readingTime' } = {}) {
	return (tree, file) => {
		let text = ''
		visit(tree, ['text', 'code'], (node) => {
			text += node.value
		})
		file.data[attribute] = calculateReadingTime(text)
	}
}
