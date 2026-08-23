<script setup lang="ts">
import type { CiticFuturesPositionPoint } from '#shared/market'

const props = defineProps<{
	points: CiticFuturesPositionPoint[]
}>()

const minWidth = 760
const height = 300
const padding = { left: 58, right: 18, top: 22, bottom: 42 }
const plotHeight = height - padding.top - padding.bottom
const baseline = padding.top + plotHeight / 2
const groups = 3
const activeIndex = ref<number | null>(null)
const scroller = ref<HTMLDivElement | null>(null)

const viewWidth = computed(() => Math.max(minWidth, props.points.length * 38 + padding.left + padding.right))
const plotWidth = computed(() => viewWidth.value - padding.left - padding.right)
const extent = computed(() => Math.max(1, ...props.points.flatMap(point => [
	Math.abs(point.longChange),
	Math.abs(point.shortChange),
	Math.abs(point.netChange),
])))
const groupWidth = computed(() => props.points.length ? plotWidth.value / props.points.length : plotWidth.value)
const barWidth = computed(() => Math.max(5, Math.min(14, groupWidth.value / 5)))
const activePoint = computed(() => activeIndex.value === null ? null : props.points[activeIndex.value] || null)
const tooltipLeft = computed(() => {
	if (activeIndex.value === null)
		return 50
	return Math.min(88, Math.max(12, centerX(activeIndex.value) / viewWidth.value * 100))
})

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
	if (props.points.length <= 12)
		return props.points.map((point, index) => ({ point, index }))
	const step = Math.max(1, Math.ceil(props.points.length / 10))
	return props.points
		.map((point, index) => ({ point, index }))
		.filter(({ index }) => index % step === 0 || index === props.points.length - 1)
})

const description = computed(() => {
	const latest = props.points.at(-1)
	if (!latest)
		return '暂无中信期货股指席位变化数据。'
	return `${props.points.length} 个交易日。最新多单变化 ${signed(latest.longChange)} 手，空单变化 ${signed(latest.shortChange)} 手，${netLabel(latest.netChange)} 手。`
})

function activate(index: number) {
	activeIndex.value = index
}

function deactivate(index: number) {
	if (activeIndex.value === index)
		activeIndex.value = null
}

function scrollToLatest() {
	nextTick(() => {
		if (scroller.value)
			scroller.value.scrollLeft = scroller.value.scrollWidth
	})
}

onMounted(scrollToLatest)
watch(() => props.points.map(point => point.tradeDate).join(','), scrollToLatest)
</script>

<template>
<div class="market-futures-chart">
	<div ref="scroller" class="chart-scroll" tabindex="0" aria-label="中信期货股指席位历史图，可横向滚动查看更早日期">
		<div class="chart-canvas" :style="{ width: `${viewWidth}px` }">
			<svg
				:viewBox="`0 0 ${viewWidth} ${height}`"
				role="img"
				aria-label="中信期货股指席位多单、空单与净变化"
				preserveAspectRatio="none"
			>
				<title>中信期货股指席位每日加减单</title>
				<desc>{{ description }}</desc>
				<g class="chart-grid" aria-hidden="true">
					<line :x1="padding.left" :x2="viewWidth - padding.right" :y1="baseline" :y2="baseline" />
					<text :x="padding.left - 8" :y="baseline + 4" text-anchor="end">0</text>
					<text :x="padding.left - 8" :y="padding.top + 7" text-anchor="end">+{{ extent.toLocaleString('zh-CN') }}</text>
					<text :x="padding.left - 8" :y="height - padding.bottom - 2" text-anchor="end">-{{ extent.toLocaleString('zh-CN') }}</text>
				</g>

				<g v-for="(point, index) in points" :key="point.tradeDate" class="day-bars" :class="{ active: activeIndex === index }">
					<rect
						class="position-bar is-long" :class="tone('long', point.longChange)"
						:x="x(index, 0)" :y="y(point.longChange)" :width="barWidth" :height="Math.max(1, valueHeight(point.longChange))"
						:style="{ '--bar-index': index * 3 }"
					/>
					<rect
						class="position-bar is-short" :class="tone('short', point.shortChange)"
						:x="x(index, 1)" :y="y(point.shortChange)" :width="barWidth" :height="Math.max(1, valueHeight(point.shortChange))"
						:style="{ '--bar-index': index * 3 + 1 }"
					/>
					<rect
						class="position-bar is-net" :class="tone('net', point.netChange)"
						:x="x(index, 2)" :y="y(point.netChange)" :width="barWidth" :height="Math.max(1, valueHeight(point.netChange))"
						:style="{ '--bar-index': index * 3 + 2 }"
					/>
					<rect
						class="day-hitbox"
						:x="padding.left + groupWidth * index" :y="padding.top" :width="groupWidth" :height="plotHeight"
						tabindex="0" role="button"
						:aria-label="`${point.tradeDate}，多单变化 ${signed(point.longChange)} 手，空单变化 ${signed(point.shortChange)} 手，${netLabel(point.netChange)} 手`"
						@mouseenter="activate(index)" @mouseleave="deactivate(index)" @focus="activate(index)" @blur="deactivate(index)" @click="activate(index)"
					/>
				</g>

				<g class="chart-labels" aria-hidden="true">
					<text v-for="item in visibleLabels" :key="item.index" :x="centerX(item.index)" :y="height - 13" text-anchor="middle">
						{{ shortDate(item.point.tradeDate) }}
					</text>
				</g>
			</svg>

			<div v-if="activePoint" class="chart-tooltip" :style="{ left: `${tooltipLeft}%` }" role="status">
				<strong>{{ activePoint.tradeDate }}</strong>
				<span>多单 <b :class="tone('long', activePoint.longChange)">{{ signed(activePoint.longChange) }}</b></span>
				<span>空单 <b :class="tone('short', activePoint.shortChange)">{{ signed(activePoint.shortChange) }}</b></span>
				<span>净变化 <b :class="tone('net', activePoint.netChange)">{{ netLabel(activePoint.netChange) }}</b></span>
			</div>
		</div>
	</div>

	<div class="chart-meta">
		<div class="chart-legend" aria-label="图例">
			<span><i class="long-key" />多单变化</span>
			<span><i class="short-key" />空单变化</span>
			<span><i class="net-key" />净偏多 / 净偏空</span>
		</div>
		<span v-if="points.length > 12">左右滑动查看更早日期</span>
	</div>
