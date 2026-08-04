import type {
	AnalyticsBotRankDto,
	AnalyticsCollectionPayload,
	AnalyticsCollectorStatusDto,
	AnalyticsDevicesDto,
	AnalyticsExportQuery,
	AnalyticsExportRowDto,
	AnalyticsGeoRankDto,
	AnalyticsPageRankDto,
	AnalyticsQuery,
	AnalyticsRealtimeDto,
	AnalyticsSummaryDto,
	AnalyticsTimeseriesPointDto,
	AnalyticsVisitorQuery,
	AnalyticsVisitorsDto,
} from '../../../../../shared/admin/analytics'
import type { Env } from '../../env'
import type {
	AnalyticsMaintenanceResult,
	AnalyticsStoredEvent,
} from '../../repositories/analytics-repository'
import { AnalyticsRepository, analyticsRetention } from '../../repositories/analytics-repository'

const encoder = new TextEncoder()
const MAX_CLIENT_CLOCK_SKEW_MS = 10 * 60 * 1_000
const SESSION_WINDOW_MS = 30 * 60 * 1_000

export interface AnalyticsClassification {
	isBot: boolean
	isSuspectedBot: boolean
	botName: string | null
	botCategory: string | null
	classificationSource: string
}

export interface AnalyticsDevice {
	deviceType: string
	browserName: string | null
	browserVersion: string | null
	osName: string | null
	osVersion: string | null
}

function base64Url(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes)
		binary += String.fromCharCode(byte)
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function nullableText(value: string | null | undefined, maximum: number): string | null {
	const normalized = value?.trim()
	return normalized ? normalized.slice(0, maximum) : null
}

function nullableNumber(value: number | null | undefined, minimum: number, maximum: number): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
		? value
		: null
}

function roundedCoordinate(value: number | null | undefined, minimum: number, maximum: number): number | null {
	const normalized = nullableNumber(value, minimum, maximum)
	return normalized === null ? null : Math.round(normalized * 100) / 100
}

function normalizedOccurredAt(occurredAt: string, receivedAt: string): string {
	const occurred = Date.parse(occurredAt)
	const received = Date.parse(receivedAt)
	if (!Number.isFinite(occurred) || !Number.isFinite(received))
		return receivedAt
	return Math.abs(occurred - received) <= MAX_CLIENT_CLOCK_SKEW_MS
		? new Date(occurred).toISOString()
		: new Date(received).toISOString()
}

function version(match: RegExpMatchArray | null): string | null {
	return match?.[1]?.replaceAll('_', '.') ?? null
}

function knownBot(userAgent: string): { name: string, category: string } | null {
	const bots: Array<[RegExp, string, string]> = [
		[/Googlebot/iu, 'Googlebot', 'search'],
		[/bingbot/iu, 'Bingbot', 'search'],
		[/Baiduspider/iu, 'Baiduspider', 'search'],
		[/YandexBot/iu, 'YandexBot', 'search'],
		[/DuckDuckBot/iu, 'DuckDuckBot', 'search'],
		[/Applebot/iu, 'Applebot', 'search'],
		[/Bytespider/iu, 'Bytespider', 'search'],
		[/AhrefsBot/iu, 'AhrefsBot', 'seo'],
		[/SemrushBot/iu, 'SemrushBot', 'seo'],
		[/facebookexternalhit/iu, 'Facebook', 'social'],
		[/Twitterbot/iu, 'Twitterbot', 'social'],
	]
	for (const [pattern, name, category] of bots) {
		if (pattern.test(userAgent))
			return { name, category }
	}
	return null
}

export function hmacAnalytics(value: string, secret: string): Promise<string> {
	if (secret.length < 32)
		throw new Error('ANALYTICS_HASH_SECRET must contain at least 32 characters')
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	).then(async (key) => {
		const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
		return base64Url(new Uint8Array(signature))
	})
}

