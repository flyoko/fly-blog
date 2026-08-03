import { MusicImportError } from './types'

const qmcEkeyPattern = /^[A-Za-z0-9+/]+={0,2}$/u
const maxKeyEntries = 10000
const maxEkeyLength = 16384
const maxVarintBytes = 10

interface QmcKeyBundleJson {
	version: number
	source: string
	generatedAt?: string
	keys: Record<string, unknown>
}

function invalidBundle(message: string, cause?: unknown): never {
	throw new MusicImportError('INVALID_KEY_BUNDLE', message, cause ? { cause } : undefined)
}

export function normalizeQmcMediaFileName(fileName: string) {
	return fileName.normalize('NFC')
}

function baseName(fileName: string) {
	return fileName.replace(/^.*[\\/]/u, '')
}

function validQmcMediaFileName(fileName: string) {
	if (!fileName || Array.from(fileName).length > 255 || fileName.startsWith('.'))
		return false
	return !Array.from(fileName).some((character) => {
		const code = character.charCodeAt(0)
		return character === '/' || character === '\\' || code <= 0x1F || code === 0x7F
	})
}

interface ValidateEntriesOptions {
	allowPath?: boolean
	skipInvalid?: boolean
}

function validateEntries(entries: Iterable<[string, unknown]>, options: ValidateEntriesOptions = {}) {
	const result = new Map<string, string>()
	let count = 0
	for (const [rawFileName, rawKey] of entries) {
		count++
		if (count > maxKeyEntries)
			invalidBundle(`密钥条目不能超过 ${maxKeyEntries} 条。`)
		const normalized = normalizeQmcMediaFileName(rawFileName)
		const fileName = options.allowPath ? baseName(normalized) : normalized
		if (!validQmcMediaFileName(fileName)) {
			if (options.skipInvalid)
				continue
			invalidBundle('密钥文件包含无效媒体文件名。')
		}
		if (typeof rawKey !== 'string' || rawKey.length < 16 || rawKey.length > maxEkeyLength || !qmcEkeyPattern.test(rawKey)) {
			if (options.skipInvalid)
				continue
			invalidBundle('密钥文件包含无效媒体密钥。')
		}
		result.set(fileName, rawKey)
	}
	if (result.size === 0)
		invalidBundle('密钥文件中没有可用的媒体密钥。')
	return result
}

export function parseQmcKeyBundle(input: string): Map<string, string> {
	let parsed: unknown
	try {
		parsed = JSON.parse(input)
	}
	catch (cause) {
		invalidBundle('密钥包不是有效 JSON 文件。', cause)
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		invalidBundle('密钥包结构无效。')

	const bundle = parsed as Partial<QmcKeyBundleJson>
	if (bundle.version !== 1 || bundle.source !== 'qqmusic-mmkv')
		invalidBundle('只支持版本 1 的 QQ 音乐 MMKV 密钥包。')
	if (!bundle.keys || typeof bundle.keys !== 'object' || Array.isArray(bundle.keys))
		invalidBundle('密钥包缺少文件名到媒体密钥的映射。')
	return validateEntries(Object.entries(bundle.keys))
}

class MmkvReader {
	private offset = 4
	private readonly end: number
	private readonly decoder = new TextDecoder('utf-8', { fatal: true })

	constructor(private readonly bytes: Uint8Array) {
		if (bytes.byteLength < 5)
			invalidBundle('QQ 音乐 MMKV 密钥文件过短。')
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		const dataBytes = view.getUint32(0, true)
		this.end = 4 + dataBytes
		if (dataBytes === 0 || this.end > bytes.byteLength)
			invalidBundle('QQ 音乐 MMKV 密钥文件长度无效。')
		this.readVarint()
	}

	get eof() {
		return this.offset >= this.end
	}

	private readByte() {
		if (this.offset >= this.end)
			invalidBundle('QQ 音乐 MMKV 密钥文件内容不完整。')
		return this.bytes[this.offset++]!
	}

	private readVarint() {
		let value = 0
		let multiplier = 1
		for (let index = 0; index < maxVarintBytes; index++) {
			const byte = this.readByte()
			const chunk = byte & 0x7F
			if (chunk !== 0 && multiplier > Number.MAX_SAFE_INTEGER / chunk)
				invalidBundle('QQ 音乐 MMKV 密钥文件包含过大的长度字段。')
			const addition = chunk * multiplier
			if (value > Number.MAX_SAFE_INTEGER - addition)
				invalidBundle('QQ 音乐 MMKV 密钥文件包含过大的长度字段。')
			value += addition
			if ((byte & 0x80) === 0)
				return value
			if (multiplier > Number.MAX_SAFE_INTEGER / 128)
				invalidBundle('QQ 音乐 MMKV 密钥文件包含过大的长度字段。')
			multiplier *= 128
		}
		return invalidBundle('QQ 音乐 MMKV 密钥文件包含无效长度字段。')
	}

	private readBytes(length: number) {
		if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.end)
			invalidBundle('QQ 音乐 MMKV 密钥文件内容不完整。')
		const start = this.offset
		this.offset += length
		return this.bytes.subarray(start, this.offset)
	}

	readString() {
		const length = this.readVarint()
		try {
			return this.decoder.decode(this.readBytes(length)).normalize('NFC')
		}
		catch (cause) {
			return invalidBundle('QQ 音乐 MMKV 密钥文件包含无效文本。', cause)
		}
	}

	readStringValue() {
		const containerBytes = this.readVarint()
		if (containerBytes === 0)
			return null
		const target = this.offset + containerBytes
		if (target > this.end)
			invalidBundle('QQ 音乐 MMKV 密钥文件内容不完整。')
		const value = this.readString()
		if (this.offset !== target)
			invalidBundle('QQ 音乐 MMKV 密钥文件值长度无效。')
		return value
	}
}

export function parseQmcMmkv(input: ArrayBuffer): Map<string, string> {
	try {
		const reader = new MmkvReader(new Uint8Array(input))
		const entries: Array<[string, string]> = []
		while (!reader.eof) {
			const name = reader.readString()
			const ekey = reader.readStringValue()
			if (ekey)
				entries.push([name, ekey])
			if (entries.length > maxKeyEntries)
				invalidBundle(`密钥条目不能超过 ${maxKeyEntries} 条。`)
		}
		return validateEntries(entries, { allowPath: true, skipInvalid: true })
	}
	catch (cause) {
		if (cause instanceof MusicImportError)
			throw cause
		return invalidBundle('无法解析 QQ 音乐 MMKV 密钥文件。', cause)
	}
}

export async function parseQmcKeyFile(file: File): Promise<Map<string, string>> {
	const input = await file.arrayBuffer()
	const bytes = new Uint8Array(input)
	let looksLikeJson = file.name.toLowerCase().endsWith('.json')
	if (!looksLikeJson) {
		try {
			looksLikeJson = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 256))).trimStart().startsWith('{')
		}
		catch {
			looksLikeJson = false
		}
	}
	if (!looksLikeJson)
		return parseQmcMmkv(input)
	try {
		return parseQmcKeyBundle(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
	}
	catch (cause) {
		if (cause instanceof MusicImportError)
			throw cause
		return invalidBundle('密钥包不是有效 UTF-8 JSON 文件。', cause)
	}
}
