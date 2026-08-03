import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import process from 'node:process'
import { detectStandardAudio } from '../app/utils/music-import/audio-signatures'
import { parseMusicExFooter } from '../app/utils/music-import/musicex'
import { fileExtension, getQmcFormat } from '../app/utils/music-import/qmc-formats'
import { normalizeQmcMediaFileName, parseQmcKeyFile } from '../app/utils/music-import/qmc-key-file'
import { decryptQmc } from '../app/utils/music-import/qmc-wasm'
import { MusicImportError } from '../app/utils/music-import/types'

interface VerificationResult {
	file: string
	inputBytes: number
	status: 'success' | 'unsupported' | 'key_required' | 'failed'
	outputBytes?: number
	outputExtension?: string
	errorCode?: string
}

interface Arguments {
	keyFilePath?: string
	samplePaths: string[]
}

function parseArguments(args: string[]): Arguments {
	const samplePaths: string[] = []
	let keyFilePath: string | undefined
	for (let index = 0; index < args.length; index++) {
		const argument = args[index]!
		if (argument === '--key-file') {
			keyFilePath = args[index + 1]
			if (!keyFilePath)
				throw new Error('--key-file 后必须提供密钥文件路径。')
			index++
			continue
		}
		if (argument.startsWith('--key-file=')) {
			keyFilePath = argument.slice('--key-file='.length)
			if (!keyFilePath)
				throw new Error('--key-file 后必须提供密钥文件路径。')
			continue
		}
		if (argument.startsWith('-'))
			throw new Error(`未知参数：${argument}`)
		samplePaths.push(argument)
	}
	return { keyFilePath, samplePaths }
}

async function loadMediaKeys(path?: string) {
	if (!path)
		return new Map<string, string>()
	const input = await readFile(path)
	return parseQmcKeyFile(new File([input], basename(path)))
}

async function verify(path: string, mediaKeys: Map<string, string>): Promise<VerificationResult> {
	const file = basename(path)
	const input = await readFile(path)
	const format = getQmcFormat(file)
	const extension = fileExtension(file)
	if (!format || !extension) {
		return { file, inputBytes: input.byteLength, status: 'unsupported', errorCode: 'UNSUPPORTED_EXTENSION' }
	}

	try {
		const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
		const musicEx = parseMusicExFooter(bytes)
		const mediaKey = musicEx
			? mediaKeys.get(normalizeQmcMediaFileName(musicEx.mediaFileName))
			: undefined
		if (musicEx && !mediaKey) {
			return {
				file,
				inputBytes: input.byteLength,
				status: 'key_required',
				errorCode: 'QMC_KEY_REQUIRED',
			}
		}

		const result = await decryptQmc(
			input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer,
			extension,
			undefined,
			undefined,
			mediaKey,
		)
		const detected = detectStandardAudio(result.bytes)
		if (!detected)
			throw new MusicImportError('OUTPUT_SIGNATURE_INVALID', '解密结果不是标准音频。')
		if (format.expectedOutputExtension && detected.extension !== format.expectedOutputExtension) {
			throw new MusicImportError(
				'OUTPUT_SIGNATURE_INVALID',
				`输出格式 ${detected.extension} 与预期 ${format.expectedOutputExtension} 不一致。`,
			)
		}
		return {
			file,
			inputBytes: input.byteLength,
			status: 'success',
			outputBytes: result.bytes.byteLength,
			outputExtension: detected.extension,
		}
	}
	catch (cause) {
		if (cause instanceof MusicImportError) {
			return {
				file,
				inputBytes: input.byteLength,
				status: cause.code === 'UNSUPPORTED_QMC_VARIANT'
					? 'unsupported'
					: cause.code === 'QMC_KEY_REQUIRED'
						? 'key_required'
						: 'failed',
				errorCode: cause.code,
			}
		}
		throw cause
	}
}

try {
	const { keyFilePath, samplePaths } = parseArguments(process.argv.slice(2))
	if (!samplePaths.length) {
		console.error('用法：pnpm verify:qmc-samples -- [--key-file <MMKV或JSON密钥文件>] <样本.mflac> <样本.mgg>')
		process.exitCode = 2
	}
	else {
		const mediaKeys = await loadMediaKeys(keyFilePath)
		const results = await Promise.all(samplePaths.map(path => verify(path, mediaKeys)))
		for (const result of results)
			console.log(JSON.stringify(result))
		if (results.some(result => result.status === 'failed'))
			process.exitCode = 1
	}
}
catch (cause) {
	const error = cause instanceof MusicImportError
		? { code: cause.code, message: cause.message }
		: { code: 'VERIFY_ARGUMENT_FAILED', message: cause instanceof Error ? cause.message : '样本验证失败。' }
	console.error(JSON.stringify({ status: 'failed', errorCode: error.code, message: error.message }))
	process.exitCode = 2
}
