import type {
	AnalyticsBotRankDto,
	AnalyticsDevicesDto,
	AnalyticsExportQuery,
	AnalyticsGeoRankDto,
	AnalyticsPageRankDto,
	AnalyticsQuery,
	AnalyticsRealtimeDto,
	AnalyticsSummaryDto,
	AnalyticsTimeseriesPointDto,
	AnalyticsTrafficType,
	AnalyticsVisitorQuery,
} from '../../../../shared/admin/analytics'

export interface AnalyticsStoredEvent {
	pageviewId: string
	visitorHash: string | null
	sessionHash: string | null
	occurredAt: string
	receivedAt: string
	source: 'edge' | 'spa'
	path: string
	title: string | null
	referrerHost: string | null
	referrerPath: string | null
	responseStatus: number | null
	ipAddress: string | null
	ipExpiresAt: string | null
	countryCode: string | null
	regionCode: string | null
	regionName: string | null
	city: string | null
	postalCode: string | null
	timezone: string | null
	latitude: number | null
	longitude: number | null
	asn: number | null
	asOrganization: string | null
	userAgent: string | null
	deviceType: string | null
	browserName: string | null
	browserVersion: string | null
	osName: string | null
	osVersion: string | null
	isBot: boolean
	botName: string | null
	botCategory: string | null
	isSuspectedBot: boolean
	classificationSource: string
}

export interface AnalyticsVisitorRecord {
	eventId: number
	visitorHash: string
	ipAddress: string | null
	firstSeenAt: string
	lastSeenAt: string
	lastPath: string
	totalPageviews: number
	totalSessions: number
	countryCode: string | null
	regionName: string | null
	city: string | null
	deviceType: string | null
	browserName: string | null
	osName: string | null
	trafficType: AnalyticsTrafficType
}

export interface AnalyticsVisitorPage {
	items: AnalyticsVisitorRecord[]
	total: number
	page: number
	pageSize: number
}

export interface AnalyticsExportRecord {
	eventId: number
	occurredAt: string
	ipAddress: string | null
	countryCode: string | null
	regionName: string | null
	city: string | null
	path: string
	referrerHost: string | null
	referrerPath: string | null
	deviceType: string | null
	browserName: string | null
	osName: string | null
	trafficType: AnalyticsTrafficType
}

export interface AnalyticsMaintenanceResult {
	rebuiltDates: string[]
	clearedIps: number
	deletedEvents: number
	deletedSessions: number
}

interface AnalyticsTotals {
	pageviews: number
	visitors: number
	sessions: number
	newVisitors: number
	averageDepth: number
}

interface EventWhere {
	sql: string
	values: unknown[]
}

interface DatabaseVisitorRow {
	event_id: number
	visitor_hash: string
	ip_address: string | null
	first_seen_at: string
	last_seen_at: string
	path: string
	total_pageviews: number
	total_sessions: number
	country_code: string | null
	region_name: string | null
	city: string | null
	device_type: string | null
	browser_name: string | null
	os_name: string | null
}

interface DatabaseAutomatedVisitorRow {
	event_id: number
	visitor_label: string
	ip_address: string | null
	first_seen_at: string
	last_seen_at: string
	path: string
	total_pageviews: number
	country_code: string | null
	region_name: string | null
	city: string | null
	device_type: string | null
	browser_name: string | null
	os_name: string | null
	traffic_type: 'bot' | 'suspected'
}

interface DatabaseExportRow {
	id: number
	occurred_at: string
	ip_address: string | null
	country_code: string | null
	region_name: string | null
	city: string | null
	path: string
	referrer_host: string | null
	referrer_path: string | null
	device_type: string | null
	browser_name: string | null
	os_name: string | null
	is_bot: number
	is_suspected_bot: number
}

const DAY_MS = 86_400_000
const EVENT_RETENTION_DAYS = 180
const IP_RETENTION_DAYS = 30

