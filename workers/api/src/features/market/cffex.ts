import type { CiticFuturesPositionPoint, CiticFuturesProduct } from '../../../../../shared/market'

const CFFEX_BASE_URL = 'http://www.cffex.com.cn/sj/ccpm'
const CITIC_MEMBER_NAME = '中信期货(代客)'
const REQUEST_TIMEOUT_MS = 5_000

export const CFFEX_SOURCE_NAME = '中国金融期货交易所' as const
export const CFFEX_PUBLIC_PAGE = 'http://www.cffex.com.cn/ccpm/'

export interface CffexCiticPositionResult {
	data: CiticFuturesPositionPoint
	sourceUrl: string
	fetchedAt: string
}

export interface CiticPositionProvider {
	fetchProduct: (product: CiticFuturesProduct, tradeDate: string) => Promise<CffexCiticPositionResult>
}

type MarketFetch = typeof fetch

const workerFetch: MarketFetch = (input, init) => fetch(input, init)

function csvFields(line: string): string[] {
	const fields: string[] = []
	let current = ''
	let quoted = false
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index]!
		if (char === '"') {
			if (quoted && line[index + 1] === '"') {
				current += '"'
				index += 1
			}
			else {
				quoted = !quoted
			}
			continue
		}
		if (char === ',' && !quoted) {
			fields.push(current.trim())
			current = ''
			continue
		}
		current += char
	}
	fields.push(current.trim())
	return fields
}

function integer(value: string | undefined): number | null {
	if (!value)
		return null
	const parsed = Number(value.replaceAll(',', ''))
	return Number.isInteger(parsed) ? parsed : null
}

function normalizedTradeDate(value: string | undefined): string | null {
	if (!value || !/^\d{8}$/u.test(value))
		return null
	return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

export function parseCffexCiticPositionCsv(
	csv: string,
	product: CiticFuturesProduct,
	expectedTradeDate?: string,
): CiticFuturesPositionPoint {
	const contracts = new Set<string>()
	const longContracts = new Set<string>()
	const shortContracts = new Set<string>()
	let tradeDate: string | null = null
	let longPosition = 0
	let longChange = 0
	let shortPosition = 0
	let shortChange = 0

	for (const rawLine of csv.split(/\r?\n/gu).slice(2)) {
		if (!rawLine.trim())
			continue
		const fields = csvFields(rawLine)
		if (fields.length < 12)
			continue
		const rowDate = normalizedTradeDate(fields[0])
		const contract = fields[1]?.trim() || ''
		if (!rowDate || !contract.startsWith(product))
			continue
		if (expectedTradeDate && rowDate !== expectedTradeDate)
			throw new Error(`CFFEX ${product} trade date mismatch: ${rowDate}`)
		tradeDate ||= rowDate
		if (tradeDate !== rowDate)
			throw new Error(`CFFEX ${product} response contains multiple trade dates`)
		contracts.add(contract)

		if (fields[6]?.trim() === CITIC_MEMBER_NAME) {
			const position = integer(fields[7])
			const change = integer(fields[8])
			if (position === null || change === null)
				throw new Error(`CFFEX ${product} long ranking is invalid`)
			if (!longContracts.has(contract)) {
				longContracts.add(contract)
				longPosition += position
				longChange += change
			}
		}

		if (fields[9]?.trim() === CITIC_MEMBER_NAME) {
			const position = integer(fields[10])
			const change = integer(fields[11])
			if (position === null || change === null)
				throw new Error(`CFFEX ${product} short ranking is invalid`)
			if (!shortContracts.has(contract)) {
				shortContracts.add(contract)
				shortPosition += position
				shortChange += change
			}
		}
	}

	if (!tradeDate || !contracts.size)
		throw new Error(`CFFEX ${product} response contained no usable ranking rows`)
	if (!longContracts.size && !shortContracts.size)
		throw new Error(`CFFEX ${product} response contained no Citic Futures ranking rows`)

	return {
		tradeDate,
		product,
		longPosition,
		longChange,
		shortPosition,
		shortChange,
		netPosition: longPosition - shortPosition,
		netChange: longChange - shortChange,
		contractCount: contracts.size,
		longRankedContractCount: longContracts.size,
		shortRankedContractCount: shortContracts.size,
		complete: longContracts.size === contracts.size && shortContracts.size === contracts.size,
	}
}

function fileUrl(product: CiticFuturesProduct, tradeDate: string): string {
	const compact = tradeDate.replaceAll('-', '')
	if (!/^\d{8}$/u.test(compact))
		throw new Error('CFFEX trade date is invalid')
	return `${CFFEX_BASE_URL}/${compact.slice(0, 6)}/${compact.slice(6, 8)}/${product}_1.csv`
}

export class CffexCiticPositionProvider implements CiticPositionProvider {
	constructor(
		private readonly fetcher: MarketFetch = workerFetch,
		private readonly now: () => Date = () => new Date(),
	) {}

	async fetchProduct(product: CiticFuturesProduct, tradeDate: string): Promise<CffexCiticPositionResult> {
		const sourceUrl = fileUrl(product, tradeDate)
		const response = await this.fetcher(sourceUrl, {
			headers: { 'User-Agent': 'Mozilla/5.0' },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
		if (!response.ok)
			throw new Error(`CFFEX ${product} request failed with HTTP ${response.status}`)
		const bytes = await response.arrayBuffer()
		if (!bytes.byteLength)
			throw new Error(`CFFEX ${product} response was empty`)
		const csv = new TextDecoder('gbk').decode(bytes)
		return {
			data: parseCffexCiticPositionCsv(csv, product, tradeDate),
			sourceUrl,
			fetchedAt: this.now().toISOString(),
		}
	}
}
