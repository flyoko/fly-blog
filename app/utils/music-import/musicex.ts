import { MusicImportError } from './types'

const musicExMagic = 'musicex\u0000'
const musicExMinimumTagBytes = 0xC0

export interface MusicExFooter {
	tagSize: number
	version: 1
	songId: number
	mediaId: string
	mediaFileName: string
	audioBytes: number
}

function ascii(bytes: Uint8Array, start: number, length: number) {
	return String.fromCharCode(...bytes.slice(start, start + length))
}

function readUtf16LeAscii(bytes: Uint8Array, start: number, maxBytes: number) {
	let value = ''
	for (let offset = 0; offset + 1 < maxBytes; offset += 2) {
		const code = bytes[start + offset]
		if (!code)
			break
		value += String.fromCharCode(code)
	}
	return value.normalize('NFC')
}

function hasUnsafeFileNameCharacter(value: string) {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0)
		return character === '/' || character === '\\' || code <= 0x1F || code === 0x7F
	})
}

export function parseMusicExFooter(bytes: Uint8Array): MusicExFooter | null {
	if (bytes.byteLength < 16 || ascii(bytes, bytes.byteLength - 8, 8) !== musicExMagic)
		return null

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const tagSize = view.getUint32(bytes.byteLength - 16, true)
	const version = view.getUint32(bytes.byteLength - 12, true)
	if (version !== 1) {
		throw new MusicImportError(
			'UNSUPPORTED_QMC_VARIANT',
			`暂不支持 MusicEx v${version} 文件。`,
		)
	}
	if (tagSize < musicExMinimumTagBytes || tagSize > bytes.byteLength) {
		throw new MusicImportError(
			'UNSUPPORTED_QMC_VARIANT',
			'MusicEx 标签长度无效，无法安全解析该文件。',
		)
	}

	const tagOffset = bytes.byteLength - tagSize
	const songId = view.getUint32(tagOffset, true)
	const mediaId = readUtf16LeAscii(bytes, tagOffset + 0x0C, 30 * 2)
	const mediaFileName = readUtf16LeAscii(bytes, tagOffset + 0x48, 50 * 2)
	if (!mediaFileName || hasUnsafeFileNameCharacter(mediaFileName)) {
		throw new MusicImportError(
			'UNSUPPORTED_QMC_VARIANT',
			'MusicEx 媒体文件名无效，无法安全查找本地密钥。',
		)
	}

	return {
		tagSize,
		version: 1,
		songId,
		mediaId,
		mediaFileName,
		audioBytes: tagOffset,
	}
}

export function buildSyntheticQTag(mediaKey: string, songId: number) {
	const metadata = new TextEncoder().encode(`${mediaKey},${songId},2`)
	const output = new Uint8Array(metadata.byteLength + 8)
	output.set(metadata)
	new DataView(output.buffer).setUint32(metadata.byteLength, metadata.byteLength, false)
	output.set(new TextEncoder().encode('QTag'), metadata.byteLength + 4)
	return output
}
