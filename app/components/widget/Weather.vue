<script setup lang="ts">
import type { PublicWeather } from '#shared/admin/weather'

const appConfig = useAppConfig()
const moduleEnabled = computed(() => appConfig.featureModules.some(module => module.id === 'weather' && module.enabled))
const weather = ref<PublicWeather | null>(null)
const loading = ref(false)
const error = ref(false)

async function load() {
	if (!moduleEnabled.value)
		return
	loading.value = true
	error.value = false
	try {
		weather.value = await $fetch<PublicWeather>('/api/weather')
	}
	catch {
		error.value = true
	}
	finally {
		loading.value = false
	}
}

onMounted(load)
</script>

<template>
<BlogWidget v-if="moduleEnabled" title="站长城市天气" card>
	<div v-if="loading" class="weather-skeleton" aria-label="正在加载天气" />
	<div v-else-if="weather?.available" class="weather-card" :class="weather.isDay ? 'is-day' : 'is-night'">
		<div class="weather-current">
			<Icon :name="weather.icon" />
			<div>
				<strong>{{ Math.round(weather.temperature) }}°</strong>
				<span>{{ weather.condition }}</span>
			</div>
		</div>
		<div class="weather-city">
			<strong>{{ weather.city }}</strong>
			<span>最高 {{ Math.round(weather.high) }}° · 最低 {{ Math.round(weather.low) }}°</span>
		</div>
		<p>{{ weather.tip }}</p>
		<footer>
			<span>{{ weather.stale ? '使用最近成功数据' : `更新于 ${weather.observedAt}` }}</span>
			<a :href="weather.sourceUrl" target="_blank" rel="noopener noreferrer">{{ weather.sourceName }}</a>
		</footer>
	</div>
	<div v-else-if="weather && weather.reason !== 'disabled'" class="weather-unavailable">
		<Icon name="tabler:cloud-off" />
		<span>{{ weather.message }}</span>
	</div>
	<button v-else-if="error" class="weather-retry" type="button" @click="load">
		天气加载失败，点击重试
	</button>
</BlogWidget>
</template>

<style scoped lang="scss">
.weather-card {
	position: relative;
	overflow: hidden;
	border-radius: 0.75rem;
}

.weather-card::after {
	content: "";
	position: absolute;
	inset: -40% -20% auto auto;
	width: 8rem;
	height: 8rem;
	border-radius: 50%;
	background: color-mix(in srgb, var(--c-primary) 15%, transparent);
	filter: blur(1rem);
	pointer-events: none;
}

.weather-card.is-night::after {
	background: color-mix(in srgb, #7C83FF 18%, transparent);
}

.weather-current {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.weather-current > .iconify {
	font-size: 2.8rem;
	color: var(--c-primary);
}

.weather-current div,
.weather-city {
	display: grid;
}

.weather-current strong {
	font-size: 2rem;
	line-height: 1;
}

.weather-current span,
.weather-city span,
.weather-card footer {
	color: var(--c-text-2);
}

.weather-city {
	margin-top: 0.8rem;
}

.weather-card p {
	margin: 0.8rem 0;
	font-size: 0.78rem;
}

.weather-card footer {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	font-size: 0.65rem;
}

.weather-card footer a {
	text-decoration: underline;
}

.weather-skeleton {
	height: 10rem;
	border-radius: 0.75rem;
	background: var(--c-bg-soft);
	animation: weather-pulse 1.4s ease-in-out infinite alternate;
}

.weather-unavailable,
.weather-retry {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-height: 4rem;
	border: 0;
	background: transparent;
	color: var(--c-text-2);
}

.weather-retry {
	cursor: pointer;
}

@keyframes weather-pulse {
	to { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
	.weather-skeleton {
		animation: none;
	}
}
</style>
