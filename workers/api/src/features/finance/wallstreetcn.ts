import type { FinanceCategory, FinanceImportanceOrigin } from '../../../../../shared/admin/finance'
import type { FinanceFlashAdapter, FinanceFlashSourceItem } from './service'

interface WallstreetCnLiveItem {
	id?: number | string
	title?: string
	content_text?: string
	display_time?: number
	uri?: string
	channels?: string[]
	score?: number
}

interface WallstreetCnLiveResponse {
	code?: number
	message?: string
	data?: {
		items?: WallstreetCnLiveItem[]
		next_cursor?: string | number | null
	}
}

const WALLSTREETCN_LIVE_URL = 'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel'
const FINANCE_SYNC_WINDOW = 125
const WALLSTREETCN_PAGE_SIZE = 100
const WALLSTREETCN_MAX_PAGES = 3
const MAX_TITLE_LENGTH = 180
const MAX_SUMMARY_LENGTH = 280

const COMPANY_PATTERN = /公司|股份|集团|控股|银行|证券|保险|公告|财报|业绩|营收|净利润|利润|亏损|订单|中标|回购|增持|减持|股东|董事会|收购|并购|IPO|上市|融资|配售|机构调研|首批交付|分红/u
const MACRO_PATTERN = /央行|美联储|联储|欧洲央行|日本央行|英格兰银行|利率|降息|加息|CPI|PPI|GDP|非农|失业|就业|通胀|通缩|财政|商务部|发改委|国务院|关税|反倾销|监管|政策|国债|逆回购|PMI/iu
const TECH_PATTERN = /人工智能|\bAI\b|OpenAI|DeepSeek|英伟达|NVIDIA|芯片|半导体|机器人|算力|数据中心|云计算|大模型|软件|互联网|数据库|SpaceX/iu
const IMPORTANT_RULE_PATTERN = /央行|美联储|欧洲央行|日本央行|利率决议|降息|加息|CPI|PPI|GDP|非农|关税|制裁|重大资产|收购|并购|IPO|上市|财报|业绩预告|净利润|营收|回购|停牌|复牌|熔断|暴涨|暴跌|历史新高/iu

function compactText(value: unknown): string {
	return typeof value === 'string'
		? value.replace(/\s+/gu, ' ').trim()
		: ''
}

function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function titleAndSummary(item: WallstreetCnLiveItem): { title: string, summary: string | null } | null {
	const upstreamTitle = compactText(item.title)
	const content = compactText(item.content_text)
	if (!upstreamTitle && !content)
		return null
	if (upstreamTitle) {
		const title = truncate(upstreamTitle, MAX_TITLE_LENGTH)
		const summary = content && content !== upstreamTitle
			? truncate(content, MAX_SUMMARY_LENGTH)
			: null
		return { title, summary }
	}

	const sentenceEnd = content.search(/[。！？!?]/u)
	const cutAt = sentenceEnd >= 0 && sentenceEnd < 140 ? sentenceEnd + 1 : Math.min(content.length, 120)
	const title = truncate(content.slice(0, cutAt).trim(), MAX_TITLE_LENGTH)
	const remainder = content.slice(cutAt).trim()
	return {
		title,
		summary: remainder ? truncate(remainder, MAX_SUMMARY_LENGTH) : null,
	}
}

function channelsOf(item: WallstreetCnLiveItem): Set<string> {
	return new Set(Array.isArray(item.channels) ? item.channels.filter(value => typeof value === 'string') : [])
}

