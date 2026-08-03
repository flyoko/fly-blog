import type { DetectedAudio, SupportedAudioExtension } from './types'

const allowedM4aBrands = new Set(['M4A ', 'M4B ', 'mp41', 'mp42', 'isom'])

function ascii(bytes: Uint8Array, start: number, length: number) {
	return String.fromCharCode(...bytes.slice(start, start + length))
}

function hasM4aBrand(bytes: Uint8Array) {
	if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp')
		return false
	if (allowedM4aBrands.has(ascii(bytes, 8, 4)))
		return true
	for (let offset = 16; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
		if (allowedM4aBrands.has(ascii(bytes, offset, 4)))
			return true
	}
	return false
}

export function detectStandardAudio(bytes: Uint8Array): DetectedAudio | null {
	if (
		(bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3')
		|| (bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1]! & 0xE0) === 0xE0)
	) {
		return { extension: 'mp3', mime: 'audio/mpeg' }
	}
	if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS')
		return { extension: 'ogg', mime: 'audio/ogg' }
	if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'fLaC')
		return { extension: 'flac', mime: 'audio/flac' }
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE')
		return { extension: 'wav', mime: 'audio/wav' }
	if (hasM4aBrand(bytes))
		return { extension: 'm4a', mime: 'audio/mp4' }
	return null
}

export function sanitizeAudioFileName(fileName: string, extension: SupportedAudioExtension): string {
	const withoutControls = Array.from(fileName, (character) => {
		const code = character.charCodeAt(0)
		return code <= 0x1F || (code >= 0x7F && code <= 0x9F) ? '' : character
	}).join('')
	const cleaned = withoutControls
		.replace(/[\\/]+/gu, '-')
		.trim()
		.replace(/[. ]+$/gu, '')
	const dot = cleaned.lastIndexOf('.')
	const withoutExtension = dot >= 0 ? cleaned.slice(0, dot) : cleaned
	const base = withoutExtension.trim().replace(/[. ]+$/gu, '') || 'audio'
	return `${base}.${extension}`
}

export function audioSignatureBytes(file: Blob, length = 64): Promise<Uint8Array> {
	return file.slice(0, length).arrayBuffer().then(buffer => new Uint8Array(buffer))
}
