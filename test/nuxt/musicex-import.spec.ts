import type { QmcCryptoModule } from '../../app/utils/music-import/qmc-wasm'
import type { QmcWorkerRequest, QmcWorkerResponse } from '../../app/utils/music-import/types'
import { describe, expect, it, vi } from 'vitest'
import { createMusicImportController } from '../../app/composables/useMusicImport'
import { buildSyntheticQTag, parseMusicExFooter } from '../../app/utils/music-import/musicex'
import { parseQmcKeyBundle, parseQmcKeyFile, parseQmcMmkv } from '../../app/utils/music-import/qmc-key-file'
import { decryptQmc, qmcDecryptChunkBytes } from '../../app/utils/music-import/qmc-wasm'
import { maxQmcKeyFileBytes } from '../../app/utils/music-import/types'
import { handleQmcDecryptRequest } from '../../app/workers/qmc-decrypt.worker'

function ascii(value: string) {
	return new TextEncoder().encode(value)
}

function writeUtf16Le(target: Uint8Array, offset: number, value: string, maxBytes: number) {
	for (let index = 0; index < value.length && index * 2 < maxBytes; index++) {
		target[offset + index * 2] = value.charCodeAt(index)
		target[offset + index * 2 + 1] = 0
	}
}

function musicExFixture(options: {
	audioBytes?: number
	songId?: number
	mediaId?: string
	mediaFileName?: string
} = {}) {
	const audioBytes = options.audioBytes ?? 64
	const tagBytes = 0xC0
	const bytes = new Uint8Array(audioBytes + tagBytes)
	bytes.fill(0x39, 0, audioBytes)
	const view = new DataView(bytes.buffer)
	const tagOffset = audioBytes
	view.setUint32(tagOffset, options.songId ?? 705944328, true)
	writeUtf16Le(bytes, tagOffset + 0x0C, options.mediaId ?? '000HJUZs40wWgK', 60)
	writeUtf16Le(bytes, tagOffset + 0x48, options.mediaFileName ?? 'F0M0000HJUZs40wWgK.mflac', 100)
	view.setUint32(bytes.length - 16, tagBytes, true)
	view.setUint32(bytes.length - 12, 1, true)
	bytes.set(ascii('musicex\u0000'), bytes.length - 8)
	return bytes
}

const sampleEkey = 'WkZKNldETndOVnJqRUpaQjFvNlFqa1FWMlpiSFN3LzJFYjAwcTErNHo5U1ZXWT0='

function concatBytes(...parts: Uint8Array[]) {
	const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
	let offset = 0
	for (const part of parts) {
		output.set(part, offset)
		offset += part.byteLength
	}
	return output
}

function encodeVarint(value: number) {
	const bytes: number[] = []
	let remaining = value
	do {
		let byte = remaining & 0x7F
		remaining = Math.floor(remaining / 128)
		if (remaining)
			byte |= 0x80
		bytes.push(byte)
	} while (remaining)
	return Uint8Array.from(bytes)
}

function encodeMmkvString(value: string) {
	const bytes = ascii(value)
	return concatBytes(encodeVarint(bytes.byteLength), bytes)
}

function qmcMmkvFixture(entries: Record<string, string>) {
	const bodyParts: Uint8Array[] = [Uint8Array.of(0)]
	for (const [name, ekey] of Object.entries(entries)) {
		const value = encodeMmkvString(ekey)
		bodyParts.push(encodeMmkvString(name), encodeVarint(value.byteLength), value)
	}
	const body = concatBytes(...bodyParts)
	const header = new Uint8Array(4)
	new DataView(header.buffer).setUint32(0, body.byteLength, true)
	return concatBytes(header, body)
}

function createFakeModule() {
	const heap = new Uint8Array(qmcDecryptChunkBytes + 64)
	const writes: Uint8Array[] = []
	const offsets: number[] = []
	const module: QmcCryptoModule = {
		HEAPU8: heap,
		_malloc: vi.fn(() => 16),
		_free: vi.fn(),
		writeArrayToMemory: vi.fn((data, pointer) => {
			writes.push(new Uint8Array(data))
			heap.set(data, pointer)
		}),
		preDec: vi.fn((_pointer, size) => size),
		decBlob: vi.fn((pointer, size, offset) => {
			offsets.push(offset)
			for (let index = 0; index < size; index++)
				heap[pointer + index] = (offset + index) % 251
			return size
		}),
		getErr: vi.fn(() => ''),
		getSongId: vi.fn(() => '705944328'),
	}
	return { module, writes, offsets }
}

class FakeWorker {
	onmessage: ((event: MessageEvent<QmcWorkerResponse>) => void) | null = null
	onerror: ((event: ErrorEvent) => void) | null = null
	readonly terminate = vi.fn()
	readonly postMessage = vi.fn<(message: QmcWorkerRequest, transfer?: Transferable[]) => void>()

	constructor(handler: (message: QmcWorkerRequest, worker: FakeWorker) => void) {
		this.postMessage.mockImplementation(message => handler(message, this))
	}

