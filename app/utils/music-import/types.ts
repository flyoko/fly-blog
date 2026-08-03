export type SupportedAudioExtension = 'mp3' | 'ogg' | 'flac' | 'wav' | 'm4a'

export interface DetectedAudio {
	extension: SupportedAudioExtension
	mime: 'audio/mpeg' | 'audio/ogg' | 'audio/flac' | 'audio/wav' | 'audio/mp4'
}

export type QmcImportErrorCode
	= | 'UNSUPPORTED_EXTENSION'
		| 'FILE_TOO_LARGE'
		| 'WASM_LOAD_FAILED'
		| 'UNSUPPORTED_QMC_VARIANT'
		| 'QMC_KEY_REQUIRED'
		| 'QMC_KEY_MISMATCH'
		| 'INVALID_KEY_BUNDLE'
		| 'DECRYPT_FAILED'
		| 'OUTPUT_SIGNATURE_INVALID'
		| 'CANCELLED'

export class MusicImportError extends Error {
	readonly code: QmcImportErrorCode

	constructor(code: QmcImportErrorCode, message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'MusicImportError'
		this.code = code
	}
}

export interface QmcFormatDefinition {
	inputExtension: string
	fallbackOutputExtension: 'mp3' | 'ogg' | 'flac'
	expectedOutputExtension?: 'ogg' | 'flac'
}

export interface QmcDecryptProgress {
	processedBytes: number
	totalBytes: number
}

export interface QmcDecryptOutput {
	bytes: Uint8Array
	songId: string | null
}

export interface QmcWorkerRequest {
	type: 'decrypt'
	id: string
	fileName: string
	inputExtension: string
	file: File
	mediaKeys?: Array<[string, string]>
}

export type QmcWorkerResponse
	= | { type: 'stage', id: string, stage: 'decrypting' }
		| { type: 'progress', id: string, processedBytes: number, totalBytes: number }
		| { type: 'success', id: string, buffer: ArrayBuffer, songId: string | null, usedMediaKey: boolean }
		| { type: 'error', id: string, code: QmcImportErrorCode, message: string }

export interface PreparedMusicFile {
	originalName: string
	file: File
	converted: boolean
	outputExtension: SupportedAudioExtension
}

export interface MusicImportFileResult {
	originalName: string
	ok: boolean
	prepared?: PreparedMusicFile
	error?: { code: QmcImportErrorCode, message: string }
}

export const maxMusicFileBytes = 80 * 1024 * 1024
export const maxMusicBatchBytes = 100 * 1024 * 1024
