import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'

function createSilentWav(durationMs = 300) {
	const sampleRate = 8000
	const sampleCount = Math.max(1, Math.round(sampleRate * durationMs / 1000))
	const buffer = Buffer.alloc(44 + sampleCount, 128)

	buffer.write('RIFF', 0)
	buffer.writeUInt32LE(36 + sampleCount, 4)
	buffer.write('WAVE', 8)
	buffer.write('fmt ', 12)
	buffer.writeUInt32LE(16, 16)
	buffer.writeUInt16LE(1, 20)
	buffer.writeUInt16LE(1, 22)
	buffer.writeUInt32LE(sampleRate, 24)
	buffer.writeUInt32LE(sampleRate, 28)
	buffer.writeUInt16LE(1, 32)
	buffer.writeUInt16LE(8, 34)
	buffer.write('data', 36)
	buffer.writeUInt32LE(sampleCount, 40)

	return buffer
}

export async function mockSilentMedia(page: Page) {
	const audio = createSilentWav()
	await page.route('https://media.example.com/**', route => route.fulfill({
		body: audio,
		contentType: 'audio/wav',
		status: 200,
	}))
}
