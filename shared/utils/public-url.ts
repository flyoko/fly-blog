import { z } from 'zod'

const reservedHostSuffixes = [
	'.alt',
	'.arpa',
	'.example',
	'.home',
	'.internal',
	'.invalid',
	'.lan',
	'.local',
	'.localhost',
	'.localtest.me',
	'.lvh.me',
	'.nip.io',
	'.onion',
	'.sslip.io',
	'.test',
	'.xip.io',
]

function isIpv4Part(value: string): boolean {
	return /^\d{1,3}$/u.test(value) && Number(value) <= 255
}

function containsEncodedIpv4(hostname: string): boolean {
	const labels = hostname.split('.')
	for (let index = 0; index <= labels.length - 4; index++) {
		if (labels.slice(index, index + 4).every(isIpv4Part))
			return true
	}
	return labels.some(label => label.split('-').length === 4 && label.split('-').every(isIpv4Part))
}

export function isPublicHttpUrl(value: string): boolean {
	let url: URL
	try {
		url = new URL(value)
	}
	catch {
		return false
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:')
		return false
	if (url.username || url.password)
		return false
	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '')
	if (!hostname || hostname === 'localhost' || !hostname.includes('.'))
		return false
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(':'))
		return false
	if (containsEncodedIpv4(hostname))
		return false
	if (reservedHostSuffixes.some(suffix => hostname.endsWith(suffix)))
		return false
	return hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
}

export const publicHttpUrlSchema = z.string().url().refine(isPublicHttpUrl, 'Only public HTTP(S) links are allowed')