export function normalizeAnalyticsPath(value: string, publicOrigin: string): string {
	try {
		const base = new URL(publicOrigin)
		const url = new URL(value, base)
		if (url.origin !== base.origin)
			return '/'
		const pathname = Array.from(url.pathname)
			.filter(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
			.join('')
		return (pathname.startsWith('/') ? pathname : `/${pathname}`).slice(0, 512) || '/'
	}
	catch {
		return '/'
	}
}

export function normalizeReferrer(
	value: string | null | undefined,
	publicOrigin: string,
): { host: string | null, path: string | null } {
	if (!value)
		return { host: null, path: null }
	try {
		const url = new URL(value, publicOrigin)
		return {
			host: nullableText(url.host.toLowerCase(), 240),
			path: nullableText(url.pathname, 512),
		}
	}
	catch {
		return { host: null, path: null }
	}
}

export function maskIp(value: string | null): string | null {
	if (!value)
		return null
	const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u)
	if (ipv4)
		return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.xxx`
	if (value.includes(':')) {
		const groups = value.split(':').filter(Boolean).slice(0, 4)
		return groups.length ? `${groups.join(':')}::` : '::'
	}
	return 'masked'
}

export function classifyUserAgent(
	userAgent: string,
	input: {
		verifiedBot?: boolean
		botScore?: number | null
		botName?: string | null
		botCategory?: string | null
		classificationSource?: string | null
	} = {},
): AnalyticsClassification {
	const known = knownBot(userAgent)
	if (input.verifiedBot || known) {
		return {
			isBot: true,
			isSuspectedBot: false,
			botName: nullableText(input.botName, 120) ?? known?.name ?? 'Verified Bot',
			botCategory: nullableText(input.botCategory, 80) ?? known?.category ?? 'verified',
			classificationSource: nullableText(input.classificationSource, 80) ?? (input.verifiedBot ? 'cloudflare' : 'ua'),
		}
	}
	const automation = /HeadlessChrome|Playwright|Puppeteer|Selenium|python-requests|aiohttp|curl\/|Wget\//iu.test(userAgent)
	const suspiciousScore = typeof input.botScore === 'number' && input.botScore <= 20
	const missingUserAgent = userAgent.trim().length === 0
	if (automation || suspiciousScore || missingUserAgent) {
		return {
			isBot: false,
			isSuspectedBot: true,
			botName: null,
			botCategory: automation ? 'automation' : suspiciousScore ? 'score' : 'missing-user-agent',
			classificationSource: nullableText(input.classificationSource, 80) ?? (suspiciousScore ? 'cloudflare-score' : 'ua'),
		}
	}
	return {
		isBot: false,
		isSuspectedBot: false,
		botName: null,
		botCategory: null,
		classificationSource: nullableText(input.classificationSource, 80) ?? 'ua',
	}
}

export function parseDevice(userAgent: string): AnalyticsDevice {
	const tablet = /iPad|Tablet|PlayBook|Silk/iu.test(userAgent)
	const mobile = /Mobi|iPhone|Android/iu.test(userAgent)
	const edge = userAgent.match(/Edg\/([\d.]+)/u)
	const chrome = userAgent.match(/(?:Chrome|CriOS)\/([\d.]+)/u)
	const firefox = userAgent.match(/(?:Firefox|FxiOS)\/([\d.]+)/u)
	const safariVersion = userAgent.match(/Version\/(\d+(?:\.\d+){0,3})/u)
	const safari = !chrome && !edge && /Safari\//u.test(userAgent) ? safariVersion : null
	const browserName = edge ? 'Edge' : chrome ? 'Chrome' : firefox ? 'Firefox' : safari ? 'Safari' : null
	const browserVersion = version(edge ?? chrome ?? firefox ?? safari)

	const ios = userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS) ([\d_]+)/iu)
	const android = userAgent.match(/Android ([\d.]+)/iu)
	const windows = userAgent.match(/Windows NT ([\d.]+)/iu)
	const mac = userAgent.match(/Mac OS X ([\d_]+)/iu)
	const osName = ios ? 'iOS' : android ? 'Android' : windows ? 'Windows' : mac ? 'macOS' : /Linux/iu.test(userAgent) ? 'Linux' : null
	const osVersion = version(ios ?? android ?? windows ?? mac)

	return {
		deviceType: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop',
		browserName,
		browserVersion,
		osName,
		osVersion,
	}
}

function csvCell(value: string | number | null): string {
	let text = value === null ? '' : String(value)
	if (/^[=+\-@]/u.test(text))
		text = `'${text}`
	return `"${text.replaceAll('"', '""')}"`
}

