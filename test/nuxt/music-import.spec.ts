import type { QmcCryptoModule } from '../../app/utils/music-import/qmc-wasm'
import type { QmcWorkerRequest, QmcWorkerResponse } from '../../app/utils/music-import/types'
import { describe, expect, it, vi } from 'vitest'
import { createMusicImportController } from '../../app/composables/useMusicImport'
import { detectStandardAudio, sanitizeAudioFileName } from '../../app/utils/music-import/audio-signatures'
import { getQmcFormat } from '../../app/utils/music-import/qmc-formats'

import { decryptQmc, qmcDecryptChunkBytes } from '../../app/utils/music-import/qmc-wasm'
import { MusicImportError } from '../../app/utils/music-import/types'
import { handleQmcDecryptRequest } from '../../app/workers/qmc-decrypt.worker'

function ascii(value: string) {
	return new TextEncoder().encode(value)
}

function m4a(brand = 'M4A ') {
	return new Uint8Array([
		0,
		0,
		0,
		24,
		...ascii('ftyp'),
		...ascii(brand),
		0,
		0,
		0,
		0,
		...ascii('isom'),
	])
}

function createFakeModule(options: {
	tailSize?: number
	preDecError?: string
	throwAtOffset?: number
} = {}) {
	const heap = new Uint8Array(qmcDecryptChunkBytes + 64)
	const free = vi.fn()
	const offsets: number[] = []
	const writes: Uint8Array[] = []
	const module: QmcCryptoModule = {
		HEAPU8: heap,
		_malloc: vi.fn(() => 16),
		_free: free,
		writeArrayToMemory: vi.fn((data, pointer) => {
			writes.push(new Uint8Array(data))
			heap.set(data, pointer)
		}),
		preDec: vi.fn(() => options.tailSize ?? 4),
		decBlob: vi.fn((pointer, size, offset) => {
			offsets.push(offset)
			if (options.throwAtOffset === offset)
				throw new Error('block failure')
			heap.fill(offset % 251, pointer, pointer + size)
			return size
		}),
		getErr: vi.fn(() => options.preDecError ?? 'unsupported tail'),
		getSongId: vi.fn(() => '12345'),
	}
	return { module, free, offsets, writes }
}

describe('qMCv2 format registry', () => {
	it.each([
		['song.mflac', 'flac'],
		['song.MFLAC0', 'flac'],
		['song.mgg', 'ogg'],
		['song.mgg0', 'ogg'],
		['song.mgg1', 'ogg'],
		['song.mggl', 'ogg'],
		['song.qmc0', 'mp3'],
		['song.qmc2', 'ogg'],
		['song.qmc3', 'mp3'],
		['song.qmc4', 'ogg'],
		['song.qmc6', 'ogg'],
		['song.qmc8', 'ogg'],
		['song.qmcflac', 'flac'],
		['song.qmcogg', 'ogg'],
	])('maps %s to %s', (name, extension) => {
		expect(getQmcFormat(name)).toMatchObject({ fallbackOutputExtension: extension })
	})

	it.each(['song.ncm', 'song.kwm', 'song.kgm', 'song.tm0', 'song.bkcflac', 'song', '.mgg'])('does not route %s to QMCv2', (name) => {
		expect(getQmcFormat(name)).toBeNull()
	})
})

