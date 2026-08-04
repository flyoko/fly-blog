import { z } from 'zod'

export const analyticsTrafficTypeSchema = z.enum(['human', 'bot', 'suspected'])
export const analyticsGranularitySchema = z.enum(['hour', 'day'])
export const analyticsTimezoneSchema = z.union([
	z.literal('UTC'),
	z.string().regex(/^[+-](?:0\d|1[0-4]):[0-5]\d$/u),
])

export const analyticsRangeSchema = z.object({
	from: z.string().datetime(),
	to: z.string().datetime(),
	timezone: analyticsTimezoneSchema.default('UTC'),
})

export const analyticsFilterSchema = z.object({
	path: z.string().trim().min(1).max(512).optional(),
	country: z.string().trim().length(2).optional(),
	region: z.string().trim().min(1).max(120).optional(),
	city: z.string().trim().min(1).max(120).optional(),
	device: z.string().trim().min(1).max(80).optional(),
	browser: z.string().trim().min(1).max(80).optional(),
	os: z.string().trim().min(1).max(80).optional(),
	responseStatus: z.coerce.number().int().min(100).max(599).optional(),
	trafficType: analyticsTrafficTypeSchema.optional(),
})

export const analyticsQuerySchema = analyticsRangeSchema
	.merge(analyticsFilterSchema)
	.extend({ granularity: analyticsGranularitySchema.optional() })

export const analyticsPaginationSchema = z.object({
	page: z.coerce.number().int().min(1).max(10_000).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const analyticsVisitorQuerySchema = analyticsQuerySchema
	.merge(analyticsPaginationSchema)

export const analyticsExportQuerySchema = analyticsQuerySchema.extend({
	limit: z.coerce.number().int().min(1).max(5_000).default(1_000),
})

export const analyticsClientPageviewSchema = z.object({
	pageviewId: z.string().uuid(),
	visitorToken: z.string().trim().min(16).max(128).nullable().optional(),
	sessionToken: z.string().trim().min(16).max(128).nullable().optional(),
	path: z.string().trim().min(1).max(2_048),
	title: z.string().trim().max(240).nullable().optional(),
	referrer: z.string().trim().max(2_048).nullable().optional(),
	occurredAt: z.string().datetime(),
}).strict()

export type AnalyticsTrafficType = z.infer<typeof analyticsTrafficTypeSchema>
export type AnalyticsGranularity = z.infer<typeof analyticsGranularitySchema>
export type AnalyticsTimezone = z.infer<typeof analyticsTimezoneSchema>
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>
export type AnalyticsPagination = z.infer<typeof analyticsPaginationSchema>
export type AnalyticsVisitorQuery = z.infer<typeof analyticsVisitorQuerySchema>
export type AnalyticsExportQuery = z.infer<typeof analyticsExportQuerySchema>
export type AnalyticsClientPageview = z.infer<typeof analyticsClientPageviewSchema>

export interface AnalyticsTrustedContext {
	source: 'edge' | 'spa'
	receivedAt: string
	responseStatus?: number | null
	ipAddress?: string | null
	countryCode?: string | null
	regionCode?: string | null
	regionName?: string | null
	city?: string | null
	postalCode?: string | null
	timezone?: string | null
	latitude?: number | null
	longitude?: number | null
	asn?: number | null
	asOrganization?: string | null
	userAgent?: string | null
	verifiedBot?: boolean
	botScore?: number | null
	botName?: string | null
	botCategory?: string | null
	classificationSource?: string | null
}

export interface AnalyticsCollectionPayload extends AnalyticsClientPageview, AnalyticsTrustedContext {}

export interface AnalyticsMetricDto {
	value: number
	previousValue: number
	changePercent: number | null
}

export interface AnalyticsSummaryDto {
	pageviews: AnalyticsMetricDto
	visitors: AnalyticsMetricDto
	sessions: AnalyticsMetricDto
	newVisitors: AnalyticsMetricDto
	averageDepth: AnalyticsMetricDto
}

export interface AnalyticsTimeseriesPointDto {
	bucket: string
	pageviews: number
	visitors: number
	sessions: number
}

export interface AnalyticsRankDto {
	label: string
	count: number
}

export interface AnalyticsRealtimeDto {
	activeVisitors: number
	pageviews: number
	pages: AnalyticsRankDto[]
	cities: AnalyticsRankDto[]
}

export interface AnalyticsPageRankDto {
	path: string
	title: string | null
	pageviews: number
	visitors: number
}

export interface AnalyticsGeoRankDto {
	country: string | null
	region: string | null
	city: string | null
	pageviews: number
	visitors: number
}

export interface AnalyticsBreakdownItemDto {
	label: string
	pageviews: number
	visitors: number
}

export interface AnalyticsDevicesDto {
	devices: AnalyticsBreakdownItemDto[]
	browsers: AnalyticsBreakdownItemDto[]
	operatingSystems: AnalyticsBreakdownItemDto[]
}

export interface AnalyticsVisitorRowDto {
	eventId: number
	visitorId: string
	maskedIp: string | null
	firstSeenAt: string
	lastSeenAt: string
	lastPath: string
	totalPageviews: number
	totalSessions: number
	country: string | null
	region: string | null
	city: string | null
	device: string | null
	browser: string | null
	os: string | null
	trafficType: AnalyticsTrafficType
	isNewVisitor: boolean
}

export interface AnalyticsVisitorsDto {
	items: AnalyticsVisitorRowDto[]
	total: number
	page: number
	pageSize: number
}

export interface AnalyticsBotRankDto {
	name: string
	category: string | null
	classificationSource: string | null
	pageviews: number
	lastSeenAt: string
	trafficType: 'bot' | 'suspected'
}

export interface AnalyticsExportRowDto {
	occurredAt: string
	maskedIp: string | null
	country: string | null
	region: string | null
	city: string | null
	path: string
	referrerHost: string | null
	referrerPath: string | null
	device: string | null
	browser: string | null
	os: string | null
	trafficType: AnalyticsTrafficType
}

export interface AnalyticsCollectorStatusDto {
	enabled: boolean
	lastEventAt: string | null
	lastMaintenanceAt: string | null
	rawIpRetentionDays: number
	eventRetentionDays: number
}
