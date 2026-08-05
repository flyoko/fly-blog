export function nextPublishRefreshDelay(elapsedMs: number): number {
	return elapsedMs < 60_000 ? 5_000 : 15_000
}

export const publishRunStaleAfterMs = 20 * 60_000

export function isPublishRunStale(updatedAt: string, now = Date.now()): boolean {
	const timestamp = Date.parse(updatedAt)
	return Number.isFinite(timestamp) && now - timestamp >= publishRunStaleAfterMs
}
