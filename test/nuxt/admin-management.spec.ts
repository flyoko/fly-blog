import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	buildConfigPullRequest,
	publishStatusMeta,
} from '../../app/types/admin'

const root = fileURLToPath(new URL('../..', import.meta.url))

async function source(path: string) {
	return readFile(`${root}/${path}`, 'utf8')
}

describe('admin management helpers', () => {
	it('builds fixed-kind configuration PR payloads without accepting arbitrary paths', () => {
		const payload = buildConfigPullRequest('categories', [{ name: '技术', icon: 'tabler:code' }], 'config-change-1')
		expect(payload).toEqual({
			kind: 'categories',
			content: [{ name: '技术', icon: 'tabler:code' }],
			idempotencyKey: 'config-change-1',
			title: '更新分类配置',
			body: '由 fly living 管理后台提交，等待预览与检查通过后合并。',
		})
		expect(payload).not.toHaveProperty('path')
	})

	it('maps publish states to user-facing status metadata', () => {
		expect(publishStatusMeta('checks_pending')).toEqual({ label: '检查中', tone: 'warning' })
		expect(publishStatusMeta('preview_ready')).toEqual({ label: '可审核', tone: 'positive' })
		expect(publishStatusMeta('failed')).toEqual({ label: '失败', tone: 'danger' })
	})
})

describe('admin management UI boundaries', () => {
	it('shows per-file partial upload results and trash restoration', async () => {
		const media = await source('app/pages/admin/media.vue')
		expect(media).toContain('部分文件上传失败')
		expect(media).toContain('恢复媒体')
		expect(media).toContain('永久删除')
		expect(media).toContain('? \'DELETE\' : \'\'')
	})

	it('submits settings through the controlled configuration PR endpoint', async () => {
		const settings = await source('app/pages/admin/settings.vue')
		expect(settings).toContain('/api/admin/publishing/pull-requests')
		expect(settings).toContain('创建配置 PR')
		expect(settings).not.toContain('repositoryPath')
	})

	it('only exposes merge when checks and preview permit it', async () => {
		const reviews = await source('app/pages/admin/reviews.vue')
		expect(reviews).toContain('canMerge')
		expect(reviews).toContain('检查与预览尚未通过')
		expect(reviews).toContain('变更文件')
		expect(reviews).toContain('Head SHA')
		expect(reviews).toContain('file.patch')
		expect(reviews).toContain('确认合并')
		expect(reviews).toContain('verification-text="MERGE"')
	})

	it('uses a reusable publish status component', async () => {
		const component = await source('app/components/admin/AdminPublishStatus.vue')
		expect(component).toContain('publishStatusMeta')
		expect(component).toContain('deploymentUrl')
	})
})
