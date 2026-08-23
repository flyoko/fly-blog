import type { FinanceCategory, FinanceImportanceOrigin } from '../../../../../shared/admin/finance'
import type { FinanceFlashAdapter, FinanceFlashSourceItem } from './service'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const JIN10_MCP_URL = 'https://mcp.jin10.com/mcp'
const JIN10_TOOL_NAME = 'list_flash'
const JIN10_MAX_PAGES = 3
const JIN10_SYNC_WINDOW = 60
const JIN10_TIMEOUT_MS = 12_000
const MAX_TITLE_LENGTH = 180
const MAX_SUMMARY_LENGTH = 280

const COMPANY_PATTERN = /公司|股份|集团|控股|银行|证券|保险|公告|财报|业绩|营收|净利润|利润|亏损|订单|中标|回购|增持|减持|股东|董事会|收购|并购|IPO|上市|融资|配售/u
const MACRO_PATTERN = /央行|美联储|联储|欧洲央行|日本央行|英格兰银行|利率|降息|加息|CPI|PPI|GDP|非农|失业|就业|通胀|财政|关税|PMI/iu
const TECH_PATTERN = /人工智能|\bAI\b|OpenAI|DeepSeek|英伟达|NVIDIA|芯片|半导体|机器人|算力|数据中心|云计算|大模型|软件|互联网/iu
const OVERSEAS_PATTERN = /美国|加拿大|欧洲|欧盟|日本|英国|俄罗斯|乌克兰|以色列|土耳其|中东|海外/u
const IMPORTANT_RULE_PATTERN = /央行|美联储|欧洲央行|日本央行|利率决议|降息|加息|CPI|PPI|GDP|非农|关税|制裁|重大资产|收购|并购|IPO|上市|财报|业绩预告|净利润|营收|回购|停牌|复牌|熔断|暴涨|暴跌|历史新高/iu

interface Jin10FlashItem {
	title?: unknown
	content?: unknown
	time?: unknown
	url?: unknown
}

interface Jin10FlashEnvelope {
	status?: unknown
	message?: unknown
	data?: {
		items?: unknown
		next_cursor?: unknown
		has_more?: unknown
	} | null
}

interface ParsedJin10Result {
	items: FinanceFlashSourceItem[]
	nextCursor: string | null
	hasMore: boolean
}

export interface Jin10McpClient {
	callTool: (params: { name: string, arguments?: Record<string, unknown> }) => Promise<unknown>
	close: () => Promise<void>
}

export type Jin10McpClientFactory = (token: string) => Promise<Jin10McpClient>

function compactText(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
}

function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function titleAndSummary(rawTitle: unknown, rawContent: unknown): { title: string, summary: string | null } | null {
	const upstreamTitle = compactText(rawTitle)
	const content = compactText(rawContent)
	if (!upstreamTitle && !content)
		return null
	if (upstreamTitle) {
		return {
			title: truncate(upstreamTitle, MAX_TITLE_LENGTH),
			summary: content && content !== upstreamTitle ? truncate(content, MAX_SUMMARY_LENGTH) : null,
		}
	}

	const bracketClose = content.startsWith('【') ? content.indexOf('】', 1) : -1
	if (bracketClose > 1) {
		const bracketTitle = content.slice(1, bracketClose).trim()
		const bracketSummary = content.slice(bracketClose + 1).trim()
		const summary = bracketSummary.replace(/^金十数据\d{1,2}月\d{1,2}日讯[，,:：]?\s*/u, '').trim()
		return {
			title: truncate(bracketTitle, MAX_TITLE_LENGTH),
			summary: summary ? truncate(summary, MAX_SUMMARY_LENGTH) : null,
		}
	}

	const sentenceEnd = content.search(/[。！？!?]/u)
	const cutAt = sentenceEnd >= 0 && sentenceEnd < 140 ? sentenceEnd + 1 : Math.min(content.length, 120)
	const title = truncate(content.slice(0, cutAt).trim(), MAX_TITLE_LENGTH)
	const remainder = content.slice(cutAt).trim()
	return { title, summary: remainder ? truncate(remainder, MAX_SUMMARY_LENGTH) : null }
}