function assertRange(query: Pick<AnalyticsQuery, 'from' | 'to'>): void {
	const from = Date.parse(query.from)
	const to = Date.parse(query.to)
	if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to)
		throw new RangeError('Analytics range must have a valid from value before to')
}

function asCount(value: number | string | null | undefined): number {
	const parsed = Number(value ?? 0)
	return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number, digits = 2): number {
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}

function changePercent(value: number, previousValue: number): number | null {
	if (previousValue === 0)
		return value === 0 ? 0 : null
	return round(((value - previousValue) / previousValue) * 100)
}

function metric(value: number, previousValue: number) {
	return { value, previousValue, changePercent: changePercent(value, previousValue) }
}

function previousQuery(query: AnalyticsQuery): AnalyticsQuery {
	assertRange(query)
	const from = Date.parse(query.from)
	const to = Date.parse(query.to)
	const duration = to - from
	return {
		...query,
		from: new Date(from - duration).toISOString(),
		to: new Date(from).toISOString(),
	}
}

function timezoneModifier(timezone: string): string {
	return timezone === 'UTC' ? '+00:00' : timezone
}

function trafficClause(trafficType: AnalyticsTrafficType | undefined, prefix: string): string {
	switch (trafficType ?? 'human') {
		case 'bot':
			return `${prefix}is_bot = 1`
		case 'suspected':
			return `${prefix}is_bot = 0 AND ${prefix}is_suspected_bot = 1`
		default:
			return `${prefix}is_bot = 0 AND ${prefix}is_suspected_bot = 0`
	}
}

function eventWhere(query: AnalyticsQuery, alias = ''): EventWhere {
	assertRange(query)
	const prefix = alias ? `${alias}.` : ''
	const clauses = [
		`${prefix}occurred_at >= ?`,
		`${prefix}occurred_at < ?`,
		trafficClause(query.trafficType, prefix),
	]
	const values: unknown[] = [query.from, query.to]
	const filters: Array<[unknown, string]> = [
		[query.path, `${prefix}path = ?`],
		[query.country, `${prefix}country_code = ?`],
		[query.region, `${prefix}region_name = ?`],
		[query.city, `${prefix}city = ?`],
		[query.device, `${prefix}device_type = ?`],
		[query.browser, `${prefix}browser_name = ?`],
		[query.os, `${prefix}os_name = ?`],
		[query.responseStatus, `${prefix}response_status = ?`],
	]
	for (const [value, clause] of filters) {
		if (value !== undefined) {
			clauses.push(clause)
			values.push(value)
		}
	}
	return { sql: clauses.join(' AND '), values }
}

function withoutTrafficType(query: AnalyticsQuery): AnalyticsQuery {
	const { trafficType: _trafficType, ...rest } = query
	return rest
}

function utcDate(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function dateRange(date: string): { from: string, to: string } {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(date))
		throw new RangeError('Analytics aggregation date must use YYYY-MM-DD')
	const from = new Date(`${date}T00:00:00.000Z`)
	if (Number.isNaN(from.getTime()) || utcDate(from) !== date)
		throw new RangeError('Analytics aggregation date is invalid')
	return { from: from.toISOString(), to: new Date(from.getTime() + DAY_MS).toISOString() }
}

function trafficType(row: Pick<DatabaseExportRow, 'is_bot' | 'is_suspected_bot'>): AnalyticsTrafficType {
	if (row.is_bot === 1)
		return 'bot'
	if (row.is_suspected_bot === 1)
		return 'suspected'
	return 'human'
}

function changes(result: D1Result<unknown>): number {
	return asCount(result.meta.changes)
}

export class AnalyticsRepository {
	constructor(private readonly db: D1Database) {}

