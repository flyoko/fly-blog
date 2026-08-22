import type { FinanceCategory, FinanceImportanceOrigin } from '../../../../../shared/admin/finance'
import type { FinanceFlashAdapter, FinanceFlashSourceItem } from './service'
import { createHash } from 'node:crypto'

const SINA_INEWS_LIVE_LIST_URL = 'https://inews.finance.sina.com.cn/api/live7x24_list'
const DEFAULT_TYPE_IDS = '1,2,3,4,5,7,9,10,102'
const MAX_TITLE_LENGTH = 180
const MAX_SUMMARY_LENGTH = 280

const COMPANY_PATTERN = /公司|股份|集团|控股|银行|证券|保险|公告|财报|业绩|营收|净利润|利润|亏损|订单|中标|回购|增持|减持|股东|董事会|收购|并购|IPO|上市|融资|配售/u
const MACRO_PATTERN = /央行|美联储|联储|欧洲央行|日本央行|英格兰银行|利率|降息|加息|CPI|PPI|GDP|非农|失业|就业|通胀|财政|关税|PMI/iu
const TECH_PATTERN = /人工智能|\bAI\b|OpenAI|DeepSeek|英伟达|NVIDIA|芯片|半导体|机器人|算力|数据中心|云计算|大模型|软件|互联网/iu
const IMPORTANT_RULE_PATTERN = /央行|美联储|欧洲央行|日本央行|利率决议|降息|加息|CPI|PPI|GDP|非农|关税|制裁|重大资产|收购|并购|IPO|上市|财报|业绩预告|净利润|营收|回购|停牌|复牌|熔断|暴涨|暴跌|历史新高/iu

export interface SinaINewsConfig {
	appKey?: string
	appSecret?: string
	typeIds?: string
}

export type SinaINewsFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface SinaINewsLiveItem {
	docid?: unknown
	content?: unknown
	cTime?: unknown
	typeid?: unknown
	cid?: unknown
}

type SignValue = string | number | null | undefined

function compactText(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
}