export function analyticsCsv(rows: AnalyticsExportRowDto[]): string {
	const header = [
		'occurred_at',
		'masked_ip',
		'country',
		'region',
		'city',
		'path',
		'referrer_host',
		'referrer_path',
		'device',
		'browser',
		'os',
		'traffic_type',
	]
	const lines = [header.map(csvCell).join(',')]
	for (const row of rows) {
		lines.push([
			row.occurredAt,
			row.maskedIp,
			row.country,
			row.region,
			row.city,
			row.path,
			row.referrerHost,
			row.referrerPath,
			row.device,
			row.browser,
			row.os,
			row.trafficType,
		].map(csvCell).join(','))
	}
	return `\uFEFF${lines.join('\n')}\n`
}

export class AnalyticsService {
	private readonly repository: AnalyticsRepository

	constructor(
		private readonly env: Env,
		private readonly now: () => Date = () => new Date(),
	) {
		this.repository = new AnalyticsRepository(env.DB)
	}

	isEnabled(): boolean {
		return !['0', 'false', 'off', 'disabled'].includes((this.env.ANALYTICS_ENABLED ?? 'true').toLowerCase())
	}

	async collect(payload: AnalyticsCollectionPayload): Promise<{ inserted: boolean, eventId?: number }> {
		if (!this.isEnabled())
			return { inserted: false }
		const secret = this.env.ANALYTICS_HASH_SECRET
		if (!secret)
			throw new Error('ANALYTICS_HASH_SECRET is required while analytics collection is enabled')
		const receivedAt = new Date(payload.receivedAt).toISOString()
		const occurredAt = normalizedOccurredAt(payload.occurredAt, receivedAt)
		const userAgent = nullableText(payload.userAgent, 768) ?? ''
		const classification = classifyUserAgent(userAgent, payload)
		const device = parseDevice(userAgent)
		const referrer = normalizeReferrer(payload.referrer, this.env.PUBLIC_ORIGIN)
		const human = !classification.isBot && !classification.isSuspectedBot
		const month = receivedAt.slice(0, 7)
		const fallbackVisitor = `${nullableText(payload.ipAddress, 64) ?? 'unknown'}|${userAgent}|${month}`
		const visitorSeed = payload.visitorToken ? `visitor:${payload.visitorToken}` : `fallback:${fallbackVisitor}`
		const bucket = Math.floor(Date.parse(receivedAt) / SESSION_WINDOW_MS)
		const sessionSeed = payload.sessionToken ? `session:${visitorSeed}|${payload.sessionToken}` : `fallback-session:${fallbackVisitor}|${bucket}`
		const [visitorHash, sessionHash] = human
			? await Promise.all([
					hmacAnalytics(visitorSeed, secret),
					hmacAnalytics(sessionSeed, secret),
				])
			: [null, null]
		const ipAddress = nullableText(payload.ipAddress, 64)
		const input: AnalyticsStoredEvent = {
			pageviewId: payload.pageviewId,
			visitorHash,
			sessionHash,
			occurredAt,
			receivedAt,
			source: payload.source,
			path: normalizeAnalyticsPath(payload.path, this.env.PUBLIC_ORIGIN),
			title: nullableText(payload.title, 240),
			referrerHost: referrer.host,
			referrerPath: referrer.path,
			responseStatus: nullableNumber(payload.responseStatus, 100, 599),
			ipAddress,
			ipExpiresAt: ipAddress
				? new Date(Date.parse(receivedAt) + analyticsRetention.ipDays * 86_400_000).toISOString()
				: null,
			countryCode: nullableText(payload.countryCode, 2)?.toUpperCase() ?? null,
			regionCode: nullableText(payload.regionCode, 32),
			regionName: nullableText(payload.regionName, 120),
			city: nullableText(payload.city, 120),
			postalCode: nullableText(payload.postalCode, 32),
			timezone: nullableText(payload.timezone, 80),
			latitude: roundedCoordinate(payload.latitude, -90, 90),
			longitude: roundedCoordinate(payload.longitude, -180, 180),
			asn: nullableNumber(payload.asn, 0, 4_294_967_295),
			asOrganization: nullableText(payload.asOrganization, 240),
			userAgent: userAgent || null,
			deviceType: device.deviceType,
			browserName: device.browserName,
			browserVersion: device.browserVersion,
			osName: device.osName,
			osVersion: device.osVersion,
			isBot: classification.isBot,
			botName: classification.botName,
			botCategory: classification.botCategory,
			isSuspectedBot: classification.isSuspectedBot,
			classificationSource: classification.classificationSource,
		}
		return this.repository.recordEvent(input)
	}

