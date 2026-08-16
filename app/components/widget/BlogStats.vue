<script setup lang="ts">
import { Temporal } from 'temporal-polyfill'

const appConfig = useAppConfig()
const runtimeConfig = useRuntimeConfig()

// 静态托管可能把无扩展名的预渲染 JSON 作为 application/octet-stream 返回。
const { data: stats } = useFetch('/api/stats', { responseType: 'json' })

const buildTime = toZonedTemporal(runtimeConfig.public.buildTime).toPlainDateTime()
const displayReference = shallowRef<Temporal.PlainDateTime>(buildTime)

onMounted(() => {
	displayReference.value = Temporal.Now.plainDateTimeISO()
})

const uptime = computed(() => timeElapse(appConfig.timeEstablished, 2, displayReference.value))
const buildAge = computed(() => {
	const elapsed = timeElapse(buildTime, 2, displayReference.value)
	return elapsed === '刚刚' ? elapsed : `${elapsed}前`
})

const yearlyTip = computed(() => Object
	.entries(stats.value?.annual || {})
	.reverse()
	.map(([year, item]) => `${year}年：${item.posts}篇，${formatNumber(item.words)}字`)
	.join('\n') || '数据获取失败',
)

const blogStats = [{
	label: '运营时长',
	value: uptime,
	tip: `博客于${appConfig.timeEstablished}上线`,
}, {
	label: '上次更新',
	value: buildAge,
	tip: `构建于${runtimeConfig.public.buildTime}`,
}, {
	label: '总字数',
	value: computed(() => formatNumber(stats.value?.total?.words) || '--'),
	tip: yearlyTip,
}]
</script>

<template>
<BlogWidget class="blog-stats-widget" card title="博客统计">
	<dl class="blog-stats-grid">
		<div v-for="{ label, value, tip } in blogStats" :key="label" class="blog-stat">
			<dt>{{ label }}</dt>
			<dd :title="toValue(tip)">
				<component :is="() => toValue(value)" />
			</dd>
		</div>
	</dl>
</BlogWidget>
</template>

<style scoped lang="scss">
.blog-stats-widget {
	:deep(.widget-header) {
		padding: 0.48rem 0.3rem 0.58rem;
		font-size: 0.9rem;
		font-weight: 700;
		letter-spacing: 0.025em;
	}

	:deep(.widget-body.widget-card) {
		display: flex;
		align-items: center;
		position: relative;
		overflow: hidden;
		min-height: 5.65rem;
		padding: 0.92rem 0.6rem 0.84rem;
		border: 1px solid var(--glass-material-border);
		border-radius: 1rem;
		box-shadow:
			0 14px 36px var(--c-surface-shadow),
			inset 0 1px 0 var(--c-surface-highlight),
			inset 0 0 0 1px color-mix(in srgb, var(--glass-material-border) 42%, transparent);
		background:
			linear-gradient(145deg, color-mix(in srgb, var(--glass-material-highlight) 82%, transparent), transparent 30%),
			radial-gradient(120% 110% at 8% -12%, var(--glass-material-tint), transparent 52%),
			var(--glass-material-fill);
		backdrop-filter: var(--glass-material-filter);
	}

	:deep(.widget-body.widget-card)::before,
	:deep(.widget-body.widget-card)::after {
		content: "";
		position: absolute;
		pointer-events: none;
	}

	:deep(.widget-body.widget-card)::before {
		inset: 0;
		background:
			radial-gradient(9rem 5rem at 8% 0%, color-mix(in srgb, var(--c-flow-blue) 7%, transparent), transparent 68%),
			radial-gradient(8rem 5rem at 94% 110%, color-mix(in srgb, var(--c-flow-cyan) 6%, transparent), transparent 70%);
	}

	:deep(.widget-body.widget-card)::after {
		inset: 0.05rem 0.85rem auto;
		height: 1px;
		background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--c-flow-cyan) 28%, transparent), transparent);
	}
}

.blog-stats-grid {
	display: grid;
	grid-template-columns: minmax(0, 1.08fr) minmax(0, 1.08fr) minmax(0, 0.84fr);
	position: relative;
	width: 100%;
	margin: 0;
	z-index: 1;
}

.blog-stat {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	position: relative;
	min-width: 0;
	padding: 0 0.2rem;
	text-align: center;

	+ .blog-stat::before {
		content: "";
		position: absolute;
		inset: 16% auto 16% 0;
		width: 1px;
		background: linear-gradient(transparent, var(--c-surface-line), transparent);
	}

	dt {
		font-size: 0.72rem;
		letter-spacing: 0.01em;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--c-text-2);
	}

	dd {
		margin: 0.48rem 0 0;
		font-size: 0.92rem;
		font-variant-numeric: tabular-nums;
		font-weight: 720;
		letter-spacing: -0.035em;
		line-height: 1.05;
		white-space: nowrap;
		text-shadow: 0 1px 10px color-mix(in srgb, var(--c-surface-highlight) 20%, transparent);
		color: var(--c-text-1);
	}

	&:last-child dd {
		font-size: 1.02rem;
		color: color-mix(in srgb, var(--c-text) 92%, var(--c-primary) 8%);
	}
}

@media (max-width: $breakpoint-widescreen) {
	.blog-stats-widget {
		:deep(.widget-header) {
			padding-top: 0.35rem;
		}

		:deep(.widget-body.widget-card) {
			padding: 0.85rem 0.55rem 0.78rem;
		}
	}
}

@media (prefers-reduced-transparency: reduce) {
	.blog-stats-widget :deep(.widget-body.widget-card) {
		background: var(--ld-bg-card);
		backdrop-filter: none;
	}
}
</style>
