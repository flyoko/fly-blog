import type { MediaUploadPurpose } from '../../../../../shared/admin/media'
import type { PreparedMediaFile } from './media-service'
import { ApiError } from '../../lib/api-error'
import { detectAllowedMedia, maxBytesFor } from './file-signatures'

export const maxMediaFilesPerUpload = 20
export const maxMediaBatchBytes = 100 * 1024 * 1024
const signatureBytes = 16

export async function prepareUploadedFiles(
	files: File[],
	purpose: MediaUploadPurpose,
): Promise<PreparedMediaFile[]> {
	if (files.length === 0)
		throw new ApiError('VALIDATION_FAILED', 400, 'At least one media file is required')
	if (files.length > maxMediaFilesPerUpload)
		throw new ApiError('VALIDATION_FAILED', 400, `At most ${maxMediaFilesPerUpload} media files can be uploaded at once`)

	const totalBytes = files.reduce((total, file) => total + file.size, 0)
	if (!Number.isSafeInteger(totalBytes) || totalBytes > maxMediaBatchBytes)
		throw new ApiError('VALIDATION_FAILED', 400, 'Media upload batch exceeds the total size limit')

	const detected = await Promise.all(files.map(async (file) => {
		const header = new Uint8Array(await file.slice(0, signatureBytes).arrayBuffer())
		const media = detectAllowedMedia(header)
		if (!media)
			throw new ApiError('VALIDATION_FAILED', 400, `Media file signature is not allowed: ${file.name}`)
		if (purpose !== 'music' && media.kind === 'audio')
			throw new ApiError('VALIDATION_FAILED', 400, 'Audio is allowed only for the music library')
		if (file.size > maxBytesFor(media.kind))
			throw new ApiError('VALIDATION_FAILED', 400, `Media file exceeds the ${media.kind} size limit: ${file.name}`)
		return media
	}))

	return Promise.all(files.map(async (file, index) => {
		const bytes = new Uint8Array(await file.arrayBuffer())
		if (bytes.byteLength !== file.size)
			throw new ApiError('VALIDATION_FAILED', 400, `Media file size changed while reading: ${file.name}`)
		const verified = detectAllowedMedia(bytes)
		if (!verified || verified.mime !== detected[index]!.mime)
			throw new ApiError('VALIDATION_FAILED', 400, `Media file signature changed while reading: ${file.name}`)
		return { name: file.name, bytes }
	}))
}
