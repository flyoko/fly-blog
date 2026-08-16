<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ApiSuccess } from '#shared/admin/api'
import type { PublicWeather } from '#shared/admin/weather'
import { resolvePublicApiUrl } from '~/utils/public-api'
import { toWeatherMotionState } from '~/utils/weather-motion'

const appConfig = useAppConfig()
const configuredEnabled = computed(() => appConfig.featureModules.some(module => module.id === 'weather' && module.enabled))
const weatherIconAliases: Record<string, string> = {
	'tabler:cloud-sun': 'ri:sun-cloudy-line',
}

const weatherStarMap = [
	[7, 17, 1, 0.42],
	[15, 8, 1.4, 0.65],
	[27, 25, 0.8, 0.38],
	[38, 11, 1.8, 0.82],
	[49, 31, 1, 0.48],
	[58, 6, 0.8, 0.35],
	[68, 20, 1.3, 0.68],
	[79, 10, 0.9, 0.46],
	[89, 28, 1.7, 0.78],
	[22, 42, 1.2, 0.58],
	[44, 50, 0.7, 0.32],
	[63, 39, 1.5, 0.72],
	[74, 55, 0.8, 0.4],
	[92, 45, 1.1, 0.6],
] as const

const weatherRainDrops = Array.from({ length: 31 }, (_, index) => {
	const random = (offset: number) => (((index + offset) * 47 + 19) % 101) / 101
	return {
		x: `${-3 + (index * 37) % 108}%`,
		y: `${-18 + (index * 53) % 83}%`,
		width: `${index % 7 === 0 ? 1.6 : 0.7 + (index % 3) * 0.24}px`,
		length: `${10 + (index * 11) % 24}px`,
		duration: `${(0.72 + random(0) * 0.9).toFixed(2)}s`,
		delay: `${(-random(8) * 3.7).toFixed(2)}s`,
		alpha: (0.35 + random(4) * 0.5).toFixed(2),
		drift: `${18 + (index % 6) * 4}px`,
	}
})

const weather = ref<PublicWeather | null>(null)
const loading = ref(false)
const error = ref(false)
const weatherIcon = computed(() => {
	const current = weather.value
	if (!current?.available)
		return ''
	return weatherIconAliases[current.icon] ?? current.icon
})
const weatherState = computed(() => weather.value?.available
	? toWeatherMotionState(weather.value.weatherCode)
	: 'clear')
const weatherClasses = computed(() => {
	const current = weather.value
	return current?.available
		? [`is-${weatherState.value}`, current.isDay ? 'is-day' : 'is-night']
		: []
})
const weatherStyle = computed<CSSProperties>(() => {
	const current = weather.value
	if (!current?.available)
		return {}
	const wind = Math.max(0, Math.min(current.windSpeed ?? 0, 32))
	const precipitation = Math.max(0, Math.min(current.precipitationProbability ?? 0, 100))
	return {
		'--weather-cloud-duration': `${Math.max(5.5, 18 - wind * 0.36).toFixed(1)}s`,
		'--weather-rain-duration': `${Math.max(0.42, 1.08 - wind * 0.018).toFixed(2)}s`,
		'--weather-rain-opacity': `${Math.max(0.42, precipitation / 100).toFixed(2)}`,
		'--weather-wind-skew': `${Math.min(22, 8 + wind * 0.45).toFixed(1)}deg`,
	} as CSSProperties
})
const visible = computed(() => Boolean(
	(weather.value?.available)
	|| weather.value?.reason === 'temporarily_unavailable'
	|| (configuredEnabled.value && (loading.value || error.value)),
))

