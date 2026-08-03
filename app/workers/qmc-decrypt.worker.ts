import type {
	QmcDecryptOutput,
	QmcDecryptProgress,
	QmcWorkerRequest,
	QmcWorkerResponse,
} from '../utils/music-import/types'
import { parseMusicExFooter } from '../utils/music-import/musicex'
import { normalizeQmcMediaFileName } from '../utils/music-import/qmc-key-file'
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
		const mediaKey = musicEx
			? new Map(request.mediaKeys ?? []).get(normalizeQmcMediaFileName(musicEx.mediaFileName))
			: undefined
		if (musicEx && !mediaKey) {
			throw new MusicImportError(
				'QMC_KEY_REQUIRED',
				`缺少该 MusicEx 文件的本机媒体密钥：${musicEx.mediaFileName}`,
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