	async recordEvent(input: AnalyticsStoredEvent): Promise<{ inserted: boolean, eventId?: number }> {
		const human = !input.isBot && !input.isSuspectedBot
		if (human && (!input.visitorHash || !input.sessionHash))
			throw new TypeError('Human analytics events require visitor and session hashes')

		const inserted = await this.db.prepare(`
			INSERT OR IGNORE INTO analytics_events (
				pageview_id, visitor_hash, session_hash, occurred_at, received_at, source,
				path, title, referrer_host, referrer_path, response_status,
				ip_address, ip_expires_at, country_code, region_code, region_name, city,
				postal_code, timezone, latitude, longitude, asn, as_organization,
				user_agent, device_type, browser_name, browser_version, os_name, os_version,
				is_bot, bot_name, bot_category, is_suspected_bot, classification_source
			) VALUES (
				?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?
			)
			RETURNING id
		`).bind(
			input.pageviewId,
			input.visitorHash,
			input.sessionHash,
			input.occurredAt,
			input.receivedAt,
			input.source,
			input.path,
			input.title,
			input.referrerHost,
			input.referrerPath,
			input.responseStatus,
			input.ipAddress,
			input.ipExpiresAt,
			input.countryCode,
			input.regionCode,
			input.regionName,
			input.city,
			input.postalCode,
			input.timezone,
			input.latitude,
			input.longitude,
			input.asn,
			input.asOrganization,
			input.userAgent,
			input.deviceType,
			input.browserName,
			input.browserVersion,
			input.osName,
			input.osVersion,
			input.isBot ? 1 : 0,
			input.botName,
			input.botCategory,
			input.isSuspectedBot ? 1 : 0,
			input.classificationSource,
		).first<{ id: number }>()

		if (!inserted)
			return { inserted: false }
		const eventId = Number(inserted.id)
		return Number.isSafeInteger(eventId) && eventId > 0
			? { inserted: true, eventId }
			: { inserted: true }
	}

	async summary(query: AnalyticsQuery): Promise<AnalyticsSummaryDto> {
		const [current, previous] = await Promise.all([
			this.summaryTotals(query),
			this.summaryTotals(previousQuery(query)),
		])
		return {
			pageviews: metric(current.pageviews, previous.pageviews),
			visitors: metric(current.visitors, previous.visitors),
			sessions: metric(current.sessions, previous.sessions),
			newVisitors: metric(current.newVisitors, previous.newVisitors),
			averageDepth: metric(current.averageDepth, previous.averageDepth),
		}
	}

	async timeseries(query: AnalyticsQuery): Promise<AnalyticsTimeseriesPointDto[]> {
		const where = eventWhere(query)
		const duration = Date.parse(query.to) - Date.parse(query.from)
		const granularity = query.granularity ?? (duration <= 48 * 60 * 60 * 1_000 ? 'hour' : 'day')
		const format = granularity === 'hour' ? '%Y-%m-%dT%H:00:00' : '%Y-%m-%d'
		const rows = await this.db.prepare(`
			SELECT
				strftime('${format}', occurred_at, ?) AS bucket,
				COUNT(*) AS pageviews,
				COUNT(DISTINCT visitor_hash) AS visitors,
				COUNT(DISTINCT session_hash) AS sessions
			FROM analytics_events
			WHERE ${where.sql}
			GROUP BY bucket
			ORDER BY bucket
		`).bind(timezoneModifier(query.timezone), ...where.values).all<{
			bucket: string
			pageviews: number
			visitors: number
			sessions: number
		}>()
		return rows.results.map(row => ({
			bucket: row.bucket,
			pageviews: asCount(row.pageviews),
			visitors: asCount(row.visitors),
			sessions: asCount(row.sessions),
		}))
	}

