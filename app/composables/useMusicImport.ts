import type { Ref } from 'vue'
import type {
	MusicImportFileResult,
	PreparedMusicFile,
	QmcWorkerRequest,
	QmcWorkerResponse,
} from '../utils/music-import/types'
import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue'
import { audioSignatureBytes, detectStandardAudio, sanitizeAudioFileName } from '../utils/music-import/audio-signatures'
import { getQmcFormat } from '../utils/music-import/qmc-formats'
import { parseQmcKeyFile } from '../utils/music-import/qmc-key-file'
import { maxMusicBatchBytes, maxMusicFileBytes, maxQmcKeyFileBytes, MusicImportError } from '../utils/music-import/types'

export type MusicImportStage = 'idle' | 'parsing' | 'decrypting'

export interface MusicImportWorker {
	onmessage: ((event: MessageEvent<QmcWorkerResponse>) => void) | null
	onerror: ((event: ErrorEvent) => void) | null
	postMessage: (message: QmcWorkerRequest, transfer: Transferable[]) => void
	terminate: () => void
}

export interface MusicImportKeyStore {
	keyCount: Ref<number>
	mediaKeys: Map<string, string>
}

export interface MusicImportControllerOptions {
	workerFactory?: () => MusicImportWorker
	createTaskId?: () => string
	keyStore?: MusicImportKeyStore
}

export function createMusicImportKeyStore(): MusicImportKeyStore {
	return {
		keyCount: ref(0),
		mediaKeys: new Map<string, string>(),
	}
}

const clientMusicImportKeyStore = createMusicImportKeyStore()

function defaultWorkerFactory(): MusicImportWorker {
	if (!import.meta.client)
		throw new MusicImportError('WASM_LOAD_FAILED', '本地解密只能在浏览器后台中运行。')
	return new Worker(new URL('../workers/qmc-decrypt.worker.ts', import.meta.url), { type: 'module' })
}

function errorResult(fileName: string, cause: unknown): MusicImportFileResult {
	const error = cause instanceof MusicImportError
		? cause
		: new MusicImportError('DECRYPT_FAILED', '本地处理失败，请重试。')
	return {
		originalName: fileName,
		ok: false,
		error: { code: error.code, message: error.message },
	}
}

