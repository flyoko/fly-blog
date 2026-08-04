<script setup lang="ts">
import type { AnalyticsTimeseriesPointDto } from '#shared/admin/analytics'

const props = withDefaults(defineProps<{
	points: AnalyticsTimeseriesPointDto[]
	title?: string
}>(), {
	title: '访问趋势',
})

const width = 720
const height = 260
const padding = { top: 18, right: 18, bottom: 34, left: 44 }
const plotWidth = width - padding.left - padding.right
const plotHeight = height - padding.top - padding.bottom

const maximum = computed(() => Math.max(
	1,
	...props.points.flatMap(point => [point.pageviews, point.visitors]),
))

function x(index: number): number {
	if (props.points.length <= 1)
		return padding.left + plotWidth / 2
	return padding.left + (index / (props.points.length - 1)) * plotWidth
}

function y(value: number): number {
	return padding.top + plotHeight - (value / maximum.value) * plotHeight
}

function polyline(series: 'pageviews' | 'visitors'): string {
	return props.points.map((point, index) => `${x(index)},${y(point[series])}`).join(' ')
}

const gridValues = computed(() => Array.from({ length: 5 }, (_, index) => {
	const value = Math.round(maximum.value * (1 - index / 4))
	return { value, y: padding.top + (plotHeight * index) / 4 }
}))

const visibleLabels = computed(() => {
	if (props.points.length <= 6)
		return props.points.map((point, index) => ({ point, index }))
	const last = props.points.length - 1
	const indexes = new Set([0, Math.round(last / 3), Math.round((last * 2) / 3), last])
	return [...indexes].sort((a, b) => a - b).map(index => ({ point: props.points[index]!, index }))
})

function shortBucket(bucket: string): string {
	const date = new Date(bucket.length === 10 ? `${bucket}T00:00:00` : bucket)
	if (Number.isNaN(date.getTime()))
		return bucket
	return bucket.includes('T')
		? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit' }).format(date)
		: new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}

const description = computed(() => {
	const pageviews = props.points.reduce((total, point) => total + point.pageviews, 0)
	const visitors = props.points.reduce((total, point) => total + point.visitors, 0)
	return `${props.points.length} 个时间点，页面浏览 ${pageviews} 次，独立访客 ${visitors} 人。`
})
</script>

<template>
<div class="admin-analytics-line-chart">
	<svg
		:viewBox="`0 0 ${width} ${height}`"
		role="img"
		:aria-label="title"
		preserveAspectRatio="none"
	>
		<title>{{ title }}</title>
		<desc>{{ description }}</desc>
		<g class="analytics-chart-grid" aria-hidden="true">
			<g v-for="grid in gridValues" :key="grid.y">
				<line :x1="padding.left" :x2="width - padding.right" :y1="grid.y" :y2="grid.y" />
				<text :x="padding.left - 8" :y="grid.y + 4">{{ grid.value }}</text>
			</g>
		</g>
		<polyline
			v-if="points.length"
			class="analytics-chart-line analytics-chart-line-pageviews"
			:points="polyline('pageviews')"
		/>
		<polyline
			v-if="points.length"
			class="analytics-chart-line analytics-chart-line-visitors"
			:points="polyline('visitors')"
		/>
		<g class="analytics-chart-labels" aria-hidden="true">
			<text
				v-for="item in visibleLabels"
				:key="item.index"
				:x="x(item.index)"
				:y="height - 8"
				text-anchor="middle"
			>
				{{ shortBucket(item.point.bucket) }}
			</text>
		</g>
	</svg>
	<div class="analytics-chart-legend" aria-label="图例">
		<span><i class="is-pageviews" aria-hidden="true" />页面浏览</span>
		<span><i class="is-visitors" aria-hidden="true" />独立访客</span>
	</div>
</div>
</template>