describe('standard audio signatures', () => {
	it.each([
		['mp3 id3', ascii('ID3\u0004\u0000\u0000'), 'mp3', 'audio/mpeg'],
		['mp3 frame', new Uint8Array([0xFF, 0xFB, 0x90, 0x64]), 'mp3', 'audio/mpeg'],
		['ogg', ascii('OggS\u0000'), 'ogg', 'audio/ogg'],
		['flac', ascii('fLaC\u0000'), 'flac', 'audio/flac'],
		['wav', new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')]), 'wav', 'audio/wav'],
		['m4a', m4a(), 'm4a', 'audio/mp4'],
		['m4a compatible brand', new Uint8Array([
			0,
			0,
			0,
			24,
			...ascii('ftyp'),
			...ascii('zzzz'),
			0,
			0,
			0,
			0,
			...ascii('M4A '),
		]), 'm4a', 'audio/mp4'],
	])('detects %s', (_label, bytes, extension, mime) => {
		expect(detectStandardAudio(bytes)).toEqual({ extension, mime })
	})

	it.each([
		new Uint8Array(),
		new Uint8Array([1, 2, 3]),
		new Uint8Array([0, 0, 0, 16, ...ascii('ftyp'), ...ascii('avc1'), 0, 0, 0, 0]),
		ascii('fLa'),
	])('rejects invalid or incomplete bytes', (bytes) => {
		expect(detectStandardAudio(bytes)).toBeNull()
	})

	it('sanitizes path/control characters and replaces the extension', () => {
		expect(sanitizeAudioFileName('../bad\\name\u0000.mgg...', 'ogg')).toBe('..-bad-name.ogg')
		expect(sanitizeAudioFileName('   .mflac', 'flac')).toBe('audio.flac')
	})
})

describe('qMC WASM wrapper', () => {
	it('decrypts in 2 MiB blocks with original offsets and frees memory', async () => {
		const input = new Uint8Array(qmcDecryptChunkBytes + 17)
		input.fill(9)
		const { module, free, offsets, writes } = createFakeModule({ tailSize: 4 })
		const progress: number[] = []
		const result = await decryptQmc(input.buffer, 'mgg', item => progress.push(item.processedBytes), async () => module)

		expect(result.bytes.byteLength).toBe(input.byteLength - 4)
		expect(result.songId).toBe('12345')
		expect(offsets).toEqual([0, qmcDecryptChunkBytes])
		const expectedFirstWrite = input.slice(-qmcDecryptChunkBytes)
		expect(writes[0].byteLength).toBe(expectedFirstWrite.byteLength)
		expect(writes[0].every((byte, index) => byte === expectedFirstWrite[index])).toBe(true)
		expect(progress.at(-1)).toBe(input.byteLength - 4)
		expect(progress).toEqual([...progress].sort((left, right) => left - right))
		expect(free).toHaveBeenCalledOnce()
	}, 120_000)

	it('maps module initialization failures without attempting decryption', async () => {
		await expect(decryptQmc(
			new Uint8Array(128).buffer,
			'mflac',
			undefined,
			async () => { throw new Error('module unavailable') },
		))
			.rejects
			.toMatchObject({ code: 'WASM_LOAD_FAILED' })
	})

	it('maps unsupported tails and still frees memory', async () => {
		const { module, free } = createFakeModule({ tailSize: -1, preDecError: 'unknown footer' })
		await expect(decryptQmc(new Uint8Array(128).buffer, 'mflac', undefined, async () => module))
			.rejects
			.toMatchObject({ code: 'UNSUPPORTED_QMC_VARIANT' })
		expect(free).toHaveBeenCalledOnce()
	})

	it('rejects an unrecognized MusicEx footer before producing garbage output', async () => {
		const input = new Uint8Array(128)
		input.set(ascii('musicex\u0000'), input.length - 8)
		const { module, free } = createFakeModule({ tailSize: 0 })
		await expect(decryptQmc(input.buffer, 'mgg', undefined, async () => module))
			.rejects
			.toMatchObject({ code: 'UNSUPPORTED_QMC_VARIANT' })
		expect(module.decBlob).not.toHaveBeenCalled()
		expect(free).toHaveBeenCalledOnce()
	})

	it('maps block failures and still frees memory', async () => {
		const { module, free } = createFakeModule({ tailSize: 0, throwAtOffset: 0 })
		await expect(decryptQmc(new Uint8Array(128).buffer, 'mgg', undefined, async () => module))
			.rejects
			.toBeInstanceOf(MusicImportError)
		expect(free).toHaveBeenCalledOnce()
	})
})

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

describe('qMC Worker protocol', () => {
	it('emits progress and transfers a successful result', async () => {
		const responses: QmcWorkerResponse[] = []
		const transfers: Transferable[][] = []
		await handleQmcDecryptRequest({
			type: 'decrypt',
			id: 'task-1',
			fileName: 'track.mgg',
			inputExtension: 'mgg',
			file: new File([new Uint8Array([1, 2, 3])], 'track.mgg'),
		}, (response, transfer = []) => {
			responses.push(response)
			transfers.push(transfer)
		}, async (_buffer, _extension, progress) => {
			progress?.({ processedBytes: 2, totalBytes: 3 })
			return { bytes: ascii('OggS\u0000'), songId: '9' }
		})
		expect(responses[0]).toMatchObject({ type: 'stage', stage: 'decrypting' })
		expect(responses[1]).toMatchObject({ type: 'progress', processedBytes: 2, totalBytes: 3 })
		expect(responses[2]).toMatchObject({ type: 'success', songId: '9', usedMediaKey: false })
		expect(transfers[2]).toHaveLength(1)
	})

	it('maps unexpected failures to a stable error response', async () => {
		const responses: QmcWorkerResponse[] = []
		await handleQmcDecryptRequest({
			type: 'decrypt',
			id: 'task-2',
			fileName: 'track.mgg',
			inputExtension: 'mgg',
			file: new File([new Uint8Array([1])], 'track.mgg'),
		}, response => responses.push(response), async () => {
			throw new Error('secret internals')
		})
		expect(responses).toEqual([
			{ type: 'stage', id: 'task-2', stage: 'decrypting' },
			{
				type: 'error',
				id: 'task-2',
				code: 'DECRYPT_FAILED',
				message: '本地解密失败，请确认文件完整后重试。',
			},
		])
	})
})

describe('music import controller', () => {
	it('passes verified standard audio through without creating a Worker', async () => {
		const workerFactory = vi.fn()
		const controller = createMusicImportController({ workerFactory })
		const file = new File([ascii('ID3\u0004\u0000\u0000')], 'plain.mp3', { type: 'application/octet-stream' })
		const results = await controller.prepareFiles([file])
		expect(results).toMatchObject([{
			originalName: 'plain.mp3',
			ok: true,
			prepared: { converted: false, outputExtension: 'mp3' },
		}])
		expect(results[0]!.prepared!.file).toBe(file)
		expect(workerFactory).not.toHaveBeenCalled()
	})

	it('cancels a standard audio batch while its signature is being read', async () => {
		let finishRead!: (buffer: ArrayBuffer) => void
		const signatureRead = new Promise<ArrayBuffer>((resolve) => {
			finishRead = resolve
		})
		const slice = vi.fn(() => ({
			arrayBuffer: () => signatureRead,
		}) as Blob)
		const file = {
			name: 'plain.mp3',
			size: 8,
			slice,
		} as unknown as File
		const controller = createMusicImportController()
		const promise = controller.prepareFiles([file])

		await vi.waitFor(() => expect(slice).toHaveBeenCalledOnce())
		controller.cancel()
		finishRead(ascii('ID3\u0004\u0000\u0000').buffer as ArrayBuffer)

		await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' })
	})

	it('decrypts QMC sequentially, validates output, and rebuilds a standard File', async () => {
		const workers: FakeWorker[] = []
		const controller = createMusicImportController({
			workerFactory: () => {
				const worker = new FakeWorker((message, current) => {
					queueMicrotask(() => {
						current.emit({ type: 'progress', id: message.id, processedBytes: 1, totalBytes: 2 })
						const output = ascii('OggS\u0000converted').buffer
						current.emit({ type: 'success', id: message.id, buffer: output, songId: '123', usedMediaKey: false })
					})
				})
				workers.push(worker)
				return worker
			},
		})
		const first = new File([new Uint8Array([7, 8])], '../first.mgg')
		const second = new File([new Uint8Array([9, 10])], 'second.mgg')
		const results = await controller.prepareFiles([first, second])
		expect(results.every(result => result.ok)).toBe(true)
		expect(results.map(result => result.prepared?.file.name)).toEqual(['..-first.ogg', 'second.ogg'])
		expect(results.map(result => result.prepared?.file.type)).toEqual(['audio/ogg', 'audio/ogg'])
		expect(workers).toHaveLength(2)
		expect(workers[0]!.postMessage.mock.calls[0]![0].file).toBe(first)
		expect(workers[0]!.postMessage.mock.calls[0]![1]).toEqual([])
		expect(workers.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true)
		expect(controller.progress.value['second.mgg']).toBe(100)
	})

	it('enforces FLAC for mflac and OGG for mgg while trusting qmc output signatures', async () => {
		const controller = createMusicImportController({
			workerFactory: () => new FakeWorker((message, worker) => queueMicrotask(() => {
				const output = message.inputExtension === 'mgg'
					? ascii('fLaCwrong-container')
					: ascii('OggS\u0000detected-output')
				worker.emit({ type: 'success', id: message.id, buffer: output.buffer, songId: null, usedMediaKey: false })
			})),
		})
		const results = await controller.prepareFiles([
			new File([new Uint8Array([1])], 'wrong.mflac'),
			new File([new Uint8Array([2])], 'wrong.mgg'),
			new File([new Uint8Array([3])], 'detected.qmc0'),
		])

		expect(results[0]).toMatchObject({ ok: false, error: { code: 'OUTPUT_SIGNATURE_INVALID' } })
		expect(results[1]).toMatchObject({ ok: false, error: { code: 'OUTPUT_SIGNATURE_INVALID' } })
		expect(results[2]).toMatchObject({
			ok: true,
			prepared: { outputExtension: 'ogg', converted: true },
		})
	})

	it('maps invalid keyed output to QMC_KEY_MISMATCH', async () => {
		const controller = createMusicImportController({
			workerFactory: () => new FakeWorker((message, worker) => queueMicrotask(() => {
				worker.emit({
					type: 'success',
					id: message.id,
					buffer: ascii('OggS\u0000wrong-key-output').buffer,
					songId: null,
					usedMediaKey: true,
				})
			})),
		})
		const [result] = await controller.prepareFiles([
			new File([new Uint8Array([1])], 'keyed.mflac'),
		])
		expect(result).toMatchObject({ ok: false, error: { code: 'QMC_KEY_MISMATCH' } })
	})

	it('keeps per-file failures isolated and never prepares invalid decrypted output', async () => {
		const controller = createMusicImportController({
			workerFactory: () => new FakeWorker((message, worker) => queueMicrotask(() => {
				worker.emit({ type: 'success', id: message.id, buffer: new Uint8Array([1, 2, 3]).buffer, songId: null, usedMediaKey: false })
			})),
		})
		const results = await controller.prepareFiles([
			new File([new Uint8Array([7])], 'broken.mflac'),
			new File([ascii('OggS\u0000')], 'plain.ogg'),
			new File([new Uint8Array([1])], 'unknown.ncm'),
		])
		expect(results[0]).toMatchObject({ ok: false, error: { code: 'OUTPUT_SIGNATURE_INVALID' } })
		expect(results[1]).toMatchObject({ ok: true, prepared: { converted: false } })
		expect(results[2]).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_EXTENSION' } })
	})

	it('rejects an oversized file before reading it', async () => {
		const arrayBuffer = vi.fn()
		const oversized = {
			name: 'huge.mgg',
			size: 80 * 1024 * 1024 + 1,
			slice: vi.fn(),
			arrayBuffer,
		} as unknown as File
		const controller = createMusicImportController()
		const results = await controller.prepareFiles([oversized])
		expect(results[0]).toMatchObject({ ok: false, error: { code: 'FILE_TOO_LARGE' } })
		expect(arrayBuffer).not.toHaveBeenCalled()
	})

	it('rejects a batch over 100 MiB before reading or decrypting files', async () => {
		const workerFactory = vi.fn()
		const firstRead = vi.fn()
		const secondRead = vi.fn()
		const first = {
			name: 'first.mgg',
			size: 60 * 1024 * 1024,
			slice: vi.fn(),
			arrayBuffer: firstRead,
		} as unknown as File
		const second = {
			name: 'second.mgg',
			size: 50 * 1024 * 1024,
			slice: vi.fn(),
			arrayBuffer: secondRead,
		} as unknown as File
		const controller = createMusicImportController({ workerFactory })

		await expect(controller.prepareFiles([first, second]))
			.rejects
			.toMatchObject({ code: 'FILE_TOO_LARGE' })
		expect(firstRead).not.toHaveBeenCalled()
		expect(secondRead).not.toHaveBeenCalled()
		expect(workerFactory).not.toHaveBeenCalled()
	})

	it('cancels the whole active batch and terminates the Worker', async () => {
		let worker: FakeWorker | undefined
		const controller = createMusicImportController({
			workerFactory: () => {
				worker = new FakeWorker(() => {})
				return worker
			},
		})
		const promise = controller.prepareFiles([
			new File([new Uint8Array([1])], 'first.mgg'),
			new File([new Uint8Array([2])], 'second.mgg'),
		])
		await vi.waitFor(() => expect(worker?.postMessage).toHaveBeenCalledOnce())
		controller.cancel()
		await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' })
		expect(worker?.terminate).toHaveBeenCalledOnce()
		expect(controller.stage.value).toBe('idle')
	})
})
