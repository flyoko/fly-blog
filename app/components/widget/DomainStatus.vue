<script setup lang="ts">
const appConfig = useAppConfig()
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined

const domain = computed(() => {
	try {
		return new URL(appConfig.url).hostname
	}
	catch {
		return appConfig.url
	}
})
const registeredAt = computed(() => new Date(appConfig.domainRegistration.registeredAt))
const expiresAt = computed(() => new Date(appConfig.domainRegistration.expiresAt))
const expired = computed(() => expiresAt.value.getTime() <= now.value.getTime())
const remainingDays = computed(() => Math.max(0, Math.ceil((expiresAt.value.getTime() - now.value.getTime()) / 86_400_000)))
const termProgress = computed(() => {
	const duration = expiresAt.value.getTime() - registeredAt.value.getTime()
	if (duration <= 0)
		return 100
	const elapsed = Math.min(Math.max(now.value.getTime() - registeredAt.value.getTime(), 0), duration)
	return Math.round(elapsed / duration * 100)
})
const status = computed(() => expired.value ? '已到期' : appConfig.domainRegistration.status)

function formatDateTime(date: Date): string {
	if (Number.isNaN(date.getTime()))
		return '时间配置无效'
	const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: appConfig.timeZone,
	}).formatToParts(date).map(part => [part.type, part.value]))
	return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

onMounted(() => {
	now.value = new Date()
	timer = setInterval(() => {
		now.value = new Date()
	}, 60_000)
})

onBeforeUnmount(() => {
	if (timer)
		clearInterval(timer)
})
</script>

<template>
<BlogWidget card title="域名续费提醒">
	<template #action>
		<span class="domain-status-badge" :class="{ 'is-expired': expired }">
			<i />{{ status }}
		</span>
	</template>

	<article class="domain-status-card">
		<a class="domain-name" :href="appConfig.url" target="_blank" rel="noopener noreferrer">
			<Icon name="tabler:world-www" />
			<strong>{{ domain }}</strong>
			<Icon class="domain-external-icon" name="tabler:external-link" />
		</a>

		<div class="domain-countdown" :class="{ 'is-expired': expired }">
			<Icon :name="expired ? 'tabler:alert-triangle' : 'tabler:calendar-time'" />
			<div>
				<strong>{{ expired ? '域名已到期' : `距离到期还有 ${remainingDays} 天` }}</strong>
				<span>{{ expired ? '请立即检查域名续费状态' : '建议提前 30 天完成续费' }}</span>
			</div>
		</div>

		<div class="domain-term-progress" role="progressbar" aria-label="当前注册周期进度" :aria-valuenow="termProgress" aria-valuemin="0" aria-valuemax="100">
			<i :style="{ width: `${termProgress}%` }" />
		</div>

		<dl class="domain-dates">
			<div>
				<dt>注册时间</dt>
				<dd>{{ formatDateTime(registeredAt) }}</dd>
			</div>
			<div>
				<dt>到期时间</dt>
				<dd>{{ formatDateTime(expiresAt) }}</dd>
			</div>
		</dl>
	</article>
</BlogWidget>
</template>

<style scoped lang="scss">
.domain-status-badge {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	font: 0.62rem var(--font-monospace);
	color: var(--c-text-2);
}

.domain-status-badge i {
	width: 0.42rem;
	height: 0.42rem;
	border-radius: 50%;
	box-shadow: 0 0 0 0.18rem color-mix(in srgb, #42C77A 18%, transparent);
	background: #42C77A;
}

.domain-status-badge.is-expired {
	color: var(--c-danger, #E65B65);
}

.domain-status-badge.is-expired i {
	box-shadow: 0 0 0 0.18rem color-mix(in srgb, #E65B65 18%, transparent);
	background: #E65B65;
}

.domain-status-card {
	display: grid;
	gap: 0.75rem;
}

.domain-name {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
	padding: 0.15rem 0;
	color: var(--c-text-1);
}

.domain-name > :first-child {
	font-size: 1.15rem;
	color: var(--c-primary);
}

.domain-name strong {
	overflow: hidden;
	font: 700 0.9rem var(--font-monospace);
	white-space: nowrap;
	text-overflow: ellipsis;
}

.domain-external-icon {
	font-size: 0.78rem;
	color: var(--c-text-3);
}

.domain-countdown {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	gap: 0.6rem;
	padding: 0.65rem 0.7rem;
	border: 1px solid color-mix(in srgb, var(--c-primary) 20%, var(--c-surface-line));
	border-radius: 0.68rem;
	background: color-mix(in srgb, var(--c-primary) 8%, transparent);
}

.domain-countdown > svg {
	font-size: 1.2rem;
	color: var(--c-primary);
}

.domain-countdown > div {
	display: grid;
	gap: 0.12rem;
}

.domain-countdown strong {
	font-size: 0.76rem;
	color: var(--c-text-1);
}

.domain-countdown span {
	font-size: 0.65rem;
	color: var(--c-text-3);
}

.domain-countdown.is-expired {
	border-color: color-mix(in srgb, #E65B65 28%, var(--c-surface-line));
	background: color-mix(in srgb, #E65B65 9%, transparent);
}

.domain-countdown.is-expired > svg {
	color: #E65B65;
}

.domain-term-progress {
	overflow: hidden;
	height: 0.3rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--c-text-3) 16%, transparent);
}

.domain-term-progress i {
	display: block;
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, var(--c-primary), #42C77A);
	transition: width 0.3s ease;
}

.domain-dates {
	display: grid;
	gap: 0.45rem;
	margin: 0;
}

.domain-dates > div {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.8rem;
}

.domain-dates dt,
.domain-dates dd {
	margin: 0;
	font-size: 0.68rem;
}

.domain-dates dt {
	color: var(--c-text-3);
}

.domain-dates dd {
	font-family: var(--font-monospace);
	text-align: end;
	color: var(--c-text-2);
}

@media (max-width: $breakpoint-widescreen) {
	.domain-dates > div {
		flex-direction: column;
		align-items: start;
		gap: 0.15rem;
	}

	.domain-dates dd {
		text-align: start;
	}
}

@media (prefers-reduced-motion: reduce) {
	.domain-term-progress i {
		transition: none;
	}
}
</style>
