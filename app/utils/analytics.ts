import type { AnalyticsClientPageview } from '../../shared/admin/analytics'

export const clientAnalyticsVisitorCookie = 'fly_analytics_visitor'
export const clientAnalyticsSessionCookie = 'fly_analytics_session'

const visitorMaxAgeSeconds = 365 * 24 * 60 * 60
const sessionMaxAgeSeconds = 30 * 60
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const staticExtensionPattern = /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|txt|wasm|webm|webmanifest|webp|woff2?|xml)$/iu
const excludedPrefixes = ['/admin', '/api', '/media', '/_nuxt', '/__nuxt_content', '/raw']

export interface ClientAnalyticsIdentity {
	visitorToken: string
	sessionToken: string
	createdVisitor: boolean
	createdSession: boolean
}

export interface BuildClientPageviewInput {
	to: string
	from: string
	title: string
	origin: string
	visitorToken: string
	sessionToken: string
	now?: Date
	pageviewId?: string
}

export interface AnalyticsBeaconTransport {
	sendBeacon?: (url: string | URL, data?: BodyInit | null) => boolean
}

export type AnalyticsFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>

function cookieMap(cookieHeader: string): Map<string, string> {
	const cookies = new Map<string, string>()
	for (const item of cookieHeader.split(';')) {
		const separator = item.indexOf('=')
		if (separator < 1)
			continue
		const name = item.slice(0, separator).trim()
		const value = item.slice(separator + 1).trim()
		if (name && value)
			cookies.set(name, value)
	}
	return cookies
}

function validUuid(value: string | undefined): string | null {
	return value && uuidPattern.test(value) ? value.toLowerCase() : null
}

function cookieAssignment(name: string, value: string, maxAge: number): string {
	return `${name}=${value}; Max-Age=${maxAge}; Path=/; Secure; SameSite=Lax`
}

export function normalizeClientAnalyticsPath(value: string): string {
	try {
		const url = new URL(value, 'https://analytics.invalid')
		return url.pathname.startsWith('/') ? url.pathname || '/' : `/${url.pathname}`
	}
	catch {
		return '/'
	}
}

export function isClientAnalyticsExcludedPath(value: string): boolean {
	const pathname = normalizeClientAnalyticsPath(value)
	return excludedPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
		|| staticExtensionPattern.test(pathname)
}

export function shouldTrackClientNavigation(from: string, to: string): boolean {
	const fromPath = normalizeClientAnalyticsPath(from)
	const toPath = normalizeClientAnalyticsPath(to)
	return fromPath !== toPath && !isClientAnalyticsExcludedPath(toPath)
}

export function resolveClientAnalyticsIdentity(
	cookieHeader: string,
	createToken: () => string = () => crypto.randomUUID(),
): ClientAnalyticsIdentity {
	const cookies = cookieMap(cookieHeader)
	const visitor = validUuid(cookies.get(clientAnalyticsVisitorCookie))
	const session = validUuid(cookies.get(clientAnalyticsSessionCookie))
	return {
		visitorToken: visitor ?? createToken(),
		sessionToken: session ?? createToken(),
		createdVisitor: visitor === null,
		createdSession: session === null,
	}
}

export function clientAnalyticsCookieAssignments(identity: ClientAnalyticsIdentity): string[] {
	const assignments: string[] = []
	if (identity.createdVisitor) {
		assignments.push(cookieAssignment(
			clientAnalyticsVisitorCookie,
			identity.visitorToken,
			visitorMaxAgeSeconds,
		))
	}
	assignments.push(cookieAssignment(
		clientAnalyticsSessionCookie,
		identity.sessionToken,
		sessionMaxAgeSeconds,
	))
	return assignments
}

export function buildClientPageview(input: BuildClientPageviewInput): AnalyticsClientPageview {
	const path = normalizeClientAnalyticsPath(input.to)
	const referrerPath = normalizeClientAnalyticsPath(input.from)
	return {
		pageviewId: input.pageviewId ?? crypto.randomUUID(),
		visitorToken: input.visitorToken,
		sessionToken: input.sessionToken,
		path,
		title: input.title.trim().slice(0, 240) || null,
		referrer: new URL(referrerPath, input.origin).toString(),
		occurredAt: (input.now ?? new Date()).toISOString(),
	}
}

export async function sendAnalyticsPageview(
	payload: AnalyticsClientPageview,
	transport: AnalyticsBeaconTransport = navigator,
	fetcher: AnalyticsFetch = fetch,
): Promise<void> {
	const body = JSON.stringify(payload)
	if (transport.sendBeacon) {
		try {
			const accepted = transport.sendBeacon(
				'/api/analytics/pageview',
				new Blob([body], { type: 'application/json' }),
			)
			if (accepted)
				return
		}
		catch {
			// Fall back to keepalive fetch when the browser rejects Beacon data.
		}
	}
	try {
		await fetcher('/api/analytics/pageview', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body,
			credentials: 'same-origin',
			keepalive: true,
		})
	}
	catch {
		// Analytics must never affect navigation or surface an error to visitors.
	}
}
