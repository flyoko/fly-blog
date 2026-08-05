import { describe, expect, it } from 'vitest'
import { normalizeCanonicalSiteHref } from '../../app/utils/site-link'

describe('canonical site links', () => {
	it('rewrites same-origin absolute links to relative paths', () => {
		expect(normalizeCanonicalSiteHref('https://flyovo.cc.cd/admin/media')).toBe('/admin/media')
	})

	it('preserves queries and fragments while normalizing same-origin links', () => {
		expect(normalizeCanonicalSiteHref('https://flyovo.cc.cd/archive?page=2#year-2026')).toBe('/archive?page=2#year-2026')
	})

	it('keeps relative and external links semantically unchanged', () => {
		expect(normalizeCanonicalSiteHref('/me')).toBe('/me')
		expect(normalizeCanonicalSiteHref('https://example.com/service')).toBe('https://example.com/service')
	})

	it('does not misclassify browser-normalized backslash escapes as internal', () => {
		expect(normalizeCanonicalSiteHref('/\\evil.example/path')).toBe('https://evil.example/path')
	})
})