function formatObservedAt(value: string) {
	const parsed = new Date(value)
	if (Number.isNaN(parsed.valueOf()))
		return value
	return new Intl.DateTimeFormat('zh-CN', {
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(parsed)
}

async function load() {
	loading.value = true
	error.value = false
	try {
		const weatherUrl = resolvePublicApiUrl('/api/weather', globalThis.location.hostname)
		weather.value = (await $fetch<ApiSuccess<PublicWeather>>(weatherUrl)).data
	}
	catch {
		error.value = true
	}
	finally {
		loading.value = false
	}
}

onMounted(() => {
	if (configuredEnabled.value)
		load()
})
</script>

<template>
<BlogWidget v-if="visible" title="站长城市天气" card>
	<template #action>
		<span v-if="weather?.available" class="weather-live-label">
			<i />{{ weather.stale ? '缓存' : '实时' }}
		</span>
	</template>

	<div v-if="loading" class="weather-skeleton" aria-label="正在加载天气" />
	<article
		v-else-if="weather?.available"
		class="weather-card"
		:class="weatherClasses"
		:style="weatherStyle"
	>
		<div class="weather-scene" aria-hidden="true">
			<span class="weather-celestial weather-sun"><i class="weather-sun-corona" /><b class="weather-sun-glint" /></span>
			<span class="weather-celestial weather-moon"><i /></span>
			<span class="weather-stars">
				<i
					v-for="([x, y, size, alpha], index) in weatherStarMap" :key="index"
					class="weather-star-twinkle"
					:style="{
						'--star-x': `${x}%`,
						'--star-y': `${y}%`,
						'--star-size': `${size}px`,
						'--star-alpha': alpha,
						'--star-duration': `${2.4 + (index % 5) * 0.7}s`,
						'--star-delay': `${-index * 0.37}s`,
					}"
				/>
			</span>
			<span class="weather-cloud weather-cloud-back"><i /><b /></span>
			<span class="weather-cloud weather-cloud-front"><i /><b /></span>
			<span class="weather-rain">
				<i
					v-for="(drop, index) in weatherRainDrops" :key="index"
					class="weather-rain-drop"
					:style="{
						'--rain-x': drop.x,
						'--rain-y': drop.y,
						'--rain-width': drop.width,
						'--rain-length': drop.length,
						'--rain-drop-duration': drop.duration,
						'--rain-drop-delay': drop.delay,
						'--rain-drop-alpha': drop.alpha,
						'--rain-drift': drop.drift,
					}"
				/>
			</span>
			<span class="weather-storm-flash" />
			<span class="weather-lightning" />
			<span class="weather-fog weather-mist-veil weather-fog-one" />
			<span class="weather-fog weather-mist-veil weather-fog-two" />
			<span class="weather-fog weather-mist-veil weather-fog-three" />
			<span class="weather-snow">
				<i
					v-for="index in 14" :key="index" :style="{
						'--snow-index': index,
						'--snow-x': `${(index * 37) % 100}%`,
						'--snow-size': `${3 + (index % 4)}px`,
						'--snow-duration': `${(4.8 + (index % 5) * 0.7).toFixed(1)}s`,
						'--snow-delay': `${(-index * 0.43).toFixed(2)}s`,
					}"
				/>
			</span>
			<span class="weather-ground-glow" />
		</div>

		<div class="weather-content">
			<header class="weather-current">
				<strong>{{ Math.round(weather.temperature) }}°</strong>
				<div>
					<Icon class="weather-symbol" :name="weatherIcon" />
					<span>{{ weather.condition }}</span>
					<small>{{ weather.city }}</small>
				</div>
			</header>

			<p class="weather-range">
				最高 {{ Math.round(weather.high) }}° · 最低 {{ Math.round(weather.low) }}°
			</p>
			<p class="weather-tip">
				{{ weather.tip }}
			</p>

			<dl class="weather-metrics">
				<div><dt>风速</dt><dd>{{ weather.windSpeed == null ? '—' : `${Math.round(weather.windSpeed)} km/h` }}</dd></div>
				<div><dt>降雨概率</dt><dd>{{ weather.precipitationProbability == null ? '—' : `${Math.round(weather.precipitationProbability)}%` }}</dd></div>
			</dl>

			<footer>
				<span>{{ weather.stale ? '使用最近成功数据' : `更新于 ${formatObservedAt(weather.observedAt)}` }}</span>
				<a :href="weather.sourceUrl" target="_blank" rel="noopener noreferrer">{{ weather.sourceName }}</a>
			</footer>
		</div>
	</article>

	<div v-else-if="weather?.reason === 'temporarily_unavailable'" class="weather-unavailable">
		<Icon name="tabler:cloud-off" />
		<span>{{ weather.message }}</span>
	</div>
	<button v-else-if="error" class="weather-retry" type="button" @click="load">
		天气加载失败，点击重试
	</button>