	async realtime(since: string): Promise<AnalyticsRealtimeDto> {
		const base = `occurred_at >= ? AND is_bot = 0 AND is_suspected_bot = 0`
		const [totals, pages, cities] = await Promise.all([
			this.db.prepare(`
				SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor_hash) AS active_visitors
				FROM analytics_events WHERE ${base}
			`).bind(since).first<{ pageviews: number, active_visitors: number }>(),
			this.db.prepare(`
				SELECT path AS label, COUNT(*) AS count
				FROM analytics_events WHERE ${base}
				GROUP BY path ORDER BY count DESC, path LIMIT 10
			`).bind(since).all<{ label: string, count: number }>(),
			this.db.prepare(`
				SELECT COALESCE(NULLIF(city, ''), '未知城市') AS label, COUNT(*) AS count
				FROM analytics_events WHERE ${base}
				GROUP BY label ORDER BY count DESC, label LIMIT 10
			`).bind(since).all<{ label: string, count: number }>(),
		])
		return {
			activeVisitors: asCount(totals?.active_visitors),
			pageviews: asCount(totals?.pageviews),
			pages: pages.results.map(row => ({ label: row.label, count: asCount(row.count) })),
			cities: cities.results.map(row => ({ label: row.label, count: asCount(row.count) })),
		}
	}

	async topPages(query: AnalyticsQuery, limit = 20): Promise<AnalyticsPageRankDto[]> {
		const where = eventWhere(query)
		const rows = await this.db.prepare(`
			SELECT
				path,
				MAX(NULLIF(title, '')) AS title,
				COUNT(*) AS pageviews,
				COUNT(DISTINCT visitor_hash) AS visitors
			FROM analytics_events
			WHERE ${where.sql}
			GROUP BY path
			ORDER BY pageviews DESC, path
			LIMIT ?
		`).bind(...where.values, limit).all<{
			path: string
			title: string | null
			pageviews: number
			visitors: number
		}>()
		return rows.results.map(row => ({
			path: row.path,
			title: row.title,
			pageviews: asCount(row.pageviews),
			visitors: asCount(row.visitors),
		}))
	}

	async geo(query: AnalyticsQuery, limit = 50): Promise<AnalyticsGeoRankDto[]> {
		const where = eventWhere(query)
		const rows = await this.db.prepare(`
			SELECT
				country_code,
				region_name,
				city,
				COUNT(*) AS pageviews,
				COUNT(DISTINCT visitor_hash) AS visitors
			FROM analytics_events
			WHERE ${where.sql}
			GROUP BY country_code, region_name, city
			ORDER BY pageviews DESC, country_code, region_name, city
			LIMIT ?
		`).bind(...where.values, limit).all<{
			country_code: string | null
			region_name: string | null
			city: string | null
			pageviews: number
			visitors: number
		}>()
		return rows.results.map(row => ({
			country: row.country_code,
			region: row.region_name,
			city: row.city,
			pageviews: asCount(row.pageviews),
			visitors: asCount(row.visitors),
		}))
	}

	async devices(query: AnalyticsQuery, limit = 12): Promise<AnalyticsDevicesDto> {
		const where = eventWhere(query)
		const breakdown = async (column: 'device_type' | 'browser_name' | 'os_name') => {
			const rows = await this.db.prepare(`
				SELECT COALESCE(NULLIF(${column}, ''), '未知') AS label,
					COUNT(*) AS pageviews,
					COUNT(DISTINCT visitor_hash) AS visitors
				FROM analytics_events
				WHERE ${where.sql}
				GROUP BY label
				ORDER BY pageviews DESC, label
				LIMIT ?
			`).bind(...where.values, limit).all<{
				label: string
				pageviews: number
				visitors: number
			}>()
			return rows.results.map(row => ({
				label: row.label,
				pageviews: asCount(row.pageviews),
				visitors: asCount(row.visitors),
			}))
		}
		const [devices, browsers, operatingSystems] = await Promise.all([
			breakdown('device_type'),
			breakdown('browser_name'),
			breakdown('os_name'),
		])
		return { devices, browsers, operatingSystems }
	}

