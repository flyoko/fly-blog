import type { FinanceFlashDto, FinanceFlashSourceDto, FinanceImportanceOrigin } from '../../../../../shared/admin/finance'

const EVENT_WINDOW_MS = 120 * 60 * 1_000
const BIGRAM_THRESHOLD = 0.72
const TRIGRAM_THRESHOLD = 0.62
const SOURCE_PREFIX_PATTERN = /^(?:【?(?:金十数据|华尔街见闻|新浪财经)】?[：:\s-]*)+/u
const NEWS_PREFIX_PATTERN = /^(?:金十数据)?\d{1,2}月\d{1,2}日讯[，,:：\s]*/u
const NUMBER_PATTERN = /\d+(?:\.\d+)?%?/gu

const DIRECTION_GROUPS = [
	[['上涨', '上升', '走高', '拉升', '攀升', '涨超', '涨幅'], ['下跌', '下降', '走低', '跳水', '跌超', '跌幅']],
	[['流入', '净流入'], ['流出', '净流出']],
	[['增长', '增加', '上调', '提高', '扩大', '增持'], ['减少', '下调', '降低', '缩减', '减持']],
] as const

const SOURCE_PRIORITY: Record<string, number> = {
	'jin10-mcp-7x24': 0,
	'wallstreetcn-7x24': 1,
	'sina-inews-7x24': 2,
}

interface EventGroup {
	items: FinanceFlashDto[]
}

function financeEventSemanticText(value: string): string {
	return value
		.normalize('NFKC')
		.trim()
		.replace(SOURCE_PREFIX_PATTERN, '')
		.replace(NEWS_PREFIX_PATTERN, '')
		.toLocaleLowerCase('zh-CN')
}

export function normalizeFinanceEventTitle(value: string): string {
	return financeEventSemanticText(value).replace(/[\p{P}\p{S}\s]/gu, '')
}

function ngrams(value: string, size: number): Set<string> {
	const result = new Set<string>()
	if (value.length < size) {
		if (value)
			result.add(value)
		return result
	}
	for (let index = 0; index <= value.length - size; index += 1)
		result.add(value.slice(index, index + size))
	return result
}

function jaccard(left: Set<string>, right: Set<string>): number {
	if (!left.size && !right.size)
		return 1
	let intersection = 0
	for (const value of left) {
		if (right.has(value))
			intersection += 1
	}
	const union = left.size + right.size - intersection
	return union ? intersection / union : 0
}

function materialNumbers(value: string): Set<string> {
	return new Set(value.match(NUMBER_PATTERN) ?? [])
}

function numbersConflict(left: string, right: string): boolean {
	const leftNumbers = materialNumbers(left)
	const rightNumbers = materialNumbers(right)
	if (!leftNumbers.size || !rightNumbers.size)
		return false
	if (leftNumbers.size !== rightNumbers.size)
		return true
	for (const number of leftNumbers) {
		if (!rightNumbers.has(number))
			return true
	}
	return false
}

function containsAny(value: string, words: readonly string[]): boolean {
	return words.some(word => value.includes(word))
}

function directionsConflict(left: string, right: string): boolean {
	for (const [positive, negative] of DIRECTION_GROUPS) {
		if ((containsAny(left, positive) && containsAny(right, negative))
			|| (containsAny(left, negative) && containsAny(right, positive))) {
			return true
		}
	}
	return false
}

function titlesEquivalent(left: string, right: string): boolean {
	const semanticLeft = financeEventSemanticText(left)
	const semanticRight = financeEventSemanticText(right)
	if (!semanticLeft || !semanticRight)
		return false
	if (numbersConflict(semanticLeft, semanticRight) || directionsConflict(semanticLeft, semanticRight))
		return false
	const normalizedLeft = normalizeFinanceEventTitle(semanticLeft)
	const normalizedRight = normalizeFinanceEventTitle(semanticRight)
	if (normalizedLeft === normalizedRight)
		return true
	const bigramScore = jaccard(ngrams(normalizedLeft, 2), ngrams(normalizedRight, 2))
	const trigramScore = jaccard(ngrams(normalizedLeft, 3), ngrams(normalizedRight, 3))
	return bigramScore >= BIGRAM_THRESHOLD || trigramScore >= TRIGRAM_THRESHOLD
}

function sameCandidateWindow(left: FinanceFlashDto, right: FinanceFlashDto): boolean {
	if (left.category !== right.category)
		return false
	const leftTime = Date.parse(left.publishedAt)
	const rightTime = Date.parse(right.publishedAt)
	if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime))
		return false
	return Math.abs(leftTime - rightTime) <= EVENT_WINDOW_MS
}

function canJoin(group: EventGroup, candidate: FinanceFlashDto): boolean {
	if (group.items.some(item => item.sourceId === candidate.sourceId))
		return false
	if (!group.items.every(item => sameCandidateWindow(item, candidate)))
		return false
	return group.items.some(item => titlesEquivalent(item.title, candidate.title))
}

function sourcePriority(item: FinanceFlashDto): number {
	return SOURCE_PRIORITY[item.sourceId] ?? 100
}

function comparePrimary(left: FinanceFlashDto, right: FinanceFlashDto): number {
	const priority = sourcePriority(left) - sourcePriority(right)
	if (priority)
		return priority
	const time = Date.parse(left.publishedAt) - Date.parse(right.publishedAt)
	if (time)
		return time
	return left.id.localeCompare(right.id)
}

function sourceDto(item: FinanceFlashDto): FinanceFlashSourceDto {
	return {
		sourceId: item.sourceId,
		sourceName: item.sourceName,
		sourceUrl: item.sourceUrl,
		publishedAt: item.publishedAt,
	}
}

function importanceOrigin(items: FinanceFlashDto[], primary: FinanceFlashDto): FinanceImportanceOrigin {
	const important = items.filter(item => item.important)
	if (!important.length)
		return primary.importanceOrigin
	const rank: Record<FinanceImportanceOrigin, number> = {
		upstream: 0,
		rule: 1,
		model: 2,
		prototype: 3,
	}
	return important.slice().sort((left, right) => rank[left.importanceOrigin] - rank[right.importanceOrigin])[0]!.importanceOrigin
}

function canonicalize(group: EventGroup): FinanceFlashDto {
	const orderedSources = group.items.slice().sort(comparePrimary)
	const primary = orderedSources[0]!
	const earliestPublishedAt = group.items
		.map(item => item.publishedAt)
		.sort((left, right) => Date.parse(left) - Date.parse(right))[0]!
	const scores = group.items
		.map(item => item.importanceScore)
		.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

	return {
		...primary,
		publishedAt: earliestPublishedAt,
		important: group.items.some(item => item.important),
		importanceOrigin: importanceOrigin(group.items, primary),
		importanceScore: scores.length ? Math.max(...scores) : primary.importanceScore,
		sourceCount: orderedSources.length,
		sources: orderedSources.map(sourceDto),
	}
}

export function groupFinanceEvents(items: FinanceFlashDto[]): FinanceFlashDto[] {
	const chronological = items.slice().sort((left, right) => {
		const time = Date.parse(left.publishedAt) - Date.parse(right.publishedAt)
		return time || comparePrimary(left, right)
	})
	const groups: EventGroup[] = []
	for (const item of chronological) {
		const group = groups.find(candidate => canJoin(candidate, item))
		if (group)
			group.items.push(item)
		else
			groups.push({ items: [item] })
	}
	return groups
		.map(canonicalize)
		.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || left.id.localeCompare(right.id))
}
