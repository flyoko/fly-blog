import { describe, expect, it } from 'vitest'
import { isPublishRunStale, nextPublishRefreshDelay } from '../../shared/admin/publishing-refresh'

describe('发布状态刷新间隔', () => {
	it('前 60 秒每 5 秒，之后每 15 秒', () => {
		expect(nextPublishRefreshDelay(0)).toBe(5_000)
		expect(nextPublishRefreshDelay(59_999)).toBe(5_000)
		expect(nextPublishRefreshDelay(60_000)).toBe(15_000)
	})

	it('超过 20 分钟未更新时标记为停滞', () => {
		const now = Date.parse('2026-08-05T12:20:00.000Z')
		expect(isPublishRunStale('2026-08-05T12:00:00.001Z', now)).toBe(false)
		expect(isPublishRunStale('2026-08-05T12:00:00.000Z', now)).toBe(true)
		expect(isPublishRunStale('invalid', now)).toBe(false)
	})
})