	emit(data: QmcWorkerResponse) {
		this.onmessage?.({ data } as MessageEvent<QmcWorkerResponse>)
	}
}

describe('musicEx footer', () => {
	it('parses the exact media filename and audio boundary', () => {
		const bytes = musicExFixture()
		expect(parseMusicExFooter(bytes)).toEqual({
			tagSize: 192,
			version: 1,
			songId: 705944328,
			mediaId: '000HJUZs40wWgK',
			mediaFileName: 'F0M0000HJUZs40wWgK.mflac',
			audioBytes: 64,
		})
	})

	it('returns null for non-MusicEx files and rejects malformed MusicEx tags', () => {
		expect(parseMusicExFooter(ascii('OggS\u0000'))).toBeNull()
		const malformed = musicExFixture()
		new DataView(malformed.buffer).setUint32(malformed.length - 12, 2, true)
		expect(() => parseMusicExFooter(malformed)).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_QMC_VARIANT' }))
	})

	it('builds a QTag footer that carries only the selected ekey', () => {
		const footer = buildSyntheticQTag(sampleEkey, 705944328)
		expect(new TextDecoder().decode(footer.slice(-4))).toBe('QTag')
		const metadataLength = new DataView(footer.buffer, footer.byteOffset + footer.byteLength - 8, 4).getUint32(0, false)
		expect(metadataLength).toBe(footer.byteLength - 8)
		expect(new TextDecoder().decode(footer.slice(0, metadataLength))).toBe(`${sampleEkey},705944328,2`)
	})
})

describe('qMC key bundle', () => {
	it('accepts a versioned exact filename-to-ekey mapping', () => {
		const bundle = parseQmcKeyBundle(JSON.stringify({
			version: 1,
			source: 'qqmusic-mmkv',
			generatedAt: '2026-08-04T00:00:00.000Z',
			keys: { 'F0M0000HJUZs40wWgK.mflac': sampleEkey },
		}))
		expect(bundle.size).toBe(1)
		expect(bundle.get('F0M0000HJUZs40wWgK.mflac')).toBe(sampleEkey)
	})

	it.each([
		'{}',
		JSON.stringify({ version: 2, source: 'qqmusic-mmkv', keys: {} }),
		JSON.stringify({ version: 1, source: 'unknown', keys: {} }),
		JSON.stringify({ version: 1, source: 'qqmusic-mmkv', keys: { '../bad.mgg': 'not base64' } }),
		JSON.stringify({ version: 1, source: 'qqmusic-mmkv', keys: { '../bad.mgg': sampleEkey } }),
	])('rejects invalid key bundles without exposing key values', (input) => {
		expect(() => parseQmcKeyBundle(input)).toThrowError(expect.objectContaining({ code: 'INVALID_KEY_BUNDLE' }))
	})

	it('imports QQ Music MMKV databases directly and keeps only the basename', async () => {
		const bytes = qmcMmkvFixture({
			'/private/qqmusic/F0M0000HJUZs40wWgK.mflac': sampleEkey,
		})
		const direct = parseQmcMmkv(bytes.buffer)
		expect(direct.get('F0M0000HJUZs40wWgK.mflac')).toBe(sampleEkey)

		const imported = await parseQmcKeyFile(new File([bytes], 'MMKVStreamEncryptId'))
		expect(imported.get('F0M0000HJUZs40wWgK.mflac')).toBe(sampleEkey)
	})

	it('ignores unrelated MMKV records while retaining valid media keys', () => {
		const bytes = qmcMmkvFixture({
			'last_sync_time': 'metadata',
			'F0M0000HJUZs40wWgK.mflac': sampleEkey,
		})
		const imported = parseQmcMmkv(bytes.buffer)
		expect(imported.size).toBe(1)
		expect(imported.get('F0M0000HJUZs40wWgK.mflac')).toBe(sampleEkey)
	})

	it('auto-detects JSON key bundles even when the file has no extension', async () => {
		const imported = await parseQmcKeyFile(new File([JSON.stringify({
			version: 1,
			source: 'qqmusic-mmkv',
			keys: { 'F0M0000HJUZs40wWgK.mflac': sampleEkey },
		})], 'qmc-keys'))
		expect(imported.get('F0M0000HJUZs40wWgK.mflac')).toBe(sampleEkey)
	})

	it('rejects truncated MMKV databases with a stable error code', () => {
		const bytes = qmcMmkvFixture({ 'F0M0000HJUZs40wWgK.mflac': sampleEkey })
		expect(() => parseQmcMmkv(bytes.slice(0, bytes.byteLength - 3).buffer))
			.toThrowError(expect.objectContaining({ code: 'INVALID_KEY_BUNDLE' }))
	})
})

