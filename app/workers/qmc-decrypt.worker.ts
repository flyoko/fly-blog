import type {
	QmcDecryptOutput,
	QmcDecryptProgress,
	QmcWorkerRequest,
	QmcWorkerResponse,
} from '../utils/music-import/types'
import { parseMusicExFooter } from '../utils/music-import/musicex'
import { resolveQmcMediaKey } from '../utils/music-import/qmc-key-file'
import { decryptQmc } from '../utils/music-import/qmc-wasm'
import { MusicImportError } from '../utils/music-import/types'

type DecryptFunction = (
	input: ArrayBuffer,
	inputExtension: string,
	onProgress?: (progress: QmcDecryptProgress) => void,
	moduleFactory?: Parameters<typeof decryptQmc>[3],
	mediaKey?: string,
) => Promise<QmcDecryptOutput>

type ResponseSender = (response: QmcWorkerResponse, transfer?: Transferable[]) => void

export async function handleQmcDecryptRequest(
	request: QmcWorkerRequest,
	send: ResponseSender,
	decrypt: DecryptFunction = decryptQmc,
): Promise<void> {
	try {
		const input = await request.file.arrayBuffer()
		const musicEx = parseMusicExFooter(new Uint8Array(input))
		const mediaKeys = request.mediaKeys ?? []
		const mediaKeyMatch = musicEx ? resolveQmcMediaKey(mediaKeys, musicEx) : null
		const mediaKey = mediaKeyMatch?.mediaKey
		if (musicEx && !mediaKey) {
			const loadedKeyMessage = mediaKeys.length
				? `当前已加载 ${mediaKeys.length} 条本机媒体密钥，但未包含 ${musicEx.mediaFileName}。`
				: `当前尚未加载 ${musicEx.mediaFileName} 对应的本机媒体密钥。`
			throw new MusicImportError(
				'QMC_KEY_REQUIRED',
				`${loadedKeyMessage} MusicEx 文件不能单独解密。只有在你已经有可读取的旧版 MMKV、iOS filenameEkeyMap 或 JSON 密钥包时才能继续；新版 QQ 音乐 Mac 生成的空或加密数据库当前不受支持。也可以改用标准 MP3、FLAC、OGG、WAV 或 M4A 文件。`,
			)
		}

		send({ type: 'stage', id: request.id, stage: 'decrypting' })
		const result = await decrypt(input, request.inputExtension, (progress) => {
			send({
				type: 'progress',
				id: request.id,
				processedBytes: progress.processedBytes,
				totalBytes: progress.totalBytes,
			})
		}, undefined, mediaKey)
		const output = result.bytes.buffer.slice(
			result.bytes.byteOffset,
			result.bytes.byteOffset + result.bytes.byteLength,
		) as ArrayBuffer
		send({
			type: 'success',
			id: request.id,
			buffer: output,
			songId: result.songId,
			usedMediaKey: Boolean(mediaKey),
		}, [output])
	}
	catch (cause) {
		const error = cause instanceof MusicImportError
			? cause
			: new MusicImportError('DECRYPT_FAILED', '本地解密失败，请确认文件完整后重试。')
		send({
			type: 'error',
			id: request.id,
			code: error.code,
			message: error.message,
		})
	}
}

interface WorkerScope {
	onmessage: ((event: MessageEvent<QmcWorkerRequest>) => void) | null
	postMessage: (response: QmcWorkerResponse, transfer?: Transferable[]) => void
	document?: unknown
}

const scope = globalThis as unknown as Partial<WorkerScope>
if (typeof scope.document === 'undefined' && typeof scope.postMessage === 'function') {
	scope.onmessage = (event) => {
		void handleQmcDecryptRequest(event.data, (response, transfer) => {
			scope.postMessage!(response, transfer)
		})
	}
}