export function createMusicImportController(options: MusicImportControllerOptions = {}) {
	const activeFileName = ref<string | null>(null)
	const stage = ref<MusicImportStage>('idle')
	const progress = ref<Record<string, number>>({})
	const keyStore = options.keyStore ?? createMusicImportKeyStore()
	const keyCount = keyStore.keyCount
	const workerFactory = options.workerFactory ?? defaultWorkerFactory
	const createTaskId = options.createTaskId ?? (() => crypto.randomUUID())
	let batchVersion = 0
	let running = false
	let activeWorker: MusicImportWorker | null = null
	let rejectActive: ((error: MusicImportError) => void) | null = null

	function terminateActiveWorker() {
		activeWorker?.terminate()
		activeWorker = null
		rejectActive = null
	}

	async function loadKeyFile(file: File) {
		if (file.size > maxQmcKeyFileBytes)
			throw new MusicImportError('INVALID_KEY_BUNDLE', 'QQ 音乐密钥文件不能超过 64 MiB。')
		const parsed = await parseQmcKeyFile(file)
		for (const [fileName, mediaKey] of parsed)
			keyStore.mediaKeys.set(fileName, mediaKey)
		keyCount.value = keyStore.mediaKeys.size
		return keyStore.mediaKeys.size
	}

	function clearMediaKeys() {
		keyStore.mediaKeys.clear()
		keyCount.value = 0
	}

	function cancel() {
		batchVersion++
		const rejection = rejectActive
		activeWorker?.terminate()
		activeWorker = null
		rejectActive = null
		stage.value = 'idle'
		activeFileName.value = null
		rejection?.(new MusicImportError('CANCELLED', '已取消本次音乐文件处理。'))
	}

	async function decryptFile(file: File, inputExtension: string, version: number): Promise<{
		buffer: ArrayBuffer
		usedMediaKey: boolean
	}> {
		stage.value = 'parsing'
		activeFileName.value = file.name
		if (version !== batchVersion)
			throw new MusicImportError('CANCELLED', '已取消本次音乐文件处理。')

		const worker = workerFactory()
		activeWorker = worker
		const id = createTaskId()
		return await new Promise<{ buffer: ArrayBuffer, usedMediaKey: boolean }>((resolve, reject) => {
			let settled = false
			const finish = () => {
				if (settled)
					return false
				settled = true
				worker.terminate()
				if (activeWorker === worker)
					activeWorker = null
				if (rejectActive === reject)
					rejectActive = null
				return true
			}
			rejectActive = reject
			worker.onmessage = (event) => {
				const response = event.data
				if (response.id !== id || settled)
					return
				if (response.type === 'stage') {
					stage.value = response.stage
					return
				}
				if (response.type === 'progress') {
					stage.value = 'decrypting'
					const percent = response.totalBytes > 0
						? Math.min(100, Math.round(response.processedBytes / response.totalBytes * 100))
						: 0
					progress.value = {
						...progress.value,
						[file.name]: Math.max(progress.value[file.name] ?? 0, percent),
					}
					return
				}
				if (!finish())
					return
				if (response.type === 'success') {
					progress.value = { ...progress.value, [file.name]: 100 }
					resolve({ buffer: response.buffer, usedMediaKey: response.usedMediaKey })
					return
				}
				reject(new MusicImportError(response.code, response.message))
			}
			worker.onerror = () => {
				if (!finish())
					return
				reject(new MusicImportError('DECRYPT_FAILED', '本地解密线程运行失败，请重试。'))
			}
			const request: QmcWorkerRequest = {
				type: 'decrypt',
				id,
				fileName: file.name,
				inputExtension,
				file,
				mediaKeys: keyStore.mediaKeys.size ? Array.from(keyStore.mediaKeys) : undefined,
			}
			worker.postMessage(request, [])
		})
	}

	async function prepareStandardFile(file: File): Promise<MusicImportFileResult> {
		stage.value = 'parsing'
		activeFileName.value = file.name
		const detected = detectStandardAudio(await audioSignatureBytes(file))
		if (!detected) {
			return errorResult(file.name, new MusicImportError(
				'UNSUPPORTED_EXTENSION',
				'暂不支持该音频格式，请选择 MP3、OGG、FLAC、WAV、M4A 或受支持的 QMCv2 文件。',
			))
		}
		const prepared: PreparedMusicFile = {
			originalName: file.name,
			file,
			converted: false,
			outputExtension: detected.extension,
		}
		return { originalName: file.name, ok: true, prepared }
	}

	async function prepareFiles(files: File[]): Promise<MusicImportFileResult[]> {
		if (running)
			throw new MusicImportError('DECRYPT_FAILED', '已有音乐文件正在处理中。')
		const inputBytes = files.reduce((total, file) => total + file.size, 0)
		if (!Number.isSafeInteger(inputBytes) || inputBytes > maxMusicBatchBytes) {
			throw new MusicImportError(
				'FILE_TOO_LARGE',
				'本次待处理音频总大小不能超过 100 MiB。',
			)
		}
		running = true
		const version = ++batchVersion
		progress.value = {}
		const results: MusicImportFileResult[] = []
		try {
			for (const file of files) {
				if (version !== batchVersion)
					throw new MusicImportError('CANCELLED', '已取消本次音乐文件处理。')
				if (file.size > maxMusicFileBytes) {
					results.push(errorResult(file.name, new MusicImportError('FILE_TOO_LARGE', '单个音频文件不能超过 80 MiB。')))
					continue
				}

				const qmc = getQmcFormat(file.name)
				if (!qmc) {
					const result = await prepareStandardFile(file)
					if (version !== batchVersion)
						throw new MusicImportError('CANCELLED', '已取消本次音乐文件处理。')
					results.push(result)
					continue
				}

				try {
					const decrypted = await decryptFile(file, qmc.inputExtension, version)
					if (version !== batchVersion)
						throw new MusicImportError('CANCELLED', '已取消本次音乐文件处理。')
					const bytes = new Uint8Array(decrypted.buffer)
					const detected = detectStandardAudio(bytes)
					if (!detected || bytes.byteLength === 0) {
						throw new MusicImportError(
							decrypted.usedMediaKey ? 'QMC_KEY_MISMATCH' : 'OUTPUT_SIGNATURE_INVALID',
							decrypted.usedMediaKey
								? '本地媒体密钥与该文件不匹配，未上传任何输出。'
								: '解密结果不是可识别的标准音频，未上传该文件。',
						)
					}
					if (qmc.expectedOutputExtension && detected.extension !== qmc.expectedOutputExtension) {
						throw new MusicImportError(
							decrypted.usedMediaKey ? 'QMC_KEY_MISMATCH' : 'OUTPUT_SIGNATURE_INVALID',
							decrypted.usedMediaKey
								? '本地媒体密钥与该文件不匹配，未上传任何输出。'
								: `解密结果不是预期的 ${qmc.expectedOutputExtension.toUpperCase()} 音频，未上传该文件。`,
						)
					}
					if (bytes.byteLength > maxMusicFileBytes)
						throw new MusicImportError('FILE_TOO_LARGE', '解密后的音频文件超过 80 MiB，未上传。')
					const prepared: PreparedMusicFile = {
						originalName: file.name,
						file: new File([bytes], sanitizeAudioFileName(file.name, detected.extension), { type: detected.mime }),
						converted: true,
						outputExtension: detected.extension,
					}
					results.push({ originalName: file.name, ok: true, prepared })
				}
				catch (cause) {
					if (cause instanceof MusicImportError && cause.code === 'CANCELLED')
						throw cause
					results.push(errorResult(file.name, cause))
				}
			}
			return results
		}
		finally {
			if (version === batchVersion) {
				terminateActiveWorker()
				stage.value = 'idle'
				activeFileName.value = null
			}
			running = false
		}
	}

	return {
		activeFileName: readonly(activeFileName),
		stage: readonly(stage),
		progress: readonly(progress),
		keyCount: readonly(keyCount),
		loadKeyFile,
		clearMediaKeys,
		prepareFiles,
		cancel,
	}
}

export function useMusicImport(options: MusicImportControllerOptions = {}) {
	const keyStore = options.keyStore ?? (import.meta.client
		? clientMusicImportKeyStore
		: createMusicImportKeyStore())
	const controller = createMusicImportController({ ...options, keyStore })
	if (getCurrentScope())
		onScopeDispose(controller.cancel)
	return controller
}
