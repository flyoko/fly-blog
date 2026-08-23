import type { FinanceCategory, FinanceImportanceOrigin } from '../../../../../shared/admin/finance'
import type { FinanceFlashAdapter, FinanceFlashSourceItem } from './service'
import { createHash } from 'node:crypto'

const CLS_ROLL_URL = 'https://www.cls.cn/v1/roll/get_roll_list'
const CLS_APP = 'CailianpressWeb'
const CLS_OS = 'web'
const CLS_VERSION = '8.7.9'
const CLS_PAGE_SIZE = 20
const CLS_SYNC_WINDOW = 125
const CLS_MAX_PAGES = 7
const CLS_TIMEOUT_MS = 12_000
const MAX_TITLE_LENGTH = 180
const MAX_SUMMARY_LENGTH = 280

const COMPANY_PATTERN = /公司|股份|集团|控股|银行|证券|保险|公告|财报|业绩|营收|净利润|利润|亏损|订单|中标|回购|增持|减持|股东|董事会|并购|IPO|上市|融资|配售|机构调研|投资者关系|分红|签订|合同/u
const MACRO_PATTERN = /央行|美联储|联储|欧洲央行|日本央行|英格兰银行|利率|降息|加息|CPI|PPI|GDP|非农|失业|就业|通胀|通缩|财政|商务部|发改委|国务院|关税|反倾销|监管|政策|国债|逆回购|PMI/iu
const TECH_PATTERN = /人工智能|\bAI\b|OpenAI|DeepSeek|英伟达|NVIDIA|芯片|半导体|机器人|算力|数据中心|云计算|大模型|软件|互联网|数据库|光模块|CPO|NPO|XPO|核聚变|航天|太空|卫星|嫦娥|SpaceX/iu
const OVERSEAS_PATTERN = /美股|港股|外汇|美元|日元|欧元|欧洲|美国|日本|韩国|英国|法国|德国|中东|伊朗|以色列|俄罗斯|乌克兰|海外|国际/u
const COMMODITY_PATTERN = /黄金|白银|原油|布油|WTI|[铜铝锌镍]|铁矿|焦煤|焦炭|大宗商品|期货/iu
const A_STOCK_PATTERN = /A股|沪指|深成指|创业板|科创|上证|深证|北证/u
const IMPORTANT_LEVELS = new Set(['A', 'B'])
const CLS_PREFIX_PATTERN = /^财联社\d{1,2}月\d{1,2}日电[，,:：\s]*/u
const BRACKET_TITLE_PATTERN = /^【([^】]{2,180})】/u

export type ClsFinanceFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

type SignValue = string | number | boolean

interface ClsSubject {
	subject_name?: string
	channel?: string
}

interface ClsStock {
	name?: string
	StockID?: string
}

interface ClsRollItem {
	id?: string | number
	ctime?: number
	title?: string
	brief?: string
	content?: string
	level?: string
	bold?: number
	shareurl?: string
	subjects?: ClsSubject[]
	stock_list?: ClsStock[]
}

interface ClsRollResponse {
	errno?: string | number
	msg?: string
	data?: {
		roll_data?: ClsRollItem[]
	}
}

function compactText(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
}

function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function signQuery(params: Record<string, SignValue>): string {
	return Object.keys(params)
		.sort((left, right) => {
			const upperLeft = left.toUpperCase()
			const upperRight = right.toUpperCase()
			return upperLeft > upperRight ? 1 : upperLeft === upperRight ? 0 : -1
		})
		.map(key => `${key}=${params[key]}`)
		.join('&')
}

export function signClsFinanceParams(params: Record<string, SignValue>): string {
	const sha1 = createHash('sha1').update(signQuery(params)).digest('hex')
	return createHash('md5').update(sha1).digest('hex')
}

function cleanBrief(value: string): string {
	return value
		.replace(BRACKET_TITLE_PATTERN, '')
		.trim()
		.replace(CLS_PREFIX_PATTERN, '')
		.trim()
}

