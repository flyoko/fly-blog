import { describe, expect, it } from 'vitest'
import { nextPublishRefreshDelay } from '../../shared/admin/publishing-refresh'

describe('发布状态刷新间隔', () => {
	it('前 60 秒每 5 秒，之后每 15 秒', () => {
		expect(nextPublishRefreshDelay(0)).toBe(5_000)
		expect(nextPublishRefreshDelay(59_999)).toBe(5_000)
		expect(nextPublishRefreshDelay(60_000)).toBe(15_000)
	})
})
