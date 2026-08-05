const canonicalPublicOrigin = 'https://flyovo.cc.cd'

export function normalizeCanonicalSiteHref(value: string): string {
	const trimmed = value.trim()
	if (!trimmed)
		return '/'

	try {
		const url = new URL(trimmed, canonicalPublicOrigin)
		if (url.origin === canonicalPublicOrigin)
			return `${url.pathname}${url.search}${url.hash}` || '/'
		return url.href
	}
	catch {
		return trimmed
	}
}