function titleAndSummary(item: ClsRollItem): { title: string, summary: string | null } | null {
	const upstreamTitle = compactText(item.title)
	const rawBrief = compactText(item.brief) || compactText(item.content)
	if (!upstreamTitle && !rawBrief)
		return null

	const bracketTitle = rawBrief.match(BRACKET_TITLE_PATTERN)?.[1]?.trim() || ''
	const cleaned = cleanBrief(rawBrief)
	if (upstreamTitle || bracketTitle) {
		const title = truncate(upstreamTitle || bracketTitle, MAX_TITLE_LENGTH)
		const summary = cleaned && cleaned !== title ? truncate(cleaned, MAX_SUMMARY_LENGTH) : null
		return { title, summary }
	}

	const sentenceEnd = cleaned.search(/[。！？!?]/u)
	const cutAt = sentenceEnd >= 0 && sentenceEnd < 140 ? sentenceEnd + 1 : Math.min(cleaned.length, 120)
	const title = truncate(cleaned.slice(0, cutAt).trim(), MAX_TITLE_LENGTH)
	const remainder = cleaned.slice(cutAt).trim()
	return title ? { title, summary: remainder ? truncate(remainder, MAX_SUMMARY_LENGTH) : null } : null
}

function subjectNames(item: ClsRollItem): string[] {
	return Array.isArray(item.subjects)
		? item.subjects.map(subject => compactText(subject?.subject_name)).filter(Boolean)
		: []
}

function hasStock(item: ClsRollItem): boolean {
	return Array.isArray(item.stock_list) && item.stock_list.some(stock => compactText(stock?.name) || compactText(stock?.StockID))
}

function categoryFor(item: ClsRollItem, text: string): FinanceCategory {
	const subjects = subjectNames(item).join(' ')
	const combined = `${subjects} ${text}`
	if (hasStock(item))
		return 'company'
	if (MACRO_PATTERN.test(combined))
		return 'macro'
	if (TECH_PATTERN.test(combined))
		return 'tech'
	if (COMPANY_PATTERN.test(combined))
		return 'company'
	if (OVERSEAS_PATTERN.test(combined) || /环球市场|港股|美股|外汇/u.test(subjects))
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

function topicFor(item: ClsRollItem, category: FinanceCategory, text: string): string {
	const subjects = subjectNames(item)
	const subjectsText = subjects.join(' ')
	if (/机构调研/u.test(subjectsText))
		return '机构调研'
	if (category === 'company') {
		if (/财报|业绩|营收|净利润|利润|亏损/u.test(text))
			return '业绩 / 财报'
		if (/IPO|上市|融资|配售/iu.test(text))
			return 'IPO / 融资'
		if (/收购|并购|股权/u.test(text))
			return '并购 / 股权'
		if (/订单|中标|合同|签订/u.test(text))
			return '订单 / 合同'
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
		if (/芯片|半导体|算力|数据中心|光模块|CPO|NPO|XPO/iu.test(text))
			return '半导体 / 算力'
		return '科技动态'
	}
	if (category === 'overseas') {
		if (/港股/u.test(`${subjectsText} ${text}`))
			return '港股 / 海外'
		if (/美股/u.test(`${subjectsText} ${text}`))
			return '美股 / 海外'
		if (/外汇|美元|日元|欧元/u.test(`${subjectsText} ${text}`))
			return '外汇 / 海外'
		return '海外市场'
	}
	if (COMMODITY_PATTERN.test(`${subjectsText} ${text}`))
		return '大宗商品'
	if (A_STOCK_PATTERN.test(`${subjectsText} ${text}`))
		return 'A 股'
	return subjects[0] || '市场快讯'
}

function importanceFor(item: ClsRollItem): { important: boolean, origin: FinanceImportanceOrigin, score: number | null } {
	const level = compactText(item.level).toUpperCase()
	const score = level === 'A' ? 3 : level === 'B' ? 2 : level === 'C' ? 1 : null
	return {
		important: IMPORTANT_LEVELS.has(level),
		origin: 'upstream',
		score,
	}
}

function publishedAt(value: unknown): string | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
		return null
	const date = new Date(value * 1_000)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function sourceUrl(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim())
		return null
	try {
		const url = new URL(value)
		const allowed = url.hostname === 'cls.cn' || url.hostname.endsWith('.cls.cn')
		return url.protocol === 'https:' && allowed ? url.toString() : null
	}
	catch {
		return null
	}
}