	async visitors(query: AnalyticsVisitorQuery): Promise<AnalyticsVisitorPage> {
		if (query.trafficType === 'bot' || query.trafficType === 'suspected')
			return this.automatedVisitors(query)
		const where = eventWhere(query, 'e')
		const total = await this.db.prepare(`
			SELECT COUNT(DISTINCT e.visitor_hash) AS count
			FROM analytics_events e
			WHERE ${where.sql} AND e.visitor_hash IS NOT NULL
		`).bind(...where.values).first<{ count: number }>()
		const rows = await this.db.prepare(`
			WITH filtered AS (
				SELECT e.*
				FROM analytics_events e
				WHERE ${where.sql} AND e.visitor_hash IS NOT NULL
			), ranked AS (
				SELECT filtered.*,
					ROW_NUMBER() OVER (
						PARTITION BY visitor_hash
						ORDER BY occurred_at DESC, id DESC
					) AS visitor_rank
				FROM filtered
			)
			SELECT
				ranked.id AS event_id,
				ranked.visitor_hash,
				ranked.ip_address,
				visitors.first_seen_at,
				ranked.occurred_at AS last_seen_at,
				ranked.path,
				visitors.total_pageviews,
				visitors.total_sessions,
				ranked.country_code,
				ranked.region_name,
				ranked.city,
				ranked.device_type,
				ranked.browser_name,
				ranked.os_name
			FROM ranked
			JOIN analytics_visitors visitors ON visitors.visitor_hash = ranked.visitor_hash
			WHERE ranked.visitor_rank = 1
			ORDER BY ranked.occurred_at DESC, ranked.id DESC
			LIMIT ? OFFSET ?
		`).bind(
			...where.values,
			query.pageSize,
			(query.page - 1) * query.pageSize,
		).all<DatabaseVisitorRow>()
		return {
			items: rows.results.map(row => ({
				eventId: row.event_id,
				visitorHash: row.visitor_hash,
				ipAddress: row.ip_address,
				firstSeenAt: row.first_seen_at,
				lastSeenAt: row.last_seen_at,
				lastPath: row.path,
				totalPageviews: asCount(row.total_pageviews),
				totalSessions: asCount(row.total_sessions),
				countryCode: row.country_code,
				regionName: row.region_name,
				city: row.city,
				deviceType: row.device_type,
				browserName: row.browser_name,
				osName: row.os_name,
				trafficType: 'human',
			})),
			total: asCount(total?.count),
			page: query.page,
			pageSize: query.pageSize,
		}
	}

	async bots(query: AnalyticsQuery, limit = 50): Promise<AnalyticsBotRankDto[]> {
		const baseQuery = withoutTrafficType(query)
		const where = eventWhere({ ...baseQuery, trafficType: 'human' })
		const humanClause = trafficClause('human', '')
		const nonTrafficWhere = where.sql.replace(humanClause, '(is_bot = 1 OR is_suspected_bot = 1)')
		const rows = await this.db.prepare(`
			SELECT
				CASE
					WHEN is_bot = 1 THEN COALESCE(NULLIF(bot_name, ''), '未知爬虫')
					ELSE '可疑自动流量'
				END AS name,
				bot_category,
				classification_source,
				CASE WHEN is_bot = 1 THEN 'bot' ELSE 'suspected' END AS traffic_type,
				COUNT(*) AS pageviews,
				MAX(occurred_at) AS last_seen_at
			FROM analytics_events
			WHERE ${nonTrafficWhere}
			GROUP BY name, bot_category, classification_source, traffic_type
			ORDER BY pageviews DESC, name
			LIMIT ?
		`).bind(...where.values, limit).all<{
			name: string
			bot_category: string | null
			classification_source: string | null
			traffic_type: 'bot' | 'suspected'
			pageviews: number
			last_seen_at: string
		}>()
		return rows.results.map(row => ({
			name: row.name,
			category: row.bot_category,
			classificationSource: row.classification_source,
			pageviews: asCount(row.pageviews),
			lastSeenAt: row.last_seen_at,
			trafficType: row.traffic_type,
		}))
	}

