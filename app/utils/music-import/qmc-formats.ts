import type { QmcFormatDefinition } from './types'

const definitions: Record<string, QmcFormatDefinition> = {
	mflac: { inputExtension: 'mflac', fallbackOutputExtension: 'flac', expectedOutputExtension: 'flac' },
	mflac0: { inputExtension: 'mflac0', fallbackOutputExtension: 'flac', expectedOutputExtension: 'flac' },
	mgg: { inputExtension: 'mgg', fallbackOutputExtension: 'ogg', expectedOutputExtension: 'ogg' },
	mgg0: { inputExtension: 'mgg0', fallbackOutputExtension: 'ogg', expectedOutputExtension: 'ogg' },
	mgg1: { inputExtension: 'mgg1', fallbackOutputExtension: 'ogg', expectedOutputExtension: 'ogg' },
	mggl: { inputExtension: 'mggl', fallbackOutputExtension: 'ogg', expectedOutputExtension: 'ogg' },
	qmc0: { inputExtension: 'qmc0', fallbackOutputExtension: 'mp3' },
	qmc2: { inputExtension: 'qmc2', fallbackOutputExtension: 'ogg' },
	qmc3: { inputExtension: 'qmc3', fallbackOutputExtension: 'mp3' },
	qmc4: { inputExtension: 'qmc4', fallbackOutputExtension: 'ogg' },
	qmc6: { inputExtension: 'qmc6', fallbackOutputExtension: 'ogg' },
	qmc8: { inputExtension: 'qmc8', fallbackOutputExtension: 'ogg' },
	qmcflac: { inputExtension: 'qmcflac', fallbackOutputExtension: 'flac' },
	qmcogg: { inputExtension: 'qmcogg', fallbackOutputExtension: 'ogg' },
}

export const qmcInputExtensions = Object.freeze(Object.keys(definitions))

export function fileExtension(fileName: string): string | null {
	const trimmed = fileName.trim()
	const dot = trimmed.lastIndexOf('.')
	if (dot <= 0 || dot === trimmed.length - 1)
		return null
	return trimmed.slice(dot + 1).toLowerCase()
}

export function getQmcFormat(fileName: string): QmcFormatDefinition | null {
	const extension = fileExtension(fileName)
	return extension ? definitions[extension] ?? null : null
}

export const musicAudioAccept = [
	'audio/mpeg',
	'audio/ogg',
	'audio/wav',
	'audio/flac',
	'audio/mp4',
	'.m4a',
	...qmcInputExtensions.map(extension => `.${extension}`),
].join(',')