function categoryFor(item: WallstreetCnLiveItem, text: string): FinanceCategory {
	const channels = channelsOf(item)
	if (COMPANY_PATTERN.test(text))
		return 'company'
	if (MACRO_PATTERN.test(text))
		return 'macro'
	if (TECH_PATTERN.test(text))
		return 'tech'
	if (channels.has('us-stock-channel') || channels.has('hk-stock-channel') || channels.has('forex-channel') || channels.has('gold-forex-channel'))
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

function topicFor(item: WallstreetCnLiveItem, category: FinanceCategory, text: string): string {
	const channels = channelsOf(item)
	if (category === 'company') {
		if (/财报|业绩|营收|净利润|利润|亏损/u.test(text))
			return '业绩 / 财报'
		if (/IPO|上市|融资|配售/iu.test(text))
			return 'IPO / 融资'
		if (/收购|并购|股权/u.test(text))
			return '并购 / 股权'
		return '公司动态'
	}
	if (category === 'macro') {
		if (/央行|美联储|联储|欧洲央行|日本央行|利率|降息|加息|逆回购/u.test(text))
			return '央行 / 利率'
		if (/CPI|PPI|GDP|非农|失业|就业|通胀|PMI/iu.test(text))
			return '经济数据'
		return '政策 / 宏观'
	}
	if (category === 'tech') {
		if (/人工智能|\bAI\b|OpenAI|DeepSeek|大模型/iu.test(text))
			return 'AI / 大模型'
		if (/芯片|半导体|算力|数据中心/u.test(text))
			return '半导体 / 算力'
		return '科技动态'
	}
	if (category === 'overseas') {
		if (channels.has('us-stock-channel'))
			return '美股 / 海外'
		if (channels.has('hk-stock-channel'))
			return '港股 / 海外'
		if (channels.has('forex-channel') || channels.has('gold-forex-channel'))
			return '外汇 / 海外'
		return '海外市场'
	}
	if (channels.has('oil-channel') || channels.has('gold-channel') || channels.has('goldc-channel') || channels.has('commodity-channel'))
		return '大宗商品'
	if (channels.has('a-stock-channel'))
		return 'A 股'
	return '市场快讯'
}

function importanceFor(item: WallstreetCnLiveItem, text: string): { important: boolean, origin: FinanceImportanceOrigin, score: number | null } {
	const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null
	if (score !== null && score >= 3)
		return { important: true, origin: 'upstream', score }
	if (IMPORTANT_RULE_PATTERN.test(text))
		return { important: true, origin: 'rule', score }
	return { important: false, origin: 'upstream', score }
}

function publishedAt(value: unknown): string | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
		return null
	const millis = value > 10_000_000_000 ? value : value * 1_000
	const date = new Date(millis)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function sourceUrl(value: unknown): string | null {
	if (typeof value !== 'string')
		return null
	try {
		const url = new URL(value)
		return url.protocol === 'https:' && (url.hostname === 'wallstreetcn.com' || url.hostname.endsWith('.wallstreetcn.com'))
			? url.toString()
			: null
	}
	catch {
		return null
	}
}

export function mapWallstreetCnFinanceItems(payload: unknown): FinanceFlashSourceItem[] {
	const response = payload as WallstreetCnLiveResponse
	if (!response || typeof response !== 'object' || response.code !== 20000 || !Array.isArray(response.data?.items))
		throw new Error(`WallstreetCN finance response is invalid${response?.message ? `: ${response.message}` : ''}`)

	const items: FinanceFlashSourceItem[] = []
	const seen = new Set<string>()
	for (const raw of response.data.items) {
		const id = raw?.id === undefined || raw.id === null ? '' : String(raw.id).trim()
		const date = publishedAt(raw?.display_time)
		const textParts = titleAndSummary(raw || {})
		if (!id || !date || !textParts || seen.has(id))
			continue
		seen.add(id)
		const combinedText = `${textParts.title} ${textParts.summary || ''}`
		const category = categoryFor(raw, combinedText)
		const importance = importanceFor(raw, combinedText)
		items.push({
			id,
			title: textParts.title,
			summary: textParts.summary,
			publishedAt: date,
			category,
			categoryLabel: categoryLabel(category),
			topic: topicFor(raw, category, combinedText),
			important: importance.important,
			importanceOrigin: importance.origin,
			importanceScore: importance.score,
			sourceName: '华尔街见闻',
			sourceUrl: sourceUrl(raw?.uri),
		})
	}
	return items
}

export class WallstreetCnFinanceFlashAdapter implements FinanceFlashAdapter {
	readonly id = 'wallstreetcn-7x24'
	readonly prototype = false

	constructor(private readonly url = WALLSTREETCN_LIVE_URL) {}

	private async fetchPage(limit: number, cursor: string | null): Promise<{ items: FinanceFlashSourceItem[], nextCursor: string | null }> {
		const url = new URL(this.url)
		url.searchParams.set('limit', String(limit))
		if (cursor)
			url.searchParams.set('cursor', cursor)
		else
			url.searchParams.delete('cursor')

		const response = await fetch(url.toString(), {
			headers: {
				'accept': 'application/json',
				'user-agent': 'fly-living/1.0 (+https://flyovo.cc.cd)',
			},
			signal: AbortSignal.timeout(12_000),
		})
		if (!response.ok)
			throw new Error(`WallstreetCN finance request failed with HTTP ${response.status}`)

		const payload = await response.json() as WallstreetCnLiveResponse
		const items = mapWallstreetCnFinanceItems(payload)
		const rawCursor = payload.data?.next_cursor
		const nextCursor = rawCursor === undefined || rawCursor === null ? null : String(rawCursor).trim() || null
		return { items, nextCursor }
	}

	async fetch(): Promise<FinanceFlashSourceItem[]> {
		const items: FinanceFlashSourceItem[] = []
		const seen = new Set<string>()
		let cursor: string | null = null

		for (let page = 0; page < WALLSTREETCN_MAX_PAGES && items.length < FINANCE_SYNC_WINDOW; page += 1) {
			const remaining = FINANCE_SYNC_WINDOW - items.length
			const pageLimit = Math.min(WALLSTREETCN_PAGE_SIZE, remaining)
			const result = await this.fetchPage(pageLimit, cursor)
			for (const item of result.items) {
				if (seen.has(item.id))
					continue
				seen.add(item.id)
				items.push(item)
				if (items.length >= FINANCE_SYNC_WINDOW)
					break
			}

			if (!result.nextCursor || result.nextCursor === cursor || !result.items.length)
				break
			cursor = result.nextCursor
		}

		if (!items.length)
			throw new Error('WallstreetCN finance response contained no usable items')
		return items.slice(0, FINANCE_SYNC_WINDOW)
	}
}
