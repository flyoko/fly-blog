import type { MediaUploadPurpose } from '../../../../../shared/admin/media'

export type MediaKind = 'image' | 'audio'

export interface DetectedMedia {
	extension: string
	mime: string
	kind: MediaKind
}

const audioExtensions = new Set(['mp3', 'ogg', 'wav'])

function hasPrefix(bytes: Uint8Array, prefix: number[]) {
	return prefix.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, start: number, length: number) {
	return String.fromCharCode(...bytes.slice(start, start + length))
}

export function detectAllowedMedia(bytes: Uint8Array): DetectedMedia | null {
	if (bytes.length >= 8 && hasPrefix(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
		return { extension: 'png', mime: 'image/png', kind: 'image' }
	if (bytes.length >= 3 && hasPrefix(bytes, [0xFF, 0xD8, 0xFF]))
		return { extension: 'jpg', mime: 'image/jpeg', kind: 'image' }
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP')
		return { extension: 'webp', mime: 'image/webp', kind: 'image' }
	if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6)))
		return { extension: 'gif', mime: 'image/gif', kind: 'image' }
	if (
		(bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3')
		|| (bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1]! & 0xE0) === 0xE0)
	) {
		return { extension: 'mp3', mime: 'audio/mpeg', kind: 'audio' }
	}
	if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS')
		return { extension: 'ogg', mime: 'audio/ogg', kind: 'audio' }
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE')
		return { extension: 'wav', mime: 'audio/wav', kind: 'audio' }
	return null
}

export function maxBytesFor(kind: MediaKind): number {
	return kind === 'image' ? 20 * 1024 * 1024 : 80 * 1024 * 1024
}

export function buildMediaKey(input: {
	purpose: MediaUploadPurpose
	extension: string
	now: Date
	id: string
}): string {
	const extension = input.extension.toLowerCase()
	if (!/^[a-z0-9]+$/u.test(extension) || !/^[\w-]+$/u.test(input.id))
		throw new Error('Invalid media key input')
	if (input.purpose === 'article') {
		const year = input.now.getUTCFullYear()
		const month = String(input.now.getUTCMonth() + 1).padStart(2, '0')
		return `public/articles/${year}/${month}/${input.id}.${extension}`
	}
	if (input.purpose === 'profile')
		return `public/profile/${input.id}.${extension}`
	const folder = audioExtensions.has(extension) ? 'audio' : 'covers'
	return `public/music/${folder}/${input.id}.${extension}`
}