describe('musicEx WASM compatibility layer', () => {
	it('requires an exact media key before invoking the decoder', async () => {
		const { module } = createFakeModule()
		await expect(decryptQmc(musicExFixture().buffer, 'mflac', undefined, async () => module))
			.rejects
			.toMatchObject({ code: 'QMC_KEY_REQUIRED' })
		expect(module.preDec).not.toHaveBeenCalled()
		expect(module.decBlob).not.toHaveBeenCalled()
		expect(module._free).toHaveBeenCalledOnce()
	})

	it('converts the selected ekey to QTag and excludes the MusicEx tag from output', async () => {
		const input = musicExFixture({ audioBytes: qmcDecryptChunkBytes + 7 })
		const { module, writes, offsets } = createFakeModule()
		const result = await decryptQmc(input.buffer, 'mflac', undefined, async () => module, sampleEkey)
		expect(result.bytes.byteLength).toBe(qmcDecryptChunkBytes + 7)
		expect(result.songId).toBe('705944328')
		expect(new TextDecoder().decode(writes[0]!.slice(-4))).toBe('QTag')
		expect(new TextDecoder().decode(writes[0]!)).toContain(sampleEkey)
		expect(offsets).toEqual([0, qmcDecryptChunkBytes])
	})
})

describe('musicEx import orchestration', () => {
	it('accepts a valid key file larger than the previous 5 MiB limit', async () => {
		const controller = createMusicImportController()
		const bundle = JSON.stringify({
			version: 1,
			source: 'qqmusic-mmkv',
			keys: { 'F0M0000HJUZs40wWgK.mflac': sampleEkey },
		})
		const file = new File([
			bundle,
			' '.repeat(5 * 1024 * 1024),
		], 'qqmusic-qmc-keys.json', { type: 'application/json' })

		expect(file.size).toBeGreaterThan(5 * 1024 * 1024)
		await expect(controller.loadKeyFile(file)).resolves.toBe(1)
		expect(controller.keyCount.value).toBe(1)
	})

	it('rejects an oversized key file before reading it into memory', async () => {
		const arrayBuffer = vi.fn()
		const file = {
			name: 'MMKVStreamEncryptId',
			size: maxQmcKeyFileBytes + 1,
			arrayBuffer,
		} as unknown as File
		const controller = createMusicImportController()

		await expect(controller.loadKeyFile(file))
			.rejects
			.toMatchObject({ code: 'INVALID_KEY_BUNDLE' })
		expect(arrayBuffer).not.toHaveBeenCalled()
	})

	it('returns QMC_KEY_REQUIRED from the Worker when the exact key is absent', async () => {
		const decryptor = vi.fn()
		const workerFactory = vi.fn(() => new FakeWorker((message, worker) => {
			void handleQmcDecryptRequest(message, response => worker.emit(response), decryptor)
		}))
		const controller = createMusicImportController({ workerFactory })
		const file = new File([musicExFixture()], 'sample.mflac')
		const [result] = await controller.prepareFiles([file])
		expect(result).toMatchObject({ ok: false, error: { code: 'QMC_KEY_REQUIRED' } })
		expect(workerFactory).toHaveBeenCalledOnce()
		expect(decryptor).not.toHaveBeenCalled()
	})

	it('loads a key file in memory and sends the File plus exact-key map to the Worker', async () => {
		let request: QmcWorkerRequest | undefined
		const controller = createMusicImportController({
			workerFactory: () => new FakeWorker((message, worker) => {
				request = message
				queueMicrotask(() => worker.emit({
					type: 'success',
					id: message.id,
					buffer: ascii('fLaCconverted').buffer,
					songId: '705944328',
					usedMediaKey: true,
				}))
			}),
		})
		const count = await controller.loadKeyFile(new File([JSON.stringify({
			version: 1,
			source: 'qqmusic-mmkv',
			keys: { 'F0M0000HJUZs40wWgK.mflac': sampleEkey },
		})], 'qqmusic-qmc-keys.json', { type: 'application/json' }))
		expect(count).toBe(1)
		expect(controller.keyCount.value).toBe(1)
		const [result] = await controller.prepareFiles([new File([musicExFixture()], 'sample.mflac')])
		expect(result).toMatchObject({ ok: true, prepared: { outputExtension: 'flac' } })
		expect(request?.file.name).toBe('sample.mflac')
		expect(request?.mediaKeys).toEqual([['F0M0000HJUZs40wWgK.mflac', sampleEkey]])
		controller.clearMediaKeys()
		expect(controller.keyCount.value).toBe(0)
	})

	it('forwards the media key to the decryptor without including it in responses', async () => {
		const responses: QmcWorkerResponse[] = []
		const decryptor = vi.fn(async () => ({ bytes: ascii('OggS\u0000'), songId: '1' }))
		await handleQmcDecryptRequest({
			type: 'decrypt',
			id: 'musicex-task',
			fileName: 'sample.mgg',
			inputExtension: 'mgg',
			file: new File([musicExFixture()], 'sample.mgg'),
			mediaKeys: [['F0M0000HJUZs40wWgK.mflac', sampleEkey]],
		}, response => responses.push(response), decryptor)
		expect(decryptor).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'mgg', expect.any(Function), undefined, sampleEkey)
		expect(responses).toContainEqual(expect.objectContaining({ type: 'success', usedMediaKey: true }))
		expect(JSON.stringify(responses)).not.toContain(sampleEkey)
	})
})