	async findEventIp(id: number, now: string): Promise<string | null> {
		const row = await this.db.prepare(`
			SELECT ip_address
			FROM analytics_events
			WHERE id = ?
				AND ip_address IS NOT NULL
				AND ip_expires_at IS NOT NULL
				AND ip_expires_at > ?
		`).bind(id, now).first<{ ip_address: string }>()
		return row?.ip_address ?? null
	}

	async exportEvents(query: AnalyticsExportQuery): Promise<AnalyticsExportRecord[]> {
		const where = eventWhere(query)
		const rows = await this.db.prepare(`
			SELECT
				id, occurred_at, ip_address, country_code, region_name, city, path,
				referrer_host, referrer_path, device_type, browser_name, os_name,
				is_bot, is_suspected_bot
			FROM analytics_events
			WHERE ${where.sql}
			ORDER BY occurred_at DESC, id DESC
			LIMIT ?
		`).bind(...where.values, query.limit).all<DatabaseExportRow>()
		return rows.results.map(row => ({
			eventId: row.id,
			occurredAt: row.occurred_at,
			ipAddress: row.ip_address,
			countryCode: row.country_code,
			regionName: row.region_name,
			city: row.city,
			path: row.path,
			referrerHost: row.referrer_host,
			referrerPath: row.referrer_path,
			deviceType: row.device_type,
			browserName: row.browser_name,
			osName: row.os_name,
			trafficType: trafficType(row),
		}))
	}

	async rebuildDaily(date: string): Promise<void> {
		const range = dateRange(date)
		const updatedAt = new Date().toISOString()
		await this.db.batch([
			this.db.prepare('DELETE FROM analytics_daily_site WHERE date = ?').bind(date),
			this.db.prepare('DELETE FROM analytics_daily_path WHERE date = ?').bind(date),
			this.db.prepare('DELETE FROM analytics_daily_geo WHERE date = ?').bind(date),
			this.db.prepare('DELETE FROM analytics_daily_device WHERE date = ?').bind(date),
			this.db.prepare('DELETE FROM analytics_daily_referrer WHERE date = ?').bind(date),
			this.db.prepare('DELETE FROM analytics_daily_bot WHERE date = ?').bind(date),
			this.db.prepare(`
				INSERT INTO analytics_daily_site (
					date, pageviews, visitors, sessions, new_visitors,
					bot_pageviews, suspected_pageviews, updated_at
				)
				SELECT
					?,
					COUNT(CASE WHEN is_bot = 0 AND is_suspected_bot = 0 THEN 1 END),
					COUNT(DISTINCT CASE WHEN is_bot = 0 AND is_suspected_bot = 0 THEN visitor_hash END),
					COUNT(DISTINCT CASE WHEN is_bot = 0 AND is_suspected_bot = 0 THEN session_hash END),
					(
						SELECT COUNT(*) FROM analytics_visitors
						WHERE first_seen_at >= ? AND first_seen_at < ?
					),
					COUNT(CASE WHEN is_bot = 1 THEN 1 END),
					COUNT(CASE WHEN is_bot = 0 AND is_suspected_bot = 1 THEN 1 END),
					?
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
			`).bind(
				date,
				range.from,
				range.to,
				updatedAt,
				range.from,
				range.to,
			),
			this.db.prepare(`
				INSERT INTO analytics_daily_path (
					date, path, title, pageviews, visitors, updated_at
				)
				SELECT ?, path, COALESCE(MAX(NULLIF(title, '')), ''), COUNT(*),
					COUNT(DISTINCT visitor_hash), ?
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND is_bot = 0 AND is_suspected_bot = 0
				GROUP BY path
			`).bind(date, updatedAt, range.from, range.to),
			this.db.prepare(`
				INSERT INTO analytics_daily_geo (
					date, country_code, region_name, city, pageviews, visitors, updated_at
				)
				SELECT ?, COALESCE(country_code, ''), COALESCE(region_name, ''),
					COALESCE(city, ''), COUNT(*), COUNT(DISTINCT visitor_hash), ?
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND is_bot = 0 AND is_suspected_bot = 0
				GROUP BY COALESCE(country_code, ''), COALESCE(region_name, ''), COALESCE(city, '')
			`).bind(date, updatedAt, range.from, range.to),
			this.db.prepare(`
				INSERT INTO analytics_daily_device (
					date, device_type, browser_name, os_name, pageviews, visitors, updated_at
				)
				SELECT ?, COALESCE(device_type, ''), COALESCE(browser_name, ''),
					COALESCE(os_name, ''), COUNT(*), COUNT(DISTINCT visitor_hash), ?
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND is_bot = 0 AND is_suspected_bot = 0
				GROUP BY COALESCE(device_type, ''), COALESCE(browser_name, ''), COALESCE(os_name, '')
			`).bind(date, updatedAt, range.from, range.to),
			this.db.prepare(`
				INSERT INTO analytics_daily_referrer (
					date, referrer_host, pageviews, visitors, updated_at
				)
				SELECT ?, referrer_host, COUNT(*), COUNT(DISTINCT visitor_hash), ?
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND is_bot = 0 AND is_suspected_bot = 0
					AND referrer_host IS NOT NULL AND referrer_host <> ''
				GROUP BY referrer_host
			`).bind(date, updatedAt, range.from, range.to),
			this.db.prepare(`
				INSERT INTO analytics_daily_bot (
					date, bot_name, bot_category, classification_source,
					traffic_type, pageviews, updated_at
				)
				SELECT
					?,
					CASE WHEN is_bot = 1
						THEN COALESCE(bot_name, '') ELSE 'suspected' END,
					COALESCE(bot_category, ''),
					COALESCE(classification_source, ''),
					CASE WHEN is_bot = 1 THEN 'bot' ELSE 'suspected' END,
					COUNT(*),
					?
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND (is_bot = 1 OR is_suspected_bot = 1)
				GROUP BY
					CASE WHEN is_bot = 1 THEN COALESCE(bot_name, '') ELSE 'suspected' END,
					COALESCE(bot_category, ''),
					COALESCE(classification_source, ''),
					CASE WHEN is_bot = 1 THEN 'bot' ELSE 'suspected' END
			`).bind(date, updatedAt, range.from, range.to),
		])
	}