</BlogWidget>
</template>

<style scoped lang="scss">
.weather-live-label {
	display: inline-flex;
	align-items: center;
	gap: 0.28rem;
	font: 0.62rem var(--font-monospace);
	color: var(--c-text-2);
}

.weather-live-label i {
	width: 0.42rem;
	height: 0.42rem;
	border-radius: 50%;
	box-shadow: 0 0 0 0.18rem color-mix(in srgb, #42C77A 18%, transparent);
	background: #42C77A;
}

.weather-card {
	--weather-cloud-duration: 12s;
	--weather-rain-duration: 0.78s;
	--weather-rain-opacity: 0.72;
	--weather-wind-skew: 12deg;
	--weather-sky-top: #68B9FA;
	--weather-sky-bottom: #BDE2FF;

	contain: paint;
	position: relative;
	overflow: hidden;
	min-height: 19rem;
	border-radius: 1rem;
	box-shadow: inset 0 1px 0 rgb(255 255 255 / 48%), 0 18px 32px rgb(31 74 132 / 16%);
	background: linear-gradient(165deg, var(--weather-sky-top), var(--weather-sky-bottom));
	color: white;
	isolation: isolate;
}

.weather-card.is-night {
	--weather-sky-top: #172A55;
	--weather-sky-bottom: #607FA9;
}

.weather-card.is-rain {
	--weather-sky-top: #355F88;
	--weather-sky-bottom: #7EA5C3;
}

.weather-card.is-storm {
	--weather-sky-top: #182438;
	--weather-sky-bottom: #566A82;
}

.weather-card.is-snow {
	--weather-sky-top: #7BA4C6;
	--weather-sky-bottom: #D9ECF7;
}

.weather-card.is-fog {
	--weather-sky-top: #8396A9;
	--weather-sky-bottom: #D1DCE4;
}

.weather-scene {
	position: absolute;
	overflow: hidden;
	inset: 0;
	pointer-events: none;
	z-index: -1;
}

.weather-scene::before {
	content: "";
	position: absolute;
	inset: 0;
	background:
		radial-gradient(circle at var(--surface-x, 68%) var(--surface-y, 22%), rgb(255 255 255 / 22%), transparent 34%),
		linear-gradient(180deg, transparent 46%, rgb(27 63 105 / 16%));
}

.weather-celestial {
	position: absolute;
	opacity: 0;
	top: 12%;
	right: 12%;
	width: 4.5rem;
	aspect-ratio: 1;
	border-radius: 50%;
	transform: scale(0.25);
	transition: opacity 420ms cubic-bezier(0.2, 0, 0, 1), transform 520ms cubic-bezier(0.2, 0, 0, 1), filter 420ms cubic-bezier(0.2, 0, 0, 1);
	filter: blur(4px);
}

.is-day.is-clear .weather-sun,
.is-day.is-cloudy .weather-sun,
.is-night.is-clear .weather-moon,
.is-night.is-cloudy .weather-moon {
	opacity: 1;
	transform: scale(1);
	filter: blur(0);
}

.weather-sun {
	box-shadow: 0 0 0 0.75rem rgb(255 225 99 / 12%), 0 0 2.6rem rgb(255 211 86 / 68%);
	background: radial-gradient(circle at 38% 34%, #FFFBE0 0 8%, #FFDA75 48%, #EEB458 78%);
	animation: weather-sun-pulse 6.4s ease-in-out infinite alternate;
}

.weather-sun-corona {
	position: absolute;
	opacity: 0.7;
	inset: -1.15rem;
	border-radius: 50%;
	background: conic-gradient(from 17deg, transparent 0 8%, rgb(255 224 122 / 24%) 12%, transparent 20% 35%, rgb(255 237 170 / 18%) 43%, transparent 52% 70%, rgb(255 211 91 / 20%) 79%, transparent 88%);
	mask: radial-gradient(circle, transparent 0 54%, #000 59%, transparent 76%);
	animation: weather-sun-corona 11s ease-in-out -3s infinite alternate;
}

.weather-sun-glint {
	position: absolute;
	top: 0.55rem;
	left: 0.72rem;
	width: 1rem;
	height: 0.48rem;
	border-radius: 50%;
	background: rgb(255 255 239 / 68%);
	transform: rotate(-28deg);
	filter: blur(2px);
}

.weather-moon {
	box-shadow: 0 0 0 0.65rem rgb(220 233 255 / 10%), 0 0 2.4rem rgb(218 232 255 / 62%);
	background: radial-gradient(circle at 36% 32%, #FFF, #DCE8FA 58%, #B8C8E0);
	animation: weather-moon-float 5s ease-in-out infinite;
}

.weather-moon i {
	position: absolute;
	inset: 0;
	border-radius: inherit;
}

.weather-moon i::before,
.weather-moon i::after {
	content: "";
	position: absolute;
	border-radius: 50%;
	background: rgb(126 151 188 / 18%);
}

.weather-moon i::before {
	top: 24%;
	left: 18%;
	width: 1rem;
	height: 1rem;
}

.weather-moon i::after {
	right: 17%;
	bottom: 22%;
	width: 0.72rem;
	height: 0.72rem;
}

.weather-stars {
	position: absolute;
	opacity: 0;
	inset: 0;
	transition: opacity 420ms ease;
}

.is-night.is-clear .weather-stars,
.is-night.is-cloudy .weather-stars {
	opacity: 0.72;
}

.weather-card.is-day .weather-stars {
	opacity: 0;
	transition-delay: 0ms;
}

.weather-star-twinkle {
	position: absolute;
	top: var(--star-y);
	left: var(--star-x);
	width: var(--star-size);
	aspect-ratio: 1;
	border-radius: 50%;
	box-shadow: 0 0 0.35rem rgb(224 240 255 / 34%);
	background: rgb(247 251 255 / var(--star-alpha));
	animation: weather-star-twinkle var(--star-duration) ease-in-out var(--star-delay) infinite alternate;
}

.weather-cloud {
	display: none;
	position: absolute;
	width: 8.2rem;
	height: 2.8rem;
	border-radius: 999px;
	box-shadow: 0 10px 20px rgb(42 74 113 / 12%);
	background: rgb(238 247 255 / 90%);
	animation: weather-cloud-drift var(--weather-cloud-duration) linear infinite;
}

.weather-cloud::before,
.weather-cloud::after,
.weather-cloud i,
.weather-cloud b {
	content: "";
	position: absolute;
	border-radius: 50%;
	background: inherit;
}

.weather-cloud::before {
	top: -1.5rem;
	left: 1.1rem;
	width: 3.5rem;
	height: 3.5rem;
}

.weather-cloud::after {
	top: -1.1rem;
	right: 0.8rem;
	width: 2.8rem;
	height: 2.8rem;
}

.weather-cloud i {
	top: -2rem;
	left: 3.3rem;
	width: 4rem;
	height: 4rem;
}

.weather-cloud b {
	inset: auto 0 -0.35rem;
	height: 1rem;
	border-radius: 999px;
}

.is-cloudy .weather-cloud,
.is-rain .weather-cloud,
.is-storm .weather-cloud,
.is-snow .weather-cloud {
	display: block;
}

.weather-cloud-back {
	opacity: 0.66;
	top: 30%;
	left: -6.5rem;
	transform: scale(0.75);
	animation-delay: calc(var(--weather-cloud-duration) * -0.58);
}

.weather-cloud-front {
	top: 48%;
	left: -8.5rem;
	animation-delay: calc(var(--weather-cloud-duration) * -0.18);
}

.is-rain .weather-cloud,
.is-storm .weather-cloud {
	background: rgb(179 199 217 / 90%);
}

.is-storm .weather-cloud {
	background: rgb(106 124 146 / 94%);
}

.weather-rain {
	display: none;
	position: absolute;
	opacity: var(--weather-rain-opacity);
	inset: 24% -8% 0;
}

.is-rain .weather-rain,
.is-storm .weather-rain {
	display: block;
}

.weather-rain-drop {
	position: absolute;
	opacity: 0;
	top: var(--rain-y);
	left: var(--rain-x);
	width: var(--rain-width);
	height: var(--rain-length);
	border-radius: 999px;
	background: linear-gradient(180deg, transparent, rgb(229 247 252 / var(--rain-drop-alpha)) 36%, rgb(245 252 255 / 86%));
	transform: translate3d(0, -3.25rem, 0) rotate(var(--weather-wind-skew));
	animation: weather-rain-drop var(--rain-drop-duration) linear var(--rain-drop-delay) infinite;
}

.weather-storm-flash {
	display: none;
	position: absolute;
	opacity: 0;
	inset: 0;
	background: radial-gradient(ellipse at 72% 25%, rgb(255 249 205 / 86%), rgb(191 219 235 / 28%) 26%, transparent 61%);
}

.is-storm .weather-storm-flash {
	display: block;
	animation: weather-storm-flash 6.7s linear infinite;
}

.weather-lightning {
	display: none;
	position: absolute;
	top: 22%;
	right: 28%;
	width: 2.6rem;
	height: 6rem;
	background: #FFF6A9;
	clip-path: polygon(54% 0, 100% 0, 63% 39%, 96% 39%, 24% 100%, 42% 54%, 8% 54%);
	animation: weather-lightning 4.8s steps(1, end) infinite;
	filter: drop-shadow(0 0 12px #FFF2A2);
}

.is-storm .weather-lightning {
	display: block;
}

.weather-fog {
	display: none;
	position: absolute;
	left: -30%;
	width: 150%;
	height: 4.5rem;
	border-radius: 50%;
	background: radial-gradient(ellipse, rgb(245 250 253 / 78%), transparent 68%);
	animation: weather-fog 8s ease-in-out infinite alternate;
	filter: blur(6px);
}

.is-fog .weather-fog {
	display: block;
}

.weather-fog-one { top: 18%; }

.weather-fog-two {
	top: 43%;
	animation-delay: -2.5s;
}

.weather-fog-three {
	top: 68%;
	animation-delay: -5s;
}

.weather-snow {
	display: none;
	position: absolute;
	inset: 0;
}

.is-snow .weather-snow {
	display: block;
}

.weather-snow i {
	position: absolute;
	top: -1rem;
	left: var(--snow-x);
	width: var(--snow-size);
	aspect-ratio: 1;
	border-radius: 50%;
	box-shadow: 0 0 7px rgb(255 255 255 / 72%);
	background: white;
	animation: weather-snow-fall var(--snow-duration) linear infinite;
	animation-delay: var(--snow-delay);
}

.weather-ground-glow {
	position: absolute;
	inset: auto -15% -25%;
	height: 42%;
	border-radius: 50%;
	background: radial-gradient(ellipse, rgb(255 255 255 / 28%), transparent 70%);
}

.weather-content {
	display: grid;
	align-content: end;
	position: relative;
	min-height: 19rem;
	padding: 1rem;
	text-shadow: 0 2px 12px rgb(17 48 84 / 38%);
	z-index: 1;
}

.weather-current {
	display: flex;
	align-items: flex-end;
	gap: 0.6rem;
}

.weather-current > strong {
	font-family: var(--font-creative);
	font-size: 4rem;
	font-weight: 560;
	letter-spacing: -0.08em;
	line-height: 0.85;
}

.weather-current > div {
	display: grid;
	gap: 0.05rem;
	padding-bottom: 0.1rem;
}

.weather-current span {
	font-family: var(--font-creative);
	font-size: 1rem;
	font-weight: 650;
}

.weather-current small {
	opacity: 0.82;
	font-size: 0.68rem;
}

.weather-symbol {
	font-size: 1.35rem;
}

.weather-range {
	margin-top: 0.8rem;
	font-size: 0.72rem;
	font-weight: 650;
}

.weather-tip {
	min-height: 2.2em;
	margin-top: 0.35rem;
	font-size: 0.68rem;
	line-height: 1.6;
}

.weather-metrics {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.45rem;
	margin-top: 0.75rem;
}

.weather-metrics div {
	padding: 0.48rem 0.55rem;
	border: 1px solid rgb(255 255 255 / 22%);
	border-radius: 0.65rem;
	background:
		linear-gradient(145deg, rgb(255 255 255 / 10%), transparent 52%),
		rgb(255 255 255 / 15%);
	backdrop-filter: none;
}

.weather-metrics dt {
	opacity: 0.76;
	font-size: 0.58rem;
}

.weather-metrics dd {
	margin-top: 0.08rem;
	font: 0.7rem var(--font-monospace);
}

.weather-card footer {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	margin-top: 0.7rem;
	font-size: 0.58rem;
}

.weather-card footer a {
	text-decoration: underline;
}

.weather-skeleton {
	height: 19rem;
	border-radius: 1rem;
	background: linear-gradient(110deg, var(--c-bg-soft) 30%, var(--c-primary-soft) 50%, var(--c-bg-soft) 70%);
	background-size: 220% 100%;
	animation: weather-skeleton 1.4s ease-in-out infinite;
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

@keyframes weather-sun-pulse {
	from {
		opacity: 0.92;
		transform: scale(0.97);
	}

	to {
		opacity: 1;
		transform: scale(1.04);
	}
}

@keyframes weather-sun-corona {
	from {
		opacity: 0.48;
		transform: rotate(-7deg) scale(0.94);
	}

	to {
		opacity: 0.82;
		transform: rotate(9deg) scale(1.08);
	}
}

@keyframes weather-moon-float {
	50% { transform: translateY(-7px); }
}

@keyframes weather-star-twinkle {
	from {
		opacity: 0.28;
		transform: scale(0.72);
	}

	to {
		opacity: 1;
		transform: scale(1.18);
	}
}

@keyframes weather-cloud-drift {
	to { transform: translateX(23rem); }
}

@keyframes weather-rain-drop {
	0% {
		opacity: 0;
		transform: translate3d(0, -3.25rem, 0) rotate(var(--weather-wind-skew));
	}

	10%, 78% { opacity: var(--rain-drop-alpha); }

	100% {
		opacity: 0;
		transform: translate3d(var(--rain-drift), 19.5rem, 0) rotate(var(--weather-wind-skew));
	}
}

@keyframes weather-storm-flash {
	0%, 72%, 100% { opacity: 0; }
	72.7% { opacity: 0.62; }
	73.4% { opacity: 0.08; }
	74% { opacity: 0.34; }
	75.2% { opacity: 0; }
}

@keyframes weather-lightning {
	0%, 42%, 46%, 49%, 100% { opacity: 0; }
	43%, 47% { opacity: 1; }
}

@keyframes weather-fog {
	from {
		opacity: 0.48;
		transform: translateX(-5%);
	}

	to {
		opacity: 0.88;
		transform: translateX(8%);
	}
}

@keyframes weather-snow-fall {
	to { transform: translate3d(1.6rem, 21rem, 0) rotate(1turn); }
}

@keyframes weather-skeleton {
	to { background-position: -120% 0; }
}

@media (prefers-reduced-transparency: reduce) {
	.weather-metrics div {
		background: rgb(37 69 104 / 55%);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.weather-skeleton,
	.weather-sun,
	.weather-sun-corona,
	.weather-moon,
	.weather-star-twinkle,
	.weather-cloud,
	.weather-rain-drop,
	.weather-storm-flash,
	.weather-lightning,
	.weather-fog,
	.weather-snow i {
		animation: none;
	}
}
</style>
