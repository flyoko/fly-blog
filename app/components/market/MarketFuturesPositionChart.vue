<script setup lang="ts">
import type { CiticFuturesPositionPoint } from '#shared/market'

const props = defineProps<{
	points: CiticFuturesPositionPoint[]
}>()

const width = 760
const height = 286
const padding = { left: 58, right: 18, top: 22, bottom: 42 }
const plotWidth = width - padding.left - padding.right
const plotHeight = height - padding.top - padding.bottom
const baseline = padding.top + plotHeight / 2
const groups = 3

const extent = computed(() => Math.max(1, ...props.points.flatMap(point => [
	Math.abs(point.longChange),
	Math.abs(point.shortChange),
	Math.abs(point.netChange),
])))

const groupWidth = computed(() => props.points.length ? plotWidth / props.points.length : plotWidth)
const barWidth = computed(() => Math.max(4, Math.min(14, groupWidth.value / 5)))

function centerX(index: number): number {
	return padding.left + groupWidth.value * (index + 0.5)
}

function valueHeight(value: number): number {
	return Math.abs(value) / extent.value * (plotHeight / 2 - 14)
}

function y(value: number): number {
	return value >= 0 ? baseline - valueHeight(value) : baseline
}

function x(index: number, seriesIndex: number): number {
	const total = barWidth.value * groups + 4 * (groups - 1)
	return centerX(index) - total / 2 + seriesIndex * (barWidth.value + 4)
}

function tone(kind: 'long' | 'short' | 'net', value: number): string {
	if (kind === 'short')
		return value <= 0 ? 'is-up' : 'is-down'
	return value >= 0 ? 'is-up' : 'is-down'
}

function signed(value: number): string {
	return `${value > 0 ? '+' : ''}${value.toLocaleString('zh-CN')}`
}

function netLabel(value: number): string {
	return value >= 0 ? `净偏多 ${signed(value)}` : `净偏空 ${signed(value)}`
}

function shortDate(value: string): string {
	const [, month, day] = value.split('-')
	return month && day ? `${Number(month)}/${Number(day)}` : value
}

const visibleLabels = computed(() => {
	if (props.points.length <= 8)
		return props.points.map((point, index) => ({ point, index }))
	const last = props.points.length - 1
	const indexes = new Set([0, Math.round(last / 4), Math.round(last / 2), Math.round(last * 3 / 4), last])
	return [...indexes].sort((left, right) => left - right).map(index => ({ point: props.points[index]!, index }))
})

const description = computed(() => {
	const latest = props.points.at(-1)
	if (!latest)
		return '暂无中信期货股指席位变化数据。'
	return `${props.points.length} 个交易日。最新多单变化 ${signed(latest.longChange)} 手，空单变化 ${signed(latest.shortChange)} 手，${netLabel(latest.netChange)} 手。`
})
</script>

<template>
<div class="market-futures-chart">
	<svg
		:viewBox="`0 0 ${width} ${height}`"
		role="img"
		aria-label="中信期货股指席位多单、空单与净变化"
		preserveAspectRatio="none"
	>
		<title>中信期货股指席位每日加减单</title>
		<desc>{{ description }}</desc>
		<g class="chart-grid" aria-hidden="true">
			<line :x1="padding.left" :x2="width - padding.right" :y1="baseline" :y2="baseline" />
			<text :x="padding.left - 8" :y="baseline + 4" text-anchor="end">0</text>
			<text :x="padding.left - 8" :y="padding.top + 7" text-anchor="end">+{{ extent.toLocaleString('zh-CN') }}</text>
			<text :x="padding.left - 8" :y="height - padding.bottom - 2" text-anchor="end">-{{ extent.toLocaleString('zh-CN') }}</text>
		</g>

		<g v-for="(point, index) in points" :key="point.tradeDate" class="day-bars">
			<rect
				class="position-bar is-long" :class="tone('long', point.longChange)"
				:x="x(index, 0)"
				:y="y(point.longChange)"
				:width="barWidth"
				:height="Math.max(1, valueHeight(point.longChange))"
				:style="{ '--bar-index': index * 3 }"
			>
				<title>{{ point.tradeDate }} 多单变化 {{ signed(point.longChange) }} 手</title>
			</rect>
			<rect
				class="position-bar is-short" :class="tone('short', point.shortChange)"
				:x="x(index, 1)"
				:y="y(point.shortChange)"
				:width="barWidth"
				:height="Math.max(1, valueHeight(point.shortChange))"
				:style="{ '--bar-index': index * 3 + 1 }"
			>
				<title>{{ point.tradeDate }} 空单变化 {{ signed(point.shortChange) }} 手</title>
			</rect>
			<rect
				class="position-bar is-net" :class="tone('net', point.netChange)"
				:x="x(index, 2)"
				:y="y(point.netChange)"
				:width="barWidth"
				:height="Math.max(1, valueHeight(point.netChange))"
				:style="{ '--bar-index': index * 3 + 2 }"
			>
				<title>{{ point.tradeDate }} {{ netLabel(point.netChange) }} 手</title>
			</rect>
		</g>

		<g class="chart-labels" aria-hidden="true">
			<text
				v-for="item in visibleLabels"
				:key="item.index"
				:x="centerX(item.index)"
				:y="height - 13"
				text-anchor="middle"
			>
				{{ shortDate(item.point.tradeDate) }}
			</text>
		</g>
	</svg>

	<div class="chart-legend" aria-label="图例">
		<span><i class="long-key" />多单变化</span>
		<span><i class="short-key" />空单变化</span>
		<span><i class="net-key" />净偏多 / 净偏空</span>
	</div>
</div>
</template>

<style scoped lang="scss">
.market-futures-chart {
	width: 100%;
	min-width: 0;

	svg {
		display: block;
		overflow: visible;
		width: 100%;
		height: clamp(14rem, 28vw, 20rem);
	}
}

.chart-grid {
	line {
		stroke: var(--market-border-strong);
		stroke-width: 1;
		stroke-dasharray: 5 6;
	}

	text {
		fill: var(--market-text-3);
		font: 600 10px/1 var(--font-monospace);
	}
}

.position-bar {
	opacity: 0.82;
	transform-box: fill-box;
	transform-origin: center;
	animation: market-position-rise 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
	animation-delay: calc(var(--bar-index) * 28ms);

	&.is-up { fill: var(--market-up); }
	&.is-down { fill: var(--market-down); }
	&.is-long { opacity: 0.68; }
	&.is-short { opacity: 0.48; }
	&.is-net { opacity: 1; }
}

.chart-labels text {
	fill: var(--market-text-3);
	font: 600 10px/1 var(--font-monospace);
}

.chart-legend {
	display: flex;
	flex-wrap: wrap;
	gap: 0.65rem 1rem;
	font: 600 0.68rem/1.4 var(--font-monospace);
	color: var(--market-text-2);

	span {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
	}

	i {
		display: inline-block;
		width: 0.9rem;
		height: 0.3rem;
		border-radius: 999px;
		background: var(--market-accent);
	}

	.long-key { opacity: 0.72; }

	.short-key { opacity: 0.5; }

	.net-key { opacity: 1; }
}

@keyframes market-position-rise {
	from {
		opacity: 0;
		transform: scaleY(0.05);
	}

	to {
		transform: scaleY(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.position-bar { animation: none; }
}
</style>