function publishedAt(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim())
		return null
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function jin10SourceUrl(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim())
		return null
	try {
		const url = new URL(value)
		const hostAllowed = url.hostname === 'jin10.com' || url.hostname.endsWith('.jin10.com')
		return url.protocol === 'https:' && hostAllowed ? url.toString() : null
	}
	catch {
		return null
	}
}

function stableTextHash(value: string): string {
	let hash = 0x811C9DC5
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, '0')
}

function itemId(rawUrl: unknown, safeUrl: string | null, date: string, text: string): string {
	if (safeUrl) {
		const match = new URL(safeUrl).pathname.match(/\/detail\/([\w-]+)/u)
		if (match?.[1])
			return match[1]
	}
	return `${Date.parse(date)}-${stableTextHash(`${compactText(rawUrl)}|${text}`)}`
}

function categoryFor(text: string): FinanceCategory {
	if (COMPANY_PATTERN.test(text))
		return 'company'
	if (MACRO_PATTERN.test(text))
		return 'macro'
	if (TECH_PATTERN.test(text))
		return 'tech'
	if (OVERSEAS_PATTERN.test(text))
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

function topicFor(category: FinanceCategory, text: string): string {
	if (category === 'company')
		return /财报|业绩|营收|净利润|利润|亏损/u.test(text) ? '业绩 / 财报' : '公司动态'
	if (category === 'macro')
		return /央行|美联储|联储|利率|降息|加息/u.test(text) ? '央行 / 利率' : '政策 / 宏观'
	if (category === 'tech')
		return /芯片|半导体|算力|数据中心/u.test(text) ? '半导体 / 算力' : '科技动态'
	if (category === 'overseas')
		return '海外市场'
	return '市场快讯'
}

function importanceFor(text: string): { important: boolean, origin: FinanceImportanceOrigin } {
	return IMPORTANT_RULE_PATTERN.test(text)
		? { important: true, origin: 'rule' }
		: { important: false, origin: 'upstream' }
}

function recordValue(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null
}

function envelopeFromToolResult(result: unknown): Jin10FlashEnvelope {
	const root = recordValue(result)
	if (!root)
		throw new Error('Jin10 MCP tool result is invalid')

	const structured = recordValue(root.structuredContent)
	if (structured)
		return structured as Jin10FlashEnvelope

	if ('status' in root && 'data' in root)
		return root as Jin10FlashEnvelope

	const content = Array.isArray(root.content) ? root.content : []
	for (const part of content) {
		const record = recordValue(part)
		if (record?.type !== 'text' || typeof record.text !== 'string')
			continue
		try {
			const parsed = JSON.parse(record.text)
			const parsedRecord = recordValue(parsed)
			if (parsedRecord)
				return parsedRecord as Jin10FlashEnvelope
		}
		catch {
			continue
		}
	}
	throw new Error('Jin10 MCP tool result has no usable JSON payload')
}

function parseJin10FinanceToolResult(result: unknown, publicVisible = false): ParsedJin10Result {
	const envelope = envelopeFromToolResult(result)
	const status = typeof envelope.status === 'number' ? envelope.status : 0
	if (status !== 200 || !envelope.data || !Array.isArray(envelope.data.items)) {
		const message = compactText(envelope.message)
		throw new Error(`Jin10 MCP response is invalid${message ? `: ${message}` : ''}`)
	}

	const items: FinanceFlashSourceItem[] = []
	const seen = new Set<string>()
	for (const rawValue of envelope.data.items) {
		const raw = recordValue(rawValue) as Jin10FlashItem | null
		if (!raw)
			continue
		const date = publishedAt(raw.time)
		const textParts = titleAndSummary(raw.title, raw.content)
		if (!date || !textParts)
			continue
		const safeUrl = jin10SourceUrl(raw.url)
		const combinedText = `${textParts.title} ${textParts.summary || ''}`
		const id = itemId(raw.url, safeUrl, date, combinedText)
		if (seen.has(id))
			continue
		seen.add(id)
		const category = categoryFor(combinedText)
		const importance = importanceFor(combinedText)
		items.push({
			id,
			title: textParts.title,
			summary: textParts.summary,
			publishedAt: date,
			category,
			categoryLabel: categoryLabel(category),
			topic: topicFor(category, combinedText),
			important: importance.important,
			importanceOrigin: importance.origin,
			importanceScore: null,
			sourceName: '金十数据',
			sourceUrl: safeUrl,
			publicVisible,
		})
	}

	const nextCursor = typeof envelope.data.next_cursor === 'string'
		? envelope.data.next_cursor.trim() || null
		: null
	return {
		items,
		nextCursor,
		hasMore: envelope.data.has_more === true,
	}
}

export function mapJin10FinanceToolResult(result: unknown): FinanceFlashSourceItem[] {
	return parseJin10FinanceToolResult(result).items
}

async function createJin10McpClient(token: string): Promise<Jin10McpClient> {
	const client = new Client({ name: 'fly-living-api', version: '1.0.0' })
	const transport = new StreamableHTTPClientTransport(new URL(JIN10_MCP_URL), {
		requestInit: {
			headers: {
				authorization: `Bearer ${token}`,
			},
			signal: AbortSignal.timeout(JIN10_TIMEOUT_MS),
		},
	})
	await client.connect(transport)
	return {
		callTool: params => client.callTool(params),
		close: () => client.close(),
	}
}

function safeMcpError(cause: unknown, token: string): Error {
	const raw = cause instanceof Error ? cause.message : String(cause)
	const withoutToken = token ? raw.split(token).join('[REDACTED]') : raw
	const message = withoutToken.replace(/Bearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]').slice(0, 500)
	return new Error(`Jin10 MCP request failed${message ? `: ${message}` : ''}`)
}

export class Jin10FinanceFlashAdapter implements FinanceFlashAdapter {
	readonly id = 'jin10-mcp-7x24'
	readonly prototype = false

	constructor(
		private readonly token?: string,
		private readonly clientFactory: Jin10McpClientFactory = createJin10McpClient,
		private readonly publicVisible = false,
	) {}

	get enabled(): boolean {
		return Boolean(this.token?.trim())
	}

	async fetch(): Promise<FinanceFlashSourceItem[]> {
		const token = this.token?.trim()
		if (!token)
			throw new Error('Jin10 MCP source is disabled: missing token')

		let client: Jin10McpClient | null = null
		try {
			client = await this.clientFactory(token)
			const items: FinanceFlashSourceItem[] = []
			const seen = new Set<string>()
			let cursor: string | null = null

			for (let page = 0; page < JIN10_MAX_PAGES && items.length < JIN10_SYNC_WINDOW; page += 1) {
				const result = await client.callTool({
					name: JIN10_TOOL_NAME,
					arguments: cursor ? { cursor } : {},
				})
				const parsed = parseJin10FinanceToolResult(result, this.publicVisible)
				for (const item of parsed.items) {
					if (seen.has(item.id))
						continue
					seen.add(item.id)
					items.push(item)
					if (items.length >= JIN10_SYNC_WINDOW)
						break
				}

				if (!parsed.hasMore || !parsed.nextCursor || parsed.nextCursor === cursor || !parsed.items.length)
					break
				cursor = parsed.nextCursor
			}

			if (!items.length)
				throw new Error('Jin10 MCP response contained no usable items')
			return items.slice(0, JIN10_SYNC_WINDOW)
		}
		catch (cause) {
			throw safeMcpError(cause, token)
		}
		finally {
			if (client) {
				try {
					await client.close()
				}
				catch {
					// 关闭失败不覆盖已经取得的数据或主请求错误。
				}
			}
		}
	}
}
