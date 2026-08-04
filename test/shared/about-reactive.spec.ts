import { describe, expect, it } from 'vitest'
import { isProxy, reactive } from 'vue'
import { aboutLinksSchema, aboutTimelineSchema } from '../../shared/admin/about'

describe('about admin editable structures', () => {
	it('materializes plain validated arrays from Vue reactive API payloads', () => {
		const timelineProxy = reactive([
			{ id: 'timeline-1', date: '2026', title: '开始记录', description: '第一条经历' },
		])
		const linksProxy = reactive([
			{ id: 'link-1', label: 'GitHub', url: 'https://github.com/flyoko', icon: 'tabler:brand-github' },
		])

		expect(isProxy(timelineProxy)).toBe(true)
		expect(() => structuredClone(timelineProxy)).toThrow()

		const timeline = aboutTimelineSchema.parse(timelineProxy)
		const links = aboutLinksSchema.parse(linksProxy)
		expect(isProxy(timeline)).toBe(false)
		expect(isProxy(links)).toBe(false)
		expect(structuredClone(timeline)).toEqual(timeline)
		expect(structuredClone(links)).toEqual(links)
	})
})
