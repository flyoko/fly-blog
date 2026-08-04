export const visitorCookieName = 'fly_analytics_visitor'
export const sessionCookieName = 'fly_analytics_session'
export const analyticsBeaconPath = '/api/analytics/pageview'

const visitorMaxAgeSeconds = 365 * 24 * 60 * 60
const sessionMaxAgeSeconds = 30 * 60
const internalCollectorUrl = 'https://fly-living-api/internal/analytics/pageview'
const maxBeaconBytes = 16 * 1_024
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const tokenPattern = /^[\w.~-]{16,128}$/u
const staticExtensionPattern = /\.(?:avif|bmp|css|csv|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|txt|wasm|webm|webmanifest|webp|woff2?|xml)$/iu

const excludedExactPaths = new Set([
	'/favicon.ico',
	'/robots.txt',
	'/sitemap.xml',
	'/atom.xml',
	'/feed.xml',
	'/rss.xml',
	'/subscriptions.opml',
	'/llms.txt',
	'/200.html',
	'/404.html',
])

const excludedPrefixes = [
	'/admin',
	'/api',
	'/media',
	'/_nuxt',
	'/__nuxt_content',
	'/__sitemap__',
	'/raw',
]

export interface AnalyticsIdentity {
	pageviewId: string
	visitorToken: string
	sessionToken: string
	createdVisitor: boolean
	createdSession: boolean
}

export interface TrustedAnalyticsContext {
	ipAddress: string | null
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
	verifiedBot: boolean
	botScore: number | null
	botName: string | null
	botCategory: string | null
	classificationSource: string
}

export interface AnalyticsPageviewPayload extends TrustedAnalyticsContext {
	pageviewId: string
	visitorToken: string | null
	sessionToken: string | null
	path: string
	title: string | null
	referrer: string | null
	occurredAt: string
	source: 'edge' | 'spa'
	receivedAt: string
	responseStatus: number | null
}

interface ClientPageviewPayload {
	pageviewId: string
	visitorToken: string | null
	sessionToken: string | null
	path: string
	title: string | null
	referrer: string | null
	occurredAt: string
}

interface EdgeEnvironment {
	API: Fetcher
	ANALYTICS_ENABLED?: string
}

type CfRecord = Record<string, unknown>

function analyticsEnabled(value: string | undefined): boolean {
	return !['0', 'false', 'off', 'disabled'].includes((value ?? 'true').toLowerCase())
}

function record(value: unknown): CfRecord | null {
	return value && typeof value === 'object' ? value as CfRecord : null
}

function nullableText(value: unknown, maximum = 240): string | null {
	return typeof value === 'string' && value.trim()
		? value.trim().slice(0, maximum)
		: null
}

function nullableNumber(value: unknown): number | null {
	const number = typeof value === 'number'
		? value
		: typeof value === 'string'
			? Number(value)
			: Number.NaN
	return Number.isFinite(number) ? number : null
}

function cookieValues(request: Request): Map<string, string> {
	const values = new Map<string, string>()
	for (const item of (request.headers.get('cookie') ?? '').split(';')) {
		const separator = item.indexOf('=')
		if (separator < 1)
			continue
		const name = item.slice(0, separator).trim()
		const value = item.slice(separator + 1).trim()
		if (name && value)
			values.set(name, value)
	}
	return values
}

function validToken(value: string | undefined): string | null {
	return value && uuidPattern.test(value) ? value.toLowerCase() : null
}

function serializeCookie(name: string, value: string, maxAge: number): string {
	return `${name}=${value}; Max-Age=${maxAge}; Path=/; Secure; SameSite=Lax`
}

function cloneWithHeaders(response: Response, headers: Headers): Response {
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	})
}

function isPrefetch(request: Request): boolean {
	return [
		request.headers.get('purpose'),
		request.headers.get('sec-purpose'),
		request.headers.get('x-moz'),
	].some(value => value?.toLowerCase().includes('prefetch'))
}

