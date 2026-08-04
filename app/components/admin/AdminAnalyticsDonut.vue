<script setup lang="ts">
import type { AnalyticsBreakdownItemDto } from '#shared/admin/analytics'

const props = withDefaults(defineProps<{
	items: AnalyticsBreakdownItemDto[]
	title?: string
}>(), {
	title: '设备分布',
})

const total = computed(() => props.items.reduce((sum, item) => sum + item.pageviews, 0))
const segments = computed(() => {
	let offset = 0
	return props.items.slice(0, 6).map((item, index) => {
		const percent = total.value ? (item.pageviews / total.value) * 100 : 0
		const segment = { ...item, percent, offset, tone: index % 5 }
		offset += percent
		return segment
	})
})

const description = computed(() => segments.value.length
	? segments.value.map(item => `${item.label} ${Math.round(item.percent)}%`).join('，')
	: '暂无设备分布数据。')
</script>

<template>
<div class="admin-analytics-donut">
	<div class="analytics-donut-visual">
		<svg viewBox="0 0 120 120" role="img" :aria-label="title">
			<title>{{ title }}</title>
			<desc>{{ description }}</desc>
			<circle class="analytics-donut-track" cx="60" cy="60" r="42" pathLength="100" />
			<circle
				v-for="segment in segments"
				:key="segment.label"
				class="analytics-donut-segment"
				:class="`is-tone-${segment.tone}`"
				cx="60"
				cy="60"
				r="42"
				pathLength="100"
				:stroke-dasharray="`${segment.percent} ${100 - segment.percent}`"
				:stroke-dashoffset="-segment.offset"
			/>
		</svg>
		<div class="analytics-donut-total" aria-hidden="true">
			<strong>{{ total }}</strong>
			<span>浏览</span>
		</div>
	</div>
	<ul class="analytics-donut-legend">
		<li v-for="segment in segments" :key="segment.label">
			<i :class="`is-tone-${segment.tone}`" aria-hidden="true" />
			<span>{{ segment.label }}</span>
			<strong>{{ Math.round(segment.percent) }}%</strong>
		</li>
	</ul>
</div>
</template>
