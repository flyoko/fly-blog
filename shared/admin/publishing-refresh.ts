export function nextPublishRefreshDelay(elapsedMs: number): number {
	return elapsedMs < 60_000 ? 5_000 : 15_000
}