function isExcludedPath(pathname: string): boolean {
	if (excludedExactPaths.has(pathname))
		return true
	if (excludedPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)))
		return true
	return staticExtensionPattern.test(pathname)
}

function requestCf(request: Request): CfRecord | null {
	return record((request as Request & { cf?: unknown }).cf)
}

function safeErrorName(error: unknown): string {
	return error instanceof Error ? error.name : 'UnknownError'
}

function scheduleCollection(
	env: EdgeEnvironment,
	ctx: ExecutionContext,
	payload: AnalyticsPageviewPayload,
): void {
	const promise = Promise.resolve().then(async () => {
		const response = await env.API.fetch(new Request(internalCollectorUrl, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-fly-analytics-source': 'edge',
			},
			body: JSON.stringify(payload),
		}))
		if (!response.ok)
			throw new Error(`Analytics collector returned ${response.status}`)
	}).catch((error) => {
		console.warn('Analytics collection failed', {
			pageviewId: payload.pageviewId,
			error: safeErrorName(error),
		})
	})

	const waitUntil = (ctx as Partial<ExecutionContext>).waitUntil
	try {
		if (typeof waitUntil === 'function')
			waitUntil.call(ctx, promise)
		else
			void promise
	}
	catch (error) {
		console.warn('Analytics scheduling failed', {
			pageviewId: payload.pageviewId,
			error: safeErrorName(error),
		})
		void promise
	}
}

function sameOriginBeacon(request: Request): boolean {
	const url = new URL(request.url)
	const origin = request.headers.get('origin')
	if (origin)
		return origin === url.origin
	return request.headers.get('sec-fetch-site') === 'same-origin'
}

function clientToken(value: unknown): string | null | undefined {
	if (value === null || value === undefined)
		return value
	return typeof value === 'string' && tokenPattern.test(value) ? value : undefined
}

function parseClientPageview(value: unknown): ClientPageviewPayload | null {
	const input = record(value)
	if (!input || typeof input.pageviewId !== 'string' || !uuidPattern.test(input.pageviewId))
		return null
	const visitorToken = clientToken(input.visitorToken)
	const sessionToken = clientToken(input.sessionToken)
	if (visitorToken === undefined || sessionToken === undefined)
		return null
	if (typeof input.path !== 'string' || input.path.length < 1 || input.path.length > 2_048)
		return null
	const title = input.title === null || input.title === undefined
		? null
		: nullableText(input.title, 240)
	if (input.title !== null && input.title !== undefined && title === null)
		return null
	const referrer = input.referrer === null || input.referrer === undefined
		? null
		: nullableText(input.referrer, 2_048)
	if (input.referrer !== null && input.referrer !== undefined && referrer === null)
		return null
	if (typeof input.occurredAt !== 'string' || !Number.isFinite(Date.parse(input.occurredAt)))
		return null
	return {
		pageviewId: input.pageviewId.toLowerCase(),
		visitorToken: visitorToken ?? null,
		sessionToken: sessionToken ?? null,
		path: input.path,
		title,
		referrer,
		occurredAt: new Date(input.occurredAt).toISOString(),
	}
}

async function readBeaconBody(request: Request): Promise<unknown> {
	const declaredLength = Number(request.headers.get('content-length'))
	if (Number.isFinite(declaredLength) && declaredLength > maxBeaconBytes)
		return null
	const raw = await request.text()
	if (new TextEncoder().encode(raw).byteLength > maxBeaconBytes)
		return null
	try {
		return JSON.parse(raw)
	}
	catch {
		return null
	}
}

export function shouldCollectPageview(
	request: Request,
	response: Response,
	pathname: string,
): boolean {
	if (request.method !== 'GET' || (response.status >= 300 && response.status < 400))
		return false
	if (!response.headers.get('content-type')?.toLowerCase().includes('text/html'))
		return false
	if (isPrefetch(request) || isExcludedPath(pathname))
		return false
	return true
}

