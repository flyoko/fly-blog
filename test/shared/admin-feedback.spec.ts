import { describe, expect, it } from 'vitest'
import { isChunkLoadError, toAdminUserMessage } from '../../shared/admin/feedback'

describe('后台反馈文案', () => {
	it('识别部署后丢失的动态分块', () => {
		expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://flyovo.cc.cd/_nuxt/old.js'))).toBe(true)
		expect(isChunkLoadError(new Error('普通业务错误'))).toBe(false)
	})

	it('隐藏技术错误并保留可执行的用户提示', () => {
		expect(toAdminUserMessage(new TypeError('Failed to fetch dynamically imported module: /_nuxt/old.js'))).toBe('页面资源刚刚更新，系统正在恢复，请稍候。')
		expect(toAdminUserMessage({ code: 'CONFLICT', message: 'raw conflict details' })).toBe('线上内容已经更新，请重新载入后再继续。')
		expect(toAdminUserMessage(new Error('保存失败，请稍后重试'))).toBe('保存失败，请稍后重试')
		expect(toAdminUserMessage(new Error('Internal stack trace: foo at bar'))).toBe('操作没有完成，请稍后重试。')
		expect(toAdminUserMessage(new Error('预览失败：https://flyovo.cc.cd/_nuxt/old.js'))).toBe('操作没有完成，请稍后重试。')
	})
})