function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`
}

export function signSinaINewsParams(params: Record<string, SignValue>, secret: string): string {
	const sorted = Object.entries(params)
		.filter(([, value]) => value !== '' && value !== null && value !== undefined)
		.sort(([left], [right]) => left.localeCompare(right))
	const query = new URLSearchParams(sorted.map(([key, value]) => [key, String(value)])).toString()
	return createHash('md5').update(`${query}&${secret}`).digest('hex')
}

function titleAndSummary(value: unknown): { title: string, summary: string | null } | null {
	const content = compactText(value)
	if (!content)
		return null
	const opener = content[0]
	const closer = opener === '〖' ? '〗' : opener === '【' ? '】' : ''
	const bracketClose = closer ? content.indexOf(closer, 1) : -1
	if (bracketClose > 1) {
		const bracketTitle = content.slice(1, bracketClose).trim()
		const bracketSummary = content.slice(bracketClose + 1).trim()
		return {
			title: truncate(bracketTitle, MAX_TITLE_LENGTH),
			summary: bracketSummary ? truncate(bracketSummary, MAX_SUMMARY_LENGTH) : null,
		}
	}
	const sentenceEnd = content.search(/[。！？!?]/u)
	const cutAt = sentenceEnd >= 0 && sentenceEnd < 140 ? sentenceEnd + 1 : Math.min(content.length, 120)
	const title = truncate(content.slice(0, cutAt).trim(), MAX_TITLE_LENGTH)
	const remainder = content.slice(cutAt).trim()
	return { title, summary: remainder ? truncate(remainder, MAX_SUMMARY_LENGTH) : null }
}

function publishedAt(value: unknown): string | null {
	const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
	if (!Number.isFinite(numeric) || numeric <= 0)
		return null
	const millis = numeric > 10_000_000_000 ? numeric : numeric * 1_000
	const date = new Date(millis)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function typeIds(value: unknown): number[] {
	return Array.isArray(value)
		? value.map(item => Number(item)).filter(item => Number.isInteger(item))
		: []
}

function categoryFor(ids: number[], text: string): FinanceCategory {
	if (ids.includes(3) || COMPANY_PATTERN.test(text))
		return 'company'
	if (ids.some(id => id === 1 || id === 4 || id === 7) || MACRO_PATTERN.test(text))
		return 'macro'
	if (TECH_PATTERN.test(text))
		return 'tech'
	if (ids.includes(102))
		return 'overseas'
	return 'market'
}

function categoryLabel(category: FinanceCategory): string {
	return {
		market: '市场',
		company: '公司',
		macro: '宏观',
		overseas: '海外',
		tech: '科技',
	}[category]
}

function topicFor(category: FinanceCategory, ids: number[], text: string): string {
	if (category === 'company')
		return /财报|业绩|营收|净利润|利润|亏损/u.test(text) ? '业绩 / 财报' : '公司动态'
	if (category === 'macro')
		return ids.includes(7) || /央行|美联储|联储|利率|降息|加息/u.test(text) ? '央行 / 利率' : '政策 / 宏观'
	if (category === 'tech')
		return /芯片|半导体|算力|数据中心/u.test(text) ? '半导体 / 算力' : '科技动态'
	if (category === 'overseas')
		return '海外市场'
	return ids.includes(10) ? '股市' : '市场快讯'
}

function importanceFor(ids: number[], text: string): { important: boolean, origin: FinanceImportanceOrigin } {
	if (ids.includes(9))
		return { important: true, origin: 'upstream' }
	return IMPORTANT_RULE_PATTERN.test(text)
		? { important: true, origin: 'rule' }
		: { important: false, origin: 'upstream' }
}

function responseItems(payload: unknown): SinaINewsLiveItem[] {
	if (Array.isArray(payload))
		return payload as SinaINewsLiveItem[]
	if (payload && typeof payload === 'object') {
		const record = payload as Record<string, unknown>
		if (Array.isArray(record.data))
			return record.data as SinaINewsLiveItem[]
	}
	throw new Error('Sina iNews response is invalid')
}

export function mapSinaINewsFinanceItems(payload: unknown): FinanceFlashSourceItem[] {
	const items: FinanceFlashSourceItem[] = []
	const seen = new Set<string>()
	for (const raw of responseItems(payload)) {
		const id = raw?.docid === undefined || raw.docid === null ? '' : String(raw.docid).trim()
		const textParts = titleAndSummary(raw?.content)
		const date = publishedAt(raw?.cTime)
		if (!id || !textParts || !date || seen.has(id))
			continue
		seen.add(id)
		const ids = typeIds(raw?.typeid ?? raw?.cid)
		const combinedText = `${textParts.title} ${textParts.summary || ''}`
		const category = categoryFor(ids, combinedText)
		const importance = importanceFor(ids, combinedText)
		items.push({
			id,
			title: textParts.title,
			summary: textParts.summary,
			publishedAt: date,
			category,
			categoryLabel: categoryLabel(category),
			topic: topicFor(category, ids, combinedText),
			important: importance.important,
			importanceOrigin: importance.origin,
			importanceScore: null,
			sourceName: '新浪财经',
			sourceUrl: null,
			publicVisible: false,
		})
	}
	return items
}

export class SinaINewsFinanceFlashAdapter implements FinanceFlashAdapter {
	readonly id = 'sina-inews-7x24'
	readonly prototype = false

	constructor(
		private readonly config: SinaINewsConfig,
		private readonly fetchImpl: SinaINewsFetch = globalThis.fetch,
		private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1_000),
	) {}

	get enabled(): boolean {
		return Boolean(this.config.appKey?.trim() && this.config.appSecret?.trim())
	}

	async fetch(): Promise<FinanceFlashSourceItem[]> {
		const appKey = this.config.appKey?.trim()
		const appSecret = this.config.appSecret?.trim()
		if (!appKey || !appSecret)
			throw new Error('Sina iNews source is disabled: missing credentials')

		const params: Record<string, SignValue> = {
			app_key: appKey,
			ts: this.nowSeconds(),
			page: 1,
			num: 50,
			typeid: this.config.typeIds?.trim() || DEFAULT_TYPE_IDS,
		}
		const url = new URL(SINA_INEWS_LIVE_LIST_URL)
		const sorted = Object.entries(params)
			.filter(([, value]) => value !== '' && value !== null && value !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
		for (const [key, value] of sorted)
			url.searchParams.set(key, String(value))
		url.searchParams.set('sign', signSinaINewsParams(params, appSecret))

		const response = await this.fetchImpl(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(12_000),
		})
		if (!response.ok)
			throw new Error(`Sina iNews request failed with HTTP ${response.status}`)
		const payload = await response.json()
		const items = mapSinaINewsFinanceItems(payload)
		if (!items.length)
			throw new Error('Sina iNews response contained no usable items')
		return items
	}
}