export function mapClsFinanceItems(payload: unknown): FinanceFlashSourceItem[] {
	const response = payload as ClsRollResponse
	if (!response || typeof response !== 'object' || Number(response.errno) !== 0 || !Array.isArray(response.data?.roll_data))
		throw new Error(`CLS finance response is invalid${response?.msg ? `: ${response.msg}` : ''}`)

	const items: FinanceFlashSourceItem[] = []
	const seen = new Set<string>()
	for (const raw of response.data.roll_data) {
		const id = raw?.id === undefined || raw.id === null ? '' : String(raw.id).trim()
		const date = publishedAt(raw?.ctime)
		const textParts = titleAndSummary(raw || {})
		if (!id || !date || !textParts || seen.has(id))
			continue
		seen.add(id)
		const combinedText = `${textParts.title} ${textParts.summary || ''} ${subjectNames(raw).join(' ')}`
		const category = categoryFor(raw, combinedText)
		const importance = importanceFor(raw)
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
			sourceName: '财联社',
			sourceUrl: sourceUrl(raw.shareurl),
		})
	}
	return items
}

export class ClsFinanceFlashAdapter implements FinanceFlashAdapter {
	readonly id = 'cls-telegraph-7x24'
	readonly prototype = false

	constructor(
		private readonly fetchImpl: ClsFinanceFetch = globalThis.fetch,
		private readonly url = CLS_ROLL_URL,
	) {}

	private async fetchPage(lastTime: number, limit: number): Promise<{ items: FinanceFlashSourceItem[], nextLastTime: number | null }> {
		const params: Record<string, SignValue> = {
			app: CLS_APP,
			last_time: Math.trunc(lastTime),
			os: CLS_OS,
			refresh_type: 1,
			rn: limit,
			sv: CLS_VERSION,
		}
		const sign = signClsFinanceParams(params)
		const requestUrl = new URL(this.url)
		for (const [key, value] of Object.entries(params))
			requestUrl.searchParams.set(key, String(value))
		requestUrl.searchParams.set('sign', sign)

		const response = await this.fetchImpl(requestUrl.toString(), {
			headers: {
				'accept': 'application/json,text/plain,*/*',
				'referer': 'https://www.cls.cn/telegraph',
				'user-agent': 'Mozilla/5.0 (compatible; fly-living/1.0; +https://flyovo.cc.cd)',
			},
			signal: AbortSignal.timeout(CLS_TIMEOUT_MS),
		})
		if (!response.ok)
			throw new Error(`CLS finance request failed with HTTP ${response.status}`)

		const payload = await response.json() as ClsRollResponse
		const items = mapClsFinanceItems(payload)
		const rawRows = Array.isArray(payload.data?.roll_data) ? payload.data.roll_data : []
		const times = rawRows
			.map(item => item?.ctime)
			.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
		const nextLastTime = times.length ? Math.min(...times) : null
		return { items, nextLastTime }
	}

	async fetch(): Promise<FinanceFlashSourceItem[]> {
		const items: FinanceFlashSourceItem[] = []
		const seen = new Set<string>()
		let lastTime = Math.floor(Date.now() / 1_000)

		for (let page = 0; page < CLS_MAX_PAGES && items.length < CLS_SYNC_WINDOW; page += 1) {
			const remaining = CLS_SYNC_WINDOW - items.length
			const result = await this.fetchPage(lastTime, Math.min(CLS_PAGE_SIZE, remaining))
			for (const item of result.items) {
				if (seen.has(item.id))
					continue
				seen.add(item.id)
				items.push(item)
				if (items.length >= CLS_SYNC_WINDOW)
					break
			}
			if (!result.nextLastTime || result.nextLastTime >= lastTime || !result.items.length)
				break
			lastTime = result.nextLastTime
		}

		if (!items.length)
			throw new Error('CLS finance response contained no usable items')
		return items.slice(0, CLS_SYNC_WINDOW)
	}
}