	async maintain(now: Date): Promise<AnalyticsMaintenanceResult> {
		if (Number.isNaN(now.getTime()))
			throw new RangeError('Analytics maintenance requires a valid date')
		const rebuiltDates = [2, 1, 0].map(days => utcDate(new Date(now.getTime() - days * DAY_MS)))
		for (const date of rebuiltDates)
			await this.rebuildDaily(date)
		const at = now.toISOString()
		const eventCutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS).toISOString()
		const sessionCutoff = eventCutoff
		const [cleared, deletedEvents, deletedSessions] = await this.db.batch([
			this.db.prepare(`
				UPDATE analytics_events
				SET ip_address = NULL
				WHERE ip_address IS NOT NULL
					AND ip_expires_at IS NOT NULL
					AND ip_expires_at <= ?
			`).bind(at),
			this.db.prepare('DELETE FROM analytics_events WHERE received_at < ?').bind(eventCutoff),
			this.db.prepare('DELETE FROM analytics_sessions WHERE last_seen_at < ?').bind(sessionCutoff),
		])
		return {
			rebuiltDates,
			clearedIps: changes(cleared),
			deletedEvents: changes(deletedEvents),
			deletedSessions: changes(deletedSessions),
		}
	}

	private async automatedVisitors(query: AnalyticsVisitorQuery): Promise<AnalyticsVisitorPage> {
		const where = eventWhere(query, 'e')
		const total = await this.db.prepare(`
			SELECT COUNT(*) AS count FROM analytics_events e WHERE ${where.sql}
		`).bind(...where.values).first<{ count: number }>()
		const rows = await this.db.prepare(`
			SELECT
				e.id AS event_id,
				CASE
					WHEN e.is_bot = 1 THEN COALESCE(NULLIF(e.bot_name, ''), '未知爬虫')
					ELSE '可疑自动流量'
				END AS visitor_label,
				e.ip_address,
				MIN(e.occurred_at) OVER (
					PARTITION BY CASE WHEN e.is_bot = 1
						THEN COALESCE(NULLIF(e.bot_name, ''), e.classification_source)
						ELSE e.classification_source END
				) AS first_seen_at,
				MAX(e.occurred_at) OVER (
					PARTITION BY CASE WHEN e.is_bot = 1
						THEN COALESCE(NULLIF(e.bot_name, ''), e.classification_source)
						ELSE e.classification_source END
				) AS last_seen_at,
				e.path,
				COUNT(*) OVER (
					PARTITION BY CASE WHEN e.is_bot = 1
						THEN COALESCE(NULLIF(e.bot_name, ''), e.classification_source)
						ELSE e.classification_source END
				) AS total_pageviews,
				e.country_code,
				e.region_name,
				e.city,
				e.device_type,
				e.browser_name,
				e.os_name,
				CASE WHEN e.is_bot = 1 THEN 'bot' ELSE 'suspected' END AS traffic_type
			FROM analytics_events e
			WHERE ${where.sql}
			ORDER BY e.occurred_at DESC, e.id DESC
			LIMIT ? OFFSET ?
		`).bind(
			...where.values,
			query.pageSize,
			(query.page - 1) * query.pageSize,
		).all<DatabaseAutomatedVisitorRow>()
		return {
			items: rows.results.map(row => ({
				eventId: row.event_id,
				visitorHash: `${row.traffic_type}:${row.visitor_label}:${row.event_id}`,
				ipAddress: row.ip_address,
				firstSeenAt: row.first_seen_at,
				lastSeenAt: row.last_seen_at,
				lastPath: row.path,
				totalPageviews: asCount(row.total_pageviews),
				totalSessions: 0,
				countryCode: row.country_code,
				regionName: row.region_name,
				city: row.city,
				deviceType: row.device_type,
				browserName: row.browser_name,
				osName: row.os_name,
				trafficType: row.traffic_type,
			})),
			total: asCount(total?.count),
			page: query.page,
			pageSize: query.pageSize,
		}
	}

	private async summaryTotals(query: AnalyticsQuery): Promise<AnalyticsTotals> {
		const where = eventWhere(query, 'events')
		const totals = await this.db.prepare(`
			SELECT
				COUNT(*) AS pageviews,
				COUNT(DISTINCT events.visitor_hash) AS visitors,
				COUNT(DISTINCT events.session_hash) AS sessions
			FROM analytics_events events
			WHERE ${where.sql}
		`).bind(...where.values).first<{
			pageviews: number
			visitors: number
			sessions: number
		}>()
		const newVisitors = await this.db.prepare(`
			SELECT COUNT(DISTINCT events.visitor_hash) AS count
			FROM analytics_events events
			JOIN analytics_visitors visitors ON visitors.visitor_hash = events.visitor_hash
			WHERE ${where.sql}
				AND visitors.first_seen_at >= ?
				AND visitors.first_seen_at < ?
		`).bind(...where.values, query.from, query.to).first<{ count: number }>()
		const pageviews = asCount(totals?.pageviews)
		const sessions = asCount(totals?.sessions)
		return {
			pageviews,
			visitors: asCount(totals?.visitors),
			sessions,
			newVisitors: asCount(newVisitors?.count),
			averageDepth: sessions === 0 ? 0 : round(pageviews / sessions),
		}
	}
}

export const analyticsRetention = {
	ipDays: IP_RETENTION_DAYS,
	eventDays: EVENT_RETENTION_DAYS,
} as const
