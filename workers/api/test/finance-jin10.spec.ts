import { describe, expect, it, vi } from 'vitest'
import { Jin10FinanceFlashAdapter, mapJin10FinanceToolResult } from '../src/features/finance/jin10'

function toolPayload(items: Array<Record<string, unknown>>) {
	return {
		structuredContent: {
			status: 200,
			message: '',
			data: {
				items,
				next_cursor: '',
				has_more: false,
			},
		},
	}
}

describe('jin10 finance MCP adapter', () => {
	it('maps structured flash items, extracts bracket titles, normalizes time, and keeps the source private', () => {
		const [item] = mapJin10FinanceToolResult(toolPayload([{
			title: '',
			content: '【贸易争端升级 加拿大将对美国商品加征等额反制关税】金十数据8月23日讯，加拿大宣布新的关税措施。',
			time: '2026-08-23T00:14:22+08:00',
			url: 'https://flash.jin10.com/detail/20260823001422907800',
		}]))

		expect(item).toMatchObject({
			id: '20260823001422907800',
			title: '贸易争端升级 加拿大将对美国商品加征等额反制关税',
			publishedAt: '2026-08-22T16:14:22.000Z',
			sourceName: '金十数据',
			sourceUrl: 'https://flash.jin10.com/detail/20260823001422907800',
			publicVisible: false,
		})
		expect(item?.summary).toContain('加拿大宣布新的关税措施')
	})

	it('falls back to text JSON and drops non-Jin10 source URLs without dropping the event', () => {
		const payload = {
			content: [{
				type: 'text',
				text: JSON.stringify({
					status: 200,
					message: '',
					data: {
						items: [{
							content: '美联储宣布维持利率不变。市场关注后续指引。',
							time: '2026-08-23T00:30:00+08:00',
							url: 'https://example.com/not-jin10',
						}],
						next_cursor: '',
						has_more: false,
					},
				}),
			}],
		}
		const [item] = mapJin10FinanceToolResult(payload)

		expect(item?.title).toBe('美联储宣布维持利率不变。')
		expect(item?.sourceUrl).toBeNull()
		expect(item?.category).toBe('macro')
		expect(item?.publicVisible).toBe(false)
	})

	it('stays disabled without a token and never creates an MCP client', async () => {
		const factory = vi.fn()
		const adapter = new Jin10FinanceFlashAdapter(undefined, factory)

		expect(adapter.enabled).toBe(false)
		await expect(adapter.fetch()).rejects.toThrow(/missing token/i)
		expect(factory).not.toHaveBeenCalled()
	})

	it('redacts the MCP token from adapter errors before they can reach sync state', async () => {
		const token = 'unit-test-jin10-token'
		const factory = vi.fn(async () => {
			throw new Error(`connect failed for ${token}; Authorization: Bearer ${token}`)
		})
		const adapter = new Jin10FinanceFlashAdapter(token, factory)
		let message = ''
		try {
			await adapter.fetch()
		}
		catch (cause) {
			message = cause instanceof Error ? cause.message : String(cause)
		}

		expect(message).toContain('Jin10 MCP request failed')
		expect(message).toContain('[REDACTED]')
		expect(message).not.toContain(token)
	})
})