</div>
</template>

<style scoped lang="scss">
.market-futures-chart {
	width: 100%;
	min-width: 0;
}

.chart-scroll {
	overflow-x: auto;
	width: 100%;
	border-radius: 0.35rem;
	overscroll-behavior-inline: contain;
	scrollbar-width: thin;
}

.chart-canvas {
	position: relative;
	min-width: 100%;
}

svg {
	display: block;
	width: 100%;
	height: clamp(15rem, 28vw, 20rem);
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
	transition: opacity 160ms ease, filter 160ms ease;
	animation: market-position-rise 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
	animation-delay: calc(var(--bar-index) * 22ms);

	&.is-up { fill: var(--market-up); }
	&.is-down { fill: var(--market-down); }
	&.is-long { opacity: 0.68; }
	&.is-short { opacity: 0.48; }
	&.is-net { opacity: 1; }
}

.day-bars.active .position-bar {
	opacity: 1;
	filter: brightness(1.12);
}

.day-hitbox {
	outline: none;
	cursor: crosshair;
	fill: transparent;
}

.day-hitbox:focus-visible {
	stroke: var(--market-accent);
	stroke-width: 1.5;
	stroke-dasharray: 4 3;
}

.chart-labels text {
	fill: var(--market-text-3);
	font: 600 10px/1 var(--font-monospace);
}

.chart-tooltip {
	display: grid;
	gap: 0.2rem;
	position: absolute;
	top: 0.6rem;
	min-width: 10.5rem;
	padding: 0.55rem 0.65rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.38rem;
	box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
	background: color-mix(in srgb, var(--market-panel) 94%, transparent);
	backdrop-filter: blur(10px);
	font: 600 0.6rem/1.45 var(--font-monospace);
	color: var(--market-text-2);
	transform: translateX(-50%);
	pointer-events: none;

	strong { color: var(--market-text); }

	span {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}

	b.is-up { color: var(--market-up); }
	b.is-down { color: var(--market-down); }
}

.chart-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.6rem;
	margin-top: 0.35rem;
	font: 600 0.56rem/1.4 var(--font-monospace);
	color: var(--market-text-3);
}

.chart-legend {
	display: flex;
	flex-wrap: wrap;
	gap: 0.65rem 1rem;
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

	to { transform: scaleY(1); }
}

@media (max-width: 760px) {
	.chart-meta {
		flex-direction: column;
		align-items: flex-start;
	}
}

@media (prefers-reduced-motion: reduce) {
	.position-bar {
		transition: none;
		animation: none;
	}
}
</style>