export function resolveAnalyticsIdentity(request: Request): AnalyticsIdentity {
	const cookies = cookieValues(request)
	const visitor = validToken(cookies.get(visitorCookieName))
	const session = validToken(cookies.get(sessionCookieName))
	return {
		pageviewId: crypto.randomUUID(),
		visitorToken: visitor ?? crypto.randomUUID(),
		sessionToken: session ?? crypto.randomUUID(),
		createdVisitor: visitor === null,
		createdSession: session === null,
	}
}

export function trustedAnalyticsContext(request: Request): TrustedAnalyticsContext {
	const cf = requestCf(request)
	const botManagement = record(cf?.botManagement)
	return {
		ipAddress: nullableText(request.headers.get('cf-connecting-ip'), 64),
		countryCode: nullableText(cf?.country, 2),
		regionCode: nullableText(cf?.regionCode, 32),
		regionName: nullableText(cf?.region, 120),
		city: nullableText(cf?.city, 120),
		postalCode: nullableText(cf?.postalCode, 32),
		timezone: nullableText(cf?.timezone, 80),
		latitude: nullableNumber(cf?.latitude),
		longitude: nullableNumber(cf?.longitude),
		asn: nullableNumber(cf?.asn),
		asOrganization: nullableText(cf?.asOrganization, 240),
		userAgent: nullableText(request.headers.get('user-agent'), 768),
		verifiedBot: botManagement?.verifiedBot === true,
		botScore: nullableNumber(botManagement?.score),
		botName: null,
		botCategory: null,
		classificationSource: cf ? 'cloudflare' : 'request',
	}
}

export function withAnalyticsCookies(
	response: Response,
	identity: AnalyticsIdentity,
): Response {
	const headers = new Headers(response.headers)
	if (identity.createdVisitor) {
		headers.append('set-cookie', serializeCookie(
			visitorCookieName,
			identity.visitorToken,
			visitorMaxAgeSeconds,
		))
	}
	headers.append('set-cookie', serializeCookie(
		sessionCookieName,
		identity.sessionToken,
		sessionMaxAgeSeconds,
	))
	return cloneWithHeaders(response, headers)
}

export function instrumentPageResponse(
	request: Request,
	response: Response,
	pathname: string,
	env: EdgeEnvironment,
	ctx: ExecutionContext,
	now = new Date(),
): Response {
	if (!analyticsEnabled(env.ANALYTICS_ENABLED) || !shouldCollectPageview(request, response, pathname))
		return response
	try {
		const identity = resolveAnalyticsIdentity(request)
		const at = now.toISOString()
		scheduleCollection(env, ctx, {
			pageviewId: identity.pageviewId,
			visitorToken: identity.visitorToken,
			sessionToken: identity.sessionToken,
			path: pathname,
			title: null,
			referrer: nullableText(request.headers.get('referer'), 2_048),
			occurredAt: at,
			source: 'edge',
			receivedAt: at,
			responseStatus: response.status,
			...trustedAnalyticsContext(request),
		})
		return withAnalyticsCookies(response, identity)
	}
	catch (error) {
		console.warn('Analytics instrumentation failed', { error: safeErrorName(error) })
		return response
	}
}

export async function handleAnalyticsBeacon(
	request: Request,
	env: EdgeEnvironment,
	ctx: ExecutionContext,
	now = new Date(),
): Promise<Response> {
	const noContent = () => new Response(null, {
		status: 204,
		headers: { 'cache-control': 'no-store' },
	})
	if (!analyticsEnabled(env.ANALYTICS_ENABLED) || request.method !== 'POST')
		return noContent()
	if (!sameOriginBeacon(request))
		return noContent()
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
		return noContent()
	const client = parseClientPageview(await readBeaconBody(request))
	if (!client)
		return noContent()
	const receivedAt = now.toISOString()
	scheduleCollection(env, ctx, {
		...client,
		source: 'spa',
		receivedAt,
		responseStatus: null,
		...trustedAnalyticsContext(request),
	})
	return noContent()
}