	summary(query: AnalyticsQuery): Promise<AnalyticsSummaryDto> {
		return this.repository.summary(query)
	}

	timeseries(query: AnalyticsQuery): Promise<AnalyticsTimeseriesPointDto[]> {
		return this.repository.timeseries(query)
	}

	realtime(): Promise<AnalyticsRealtimeDto> {
		return this.repository.realtime(new Date(this.now().getTime() - SESSION_WINDOW_MS).toISOString())
	}

	pages(query: AnalyticsQuery): Promise<AnalyticsPageRankDto[]> {
		return this.repository.topPages(query)
	}

	geo(query: AnalyticsQuery): Promise<AnalyticsGeoRankDto[]> {
		return this.repository.geo(query)
	}

	devices(query: AnalyticsQuery): Promise<AnalyticsDevicesDto> {
		return this.repository.devices(query)
	}

	async visitors(query: AnalyticsVisitorQuery): Promise<AnalyticsVisitorsDto> {
		const result = await this.repository.visitors(query)
		return {
			...result,
			items: result.items.map(item => ({
				eventId: item.eventId,
				visitorId: item.visitorHash.slice(0, 12),
				maskedIp: maskIp(item.ipAddress),
				firstSeenAt: item.firstSeenAt,
				lastSeenAt: item.lastSeenAt,
				lastPath: item.lastPath,
				totalPageviews: item.totalPageviews,
				totalSessions: item.totalSessions,
				country: item.countryCode,
				region: item.regionName,
				city: item.city,
				device: item.deviceType,
				browser: item.browserName,
				os: item.osName,
				trafficType: item.trafficType,
				isNewVisitor: item.firstSeenAt >= query.from && item.firstSeenAt < query.to,
			})),
		}
	}

	bots(query: AnalyticsQuery): Promise<AnalyticsBotRankDto[]> {
		return this.repository.bots(query)
	}

	findEventIp(id: number): Promise<string | null> {
		return this.repository.findEventIp(id, this.now().toISOString())
	}

	async export(query: AnalyticsExportQuery): Promise<AnalyticsExportRowDto[]> {
		const rows = await this.repository.exportEvents(query)
		return rows.map(row => ({
			occurredAt: row.occurredAt,
			maskedIp: maskIp(row.ipAddress),
			country: row.countryCode,
			region: row.regionName,
			city: row.city,
			path: row.path,
			referrerHost: row.referrerHost,
			referrerPath: row.referrerPath,
			device: row.deviceType,
			browser: row.browserName,
			os: row.osName,
			trafficType: row.trafficType,
		}))
	}

	async status(): Promise<AnalyticsCollectorStatusDto> {
		const [event, aggregate] = await Promise.all([
			this.env.DB.prepare('SELECT MAX(received_at) AS value FROM analytics_events')
				.first<{ value: string | null }>(),
			this.env.DB.prepare('SELECT MAX(updated_at) AS value FROM analytics_daily_site')
				.first<{ value: string | null }>(),
		])
		return {
			enabled: this.isEnabled(),
			lastEventAt: event?.value ?? null,
			lastMaintenanceAt: aggregate?.value ?? null,
			rawIpRetentionDays: analyticsRetention.ipDays,
			eventRetentionDays: analyticsRetention.eventDays,
		}
	}

	maintain(): Promise<AnalyticsMaintenanceResult> {
		return this.repository.maintain(this.now())
	}
}
