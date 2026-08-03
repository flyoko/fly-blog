import type { QmcDecryptOutput, QmcDecryptProgress } from './types'
import { buildSyntheticQTag, parseMusicExFooter } from './musicex'
import { MusicImportError } from './types'

export const qmcDecryptChunkBytes = 2 * 1024 * 1024

export interface QmcCryptoModule {
	HEAPU8: Uint8Array
	_malloc: (size: number) => number
	_free: (pointer: number) => void
	writeArrayToMemory: (data: Uint8Array, pointer: number) => void
	preDec: (pointer: number, size: number, extension: string) => number
	decBlob: (pointer: number, size: number, offset: number) => number
	getErr: () => string
	getSongId: () => string
}

export type QmcModuleFactory = () => Promise<QmcCryptoModule>

async function defaultModuleFactory(): Promise<QmcCryptoModule> {
	try {
		const module = await import('@xhacker/qmcwasm/QmcWasmBundle.js')
		return await module.default()
	}
	catch (cause) {
		throw new MusicImportError('WASM_LOAD_FAILED', '本地解密组件加载失败，请刷新后重试。', { cause })
	}
}

function merge(parts: Uint8Array[], totalBytes: number) {
	const output = new Uint8Array(totalBytes)
	let offset = 0
	for (const part of parts) {
		output.set(part, offset)
		offset += part.byteLength
	}
	return output
}

export async function decryptQmc(
	input: ArrayBuffer,
	inputExtension: string,
	onProgress?: (progress: QmcDecryptProgress) => void,
	moduleFactory: QmcModuleFactory = defaultModuleFactory,
	mediaKey?: string,
): Promise<QmcDecryptOutput> {
	let crypto: QmcCryptoModule
	try {
		crypto = await moduleFactory()
	}
	catch (cause) {
		if (cause instanceof MusicImportError)
			throw cause
		throw new MusicImportError('WASM_LOAD_FAILED', '本地解密组件加载失败，请刷新后重试。', { cause })
	}

	const source = new Uint8Array(input)
	let pointer: number | null = null
	try {
		pointer = crypto._malloc(qmcDecryptChunkBytes)
		if (!pointer)
			throw new MusicImportError('WASM_LOAD_FAILED', '本地解密组件无法分配内存。')

		const musicEx = parseMusicExFooter(source)
		let encryptedBytes: number
		let preDecBytes: Uint8Array
		if (musicEx) {
			if (!mediaKey) {
				throw new MusicImportError(
					'QMC_KEY_REQUIRED',
					`该 MusicEx 文件需要本机密钥包中的精确媒体密钥：${musicEx.mediaFileName}`,
				)
			}
			preDecBytes = buildSyntheticQTag(mediaKey, musicEx.songId)
			encryptedBytes = musicEx.audioBytes
		}
		else {
			const tailBufferSize = Math.min(qmcDecryptChunkBytes, source.byteLength)
			preDecBytes = source.subarray(source.byteLength - tailBufferSize)
			encryptedBytes = source.byteLength
		}

		crypto.writeArrayToMemory(preDecBytes, pointer)
		let tailSize: number
		try {
			tailSize = crypto.preDec(pointer, preDecBytes.byteLength, `.${inputExtension.toLowerCase().replace(/^\./u, '')}`)
		}
		catch (cause) {
			throw new MusicImportError(
				musicEx ? 'QMC_KEY_MISMATCH' : 'UNSUPPORTED_QMC_VARIANT',
				musicEx ? '本地媒体密钥与该 MusicEx 文件不匹配。' : '该文件版本暂不受支持。',
				{ cause },
			)
		}
		const maxTailSize = musicEx ? preDecBytes.byteLength : source.byteLength
		if (tailSize < 0 || tailSize > maxTailSize) {
			throw new MusicImportError(
				musicEx ? 'QMC_KEY_MISMATCH' : 'UNSUPPORTED_QMC_VARIANT',
				musicEx ? '本地媒体密钥与该 MusicEx 文件不匹配。' : '该文件版本暂不受支持。',
			)
		}
		if (!musicEx)
			encryptedBytes -= tailSize
		const parts: Uint8Array[] = []
		let outputBytes = 0
		let offset = 0
		while (offset < encryptedBytes) {
			const blockSize = Math.min(qmcDecryptChunkBytes, encryptedBytes - offset)
			crypto.writeArrayToMemory(source.subarray(offset, offset + blockSize), pointer)
			let decryptedSize: number
			try {
				decryptedSize = crypto.decBlob(pointer, blockSize, offset)
			}
			catch (cause) {
				throw new MusicImportError('DECRYPT_FAILED', '本地解密失败，请确认文件完整后重试。', { cause })
			}
			if (!Number.isSafeInteger(decryptedSize) || decryptedSize < 0 || decryptedSize > blockSize) {
				throw new MusicImportError('DECRYPT_FAILED', '本地解密返回了无效数据。')
			}
			const part = crypto.HEAPU8.slice(pointer, pointer + decryptedSize)
			parts.push(part)
			outputBytes += part.byteLength
			offset += blockSize
			onProgress?.({ processedBytes: offset, totalBytes: encryptedBytes })
		}

		const songId = crypto.getSongId()
		return {
			bytes: merge(parts, outputBytes),
			songId: songId && songId !== '0' ? songId : null,
		}
	}
	finally {
		if (pointer !== null)
			crypto._free(pointer)
	}
}
