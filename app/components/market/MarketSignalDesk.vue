<script setup lang="ts">
import type { MarketSignalDeskResponse, MarketSignalItem } from '#shared/market'
import { isShanghaiMarketWindow, millisecondsUntilNextShanghaiWindow, SIGNAL_MARKET_WINDOWS } from '~/utils/market-polling'

type SignalFilter = 'all' | 'up' | 'down' | 'attention'

interface Props {
	authenticated: boolean
	sessionLoading: boolean
}

const props = defineProps<Props>()

const data = ref<MarketSignalDeskResponse | null>(null)
const loading = ref(false)
const error = ref('')
const filter = ref<SignalFilter>('all')
const requestInFlight = ref(false)
const pollingActive = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let wakeTimer: ReturnType<typeof setTimeout> | null = null
let requestController: AbortController | null = null
let signalDeskMounted = false

const filters: Array<{ id: SignalFilter, label: string }> = [
	{ id: 'all', label: '全部' },
	{ id: 'up', label: '上行' },
	{ id: 'down', label: '下行' },
	{ id: 'attention', label: '关注价' },
]

const signalTime = new Intl.DateTimeFormat('zh-CN', {
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: 'Asia/Shanghai',
})

const filteredItems = computed(() => data.value?.items.filter((item) => {
	if (filter.value === 'all')
		return true
	if (filter.value === 'attention')
		return item.signalType.startsWith('attention_cross_')
	return item.direction === filter.value
}) ?? [])

const totalCount = computed(() => data.value?.summary?.totalCount ?? data.value?.items.length ?? 0)
const strongCount = computed(() => data.value?.summary?.strongCount ?? data.value?.items.filter(item => item.severity === 'strong').length ?? 0)
const latestMarketAt = computed(() => data.value?.marketAt ? formatSignalTime(data.value.marketAt) : '--:--')

function isSignalTradingWindow(value = new Date()) {
	return isShanghaiMarketWindow(value, SIGNAL_MARKET_WINDOWS)
}

function formatSignalTime(value: string) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? '--:--' : signalTime.format(date)
}

function signedPercent(value: number | null) {
	if (value === null || !Number.isFinite(value))
		return null
	return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function compactMoney(value: number | null) {
	if (value === null || !Number.isFinite(value))
		return null
	const absolute = Math.abs(value)
	if (absolute >= 100_000_000)
		return `${(value / 100_000_000).toFixed(2)}亿`
	if (absolute >= 10_000)
		return `${(value / 10_000).toFixed(0)}万`
	return value.toFixed(0)
}

function evidenceLabels(item: MarketSignalItem) {
	const labels: string[] = []
	const price5 = signedPercent(item.evidence.priceMove5mPct)
	if (price5)
		labels.push(`5m ${price5}`)
	if (item.evidence.flowBasis === 'turnover' && item.evidence.flowRatio !== null) {
		const amount = compactMoney(item.evidence.flowDelta)
		labels.push(`5m成交额 ${item.evidence.flowRatio.toFixed(1)}x${amount ? ` · ${amount}` : ''}`)
	}
	if (item.signalType === 'breakout_up')
		labels.push('30m区间上破')
	else if (item.signalType === 'breakdown_down')
		labels.push('30m区间下破')
	if (item.signalType.startsWith('attention_cross_') && item.evidence.attentionPrice !== null)
		labels.push(`关注价 ${item.evidence.attentionPrice.toFixed(2)}`)
	return labels.slice(0, 3)
}

function stopPolling(options: { abort?: boolean } = {}) {
	if (timer) {
		clearInterval(timer)
		timer = null
	}
	if (wakeTimer) {
		clearTimeout(wakeTimer)
		wakeTimer = null
	}
	pollingActive.value = false
	if (options.abort) {
		const controller = requestController
		requestController = null
		requestInFlight.value = false
		loading.value = false
		controller?.abort()
	}
}

async function loadSignals(options: { background?: boolean } = {}) {
	if (!signalDeskMounted || !props.authenticated || requestInFlight.value)
		return
	requestInFlight.value = true
	if (!options.background)
		loading.value = true
	error.value = ''
	const controller = new AbortController()
	requestController = controller
	try {
		const response = await $fetch<{ data: MarketSignalDeskResponse }>('/api/admin/market/signals', {
			query: { limit: 100 },
			signal: controller.signal,
		})
		if (!controller.signal.aborted)
			data.value = response.data
	}
	catch (cause) {
		if (!controller.signal.aborted)
			error.value = cause instanceof Error ? cause.message : '信号数据加载失败'
	}
	finally {
		if (requestController === controller) {
			requestController = null
			requestInFlight.value = false
			if (!options.background)
				loading.value = false
		}
	}
}

function schedulePollingWakeup() {
	const delay = millisecondsUntilNextShanghaiWindow(new Date(), SIGNAL_MARKET_WINDOWS)
	if (delay === null)
		return
	wakeTimer = setTimeout(() => {
		wakeTimer = null
		if (!props.authenticated || document.visibilityState !== 'visible')
			return
		if (isSignalTradingWindow(new Date()))
			void loadSignals({ background: true }).finally(() => startPolling())
		else
			startPolling()
	}, Math.max(250, delay + 250))
}

function startPolling() {
	stopPolling()
	if (!import.meta.client || !signalDeskMounted || !props.authenticated)
		return
	if (document.visibilityState !== 'visible')
		return
	if (!isSignalTradingWindow(new Date())) {
		schedulePollingWakeup()
		return
	}
	pollingActive.value = true
	timer = setInterval(() => {
		if (props.authenticated && document.visibilityState === 'visible' && isSignalTradingWindow(new Date()))
			void loadSignals({ background: true })
		else
			startPolling()
	}, 60_000)
}

function refreshSignals() {
	void loadSignals().finally(() => startPolling())
}

function handleVisibilityChange() {
	if (document.visibilityState !== 'visible') {
		stopPolling({ abort: true })
		return
	}
	if (props.authenticated)
		void loadSignals({ background: true }).finally(() => startPolling())
}

watch(() => props.authenticated, (authenticated) => {
	stopPolling({ abort: true })
	if (!authenticated) {
		data.value = null
		error.value = ''
		return
	}
	void loadSignals().finally(() => startPolling())
})

onMounted(() => {
	signalDeskMounted = true
	document.addEventListener('visibilitychange', handleVisibilityChange)
	if (props.authenticated)
		void loadSignals().finally(() => startPolling())
})

onBeforeUnmount(() => {
	signalDeskMounted = false
	document.removeEventListener('visibilitychange', handleVisibilityChange)
	stopPolling({ abort: true })
})
</script>

<template>
<section class="market-signal-desk">
	<header class="signal-desk-header">
		<div>
			<span>SIGNAL DESK · PRIVATE</span>
			<h2>信号雷达</h2>
			<p>基于 5 分钟真实行情形成均衡型观察信号，仅用于盘中观察。</p>
		</div>
		<div v-if="authenticated" class="signal-header-actions">
			<span class="signal-auto-state" :data-active="pollingActive">
				<i aria-hidden="true" />{{ pollingActive ? '60s 自动刷新' : '盘外手动刷新' }}
			</span>
			<button type="button" :disabled="loading || requestInFlight" @click="refreshSignals">
				<Icon name="tabler:refresh" aria-hidden="true" />{{ loading ? '刷新中' : '刷新' }}
			</button>
		</div>
		<b>仅观察</b>
	</header>

	<div v-if="sessionLoading" class="signal-state signal-loading" aria-label="登录状态加载中">
		<Icon name="tabler:loader-2" aria-hidden="true" />
		<strong>正在确认私有会话</strong>
	</div>

	<div v-else-if="!authenticated" class="signal-state signal-private">
		<Icon name="tabler:lock" aria-hidden="true" />
		<strong>信号雷达 · 私有</strong>
		<p>登录后查看你的私有自选股盘中观察信号。</p>
		<NuxtLink to="/admin/login">
			登录管理端
		</NuxtLink>
	</div>

	<template v-else>
		<div v-if="data" class="signal-summary" aria-label="信号摘要">
			<div><span>今日信号</span><strong>{{ totalCount }}</strong></div>
			<div><span>重点观察</span><strong>{{ strongCount }}</strong></div>
			<div><span>基线 READY</span><strong>{{ data.baseline.readyCount }}</strong></div>
			<div><span>基线积累</span><strong>{{ data.baseline.warmingCount }}</strong></div>
			<div><span>最后行情</span><strong>{{ latestMarketAt }}</strong></div>
		</div>

		<div v-if="error && data" class="signal-refresh-warning" role="status">
			<Icon name="tabler:alert-triangle" aria-hidden="true" />
			<span><strong>刷新失败，保留上次真实信号</strong><small>{{ error }}</small></span>
		</div>

		<div v-if="error && !data" class="signal-state signal-error" role="alert">
			<Icon name="tabler:alert-triangle" aria-hidden="true" />
			<strong>信号数据暂不可用</strong>
			<p>{{ error }}</p>
			<button type="button" @click="refreshSignals">
				重新加载
			</button>
		</div>

		<div v-else-if="loading && !data" class="signal-state signal-loading" aria-label="信号加载中">
			<Icon name="tabler:loader-2" aria-hidden="true" />
			<strong>正在读取真实信号</strong>
		</div>

		<div v-else-if="data?.baseline.enabledCount === 0" class="signal-state signal-empty">
			<Icon name="tabler:star" aria-hidden="true" />
			<strong>还没有启用的自选股</strong>
			<p>先在“自选”工作区添加并启用股票，之后会基于真实 5 分钟行情形成观察信号。</p>
		</div>

		<div v-else-if="data && data.items.length === 0 && data.baseline.warmingCount > 0" class="signal-state signal-warming">
			<Icon name="tabler:hourglass-low" aria-hidden="true" />
			<strong>基线积累中</strong>
			<p>{{ data.baseline.readyCount }} 只已就绪 · {{ data.baseline.warmingCount }} 只仍在积累真实样本。历史不足时不会生成模拟信号。</p>
		</div>

		<div v-else-if="data && data.items.length === 0" class="signal-state signal-empty">
			<Icon name="tabler:activity-heartbeat" aria-hidden="true" />
			<strong>当前没有达到均衡型门槛的观察信号</strong>
			<p>规则暂未触发不代表涨跌预测；没有组合证据时不会为了填充页面生成信号。</p>
		</div>

		<template v-else-if="data">
			<div v-if="totalCount > data.items.length" class="signal-list-limit" role="note">
				<Icon name="tabler:list-details" aria-hidden="true" />
				<span>最近 {{ data.items.length }} / {{ totalCount }} 条 · 顶部统计仍为今日完整计数。</span>
			</div>

			<div v-if="data.baseline.warmingCount > 0" class="signal-warming-banner">
				<Icon name="tabler:hourglass-low" aria-hidden="true" />
				<span>基线积累中：{{ data.baseline.readyCount }} READY · {{ data.baseline.warmingCount }} WARMING</span>
			</div>

			<div class="signal-filters" role="group" aria-label="信号筛选">
				<button
					v-for="option in filters"
					:key="option.id"
					type="button"
					:class="{ active: filter === option.id }"
					:aria-pressed="filter === option.id"
					@click="filter = option.id"
				>
					{{ option.label }}
				</button>
			</div>

			<div v-if="filteredItems.length" class="signal-desktop" role="table" aria-label="盘中观察信号">
				<div class="signal-table-head" role="row">
					<span>时间</span><span>股票</span><span>方向</span><span>观察信号</span><span>评分</span><span>证据</span>
				</div>
				<article v-for="item in filteredItems" :key="item.id" class="signal-row" role="row">
					<time :datetime="item.marketAt">{{ formatSignalTime(item.marketAt) }}</time>
					<div class="signal-stock">
						<strong>{{ item.name }}</strong><span>{{ item.code }}</span>
					</div>
					<span class="signal-direction" :data-direction="item.direction">{{ item.direction === 'up' ? '↑ 上行' : item.direction === 'down' ? '↓ 下行' : '— 中性' }}</span>
					<div class="signal-title">
						<strong>{{ item.title }}</strong><span>{{ item.severity === 'strong' ? '重点观察' : '观察' }}</span>
					</div>
					<div class="signal-score" :data-severity="item.severity">
						<strong>{{ item.score }}</strong><span>/100</span>
					</div>
					<div class="signal-evidence">
						<span v-for="label in evidenceLabels(item)" :key="label">{{ label }}</span>
					</div>
				</article>
			</div>

			<div v-if="filteredItems.length" class="signal-mobile" aria-label="移动端盘中观察信号">
				<article v-for="item in filteredItems" :key="item.id" class="signal-card">
					<header>
						<div><time :datetime="item.marketAt">{{ formatSignalTime(item.marketAt) }}</time><strong>{{ item.name }}</strong><span>{{ item.code }}</span></div>
						<b :data-severity="item.severity">{{ item.severity === 'strong' ? '重点观察' : '观察' }} · {{ item.score }}</b>
					</header>
					<h3 :data-direction="item.direction">
						{{ item.direction === 'up' ? '↑ ' : item.direction === 'down' ? '↓ ' : '' }}{{ item.title }}
					</h3>
					<div class="signal-card-evidence">
						<span v-for="label in evidenceLabels(item)" :key="label">{{ label }}</span>
					</div>
				</article>
			</div>

			<div v-else class="signal-state signal-empty signal-filter-empty">
				<strong>当前筛选没有匹配信号</strong>
				<p>切换“全部”可查看今天其他已触发的观察信号。</p>
			</div>
		</template>

		<footer class="signal-discipline">
			<Icon name="tabler:shield-check" aria-hidden="true" />
			<span>仅基于真实快照和确定性规则；信号用于人工观察，不构成交易建议。</span>
		</footer>
	</template>
</section>
</template>

<style scoped lang="scss">
.market-signal-desk {
	overflow: hidden;
	min-height: 28rem;
	border: 1px solid var(--market-border);
	border-radius: 0.45rem;
	background: color-mix(in srgb, var(--market-panel) 97%, transparent);
}

.signal-desk-header {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto auto;
	align-items: center;
	gap: 0.8rem;
	padding: 0.8rem 0.9rem;
	border-bottom: 1px solid var(--market-border);
}

.signal-desk-header > div:first-child > span {
	font: 600 0.58rem var(--font-monospace);
	letter-spacing: 0.12em;
	color: var(--market-accent);
}

.signal-desk-header h2 {
	margin: 0.18rem 0 0;
	font-size: 1rem;
}

.signal-desk-header p {
	margin: 0.28rem 0 0;
	font-size: 0.67rem;
	line-height: 1.55;
	color: var(--market-text-2);
}

.signal-desk-header > b {
	padding: 0.24rem 0.44rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.28rem;
	background: var(--market-accent-soft);
	font: 700 0.56rem var(--font-monospace);
	color: var(--market-accent-strong);
}

.signal-header-actions {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.signal-auto-state {
	display: inline-flex;
	align-items: center;
	gap: 0.32rem;
	font: 0.58rem var(--font-monospace);
	white-space: nowrap;
	color: var(--market-text-3);
}

.signal-auto-state i {
	width: 0.42rem;
	height: 0.42rem;
	border-radius: 50%;
	background: var(--market-text-3);
}

.signal-auto-state[data-active="true"] i {
	box-shadow: 0 0 0 0.22rem var(--market-down-soft);
	background: var(--market-down);
}

.signal-header-actions button,
.signal-state button,
.signal-filters button {
	min-height: 2.75rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.35rem;
	background: var(--market-accent-soft);
	color: var(--market-accent-strong);
}

.signal-header-actions button {
	display: inline-flex;
	align-items: center;
	gap: 0.32rem;
	padding: 0.42rem 0.65rem;
	font-size: 0.66rem;
}

.signal-header-actions button:disabled {
	opacity: 0.5;
	cursor: wait;
}

.signal-summary {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 1px;
	border-bottom: 1px solid var(--market-border);
	background: var(--market-border);
}

.signal-summary > div {
	display: grid;
	gap: 0.25rem;
	padding: 0.7rem 0.8rem;
	background: var(--market-panel);
}

.signal-summary span {
	font: 0.55rem var(--font-monospace);
	letter-spacing: 0.06em;
	color: var(--market-text-3);
}

.signal-summary strong {
	font: 700 0.95rem var(--font-monospace);
	color: var(--market-text);
}

.signal-state {
	display: grid;
	justify-items: center;
	gap: 0.55rem;
	max-width: 38rem;
	margin: 2.2rem auto;
	padding: 1.25rem;
	text-align: center;
	color: var(--market-text-2);
}

.signal-state > .iconify {
	font-size: 1.5rem;
	color: var(--market-accent);
}

.signal-state strong {
	color: var(--market-text);
}

.signal-state p {
	margin: 0;
	font-size: 0.7rem;
	line-height: 1.65;
}

.signal-state a,
.signal-state button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0.48rem 0.75rem;
	font-size: 0.68rem;
	text-decoration: none;
}

.signal-loading > .iconify {
	animation: signal-spin 0.9s linear infinite;
}

.signal-error > .iconify {
	color: var(--market-danger);
}

.signal-list-limit {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	margin: 0 0 0.7rem;
	font-size: 0.6rem;
	color: var(--market-text-3);
}

.signal-list-limit > .iconify {
	flex: 0 0 auto;
	color: var(--market-accent);
}

.signal-refresh-warning {
	display: flex;
	align-items: flex-start;
	gap: 0.45rem;
	margin: 0 0 0.7rem;
	padding: 0.55rem 0.7rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-up-soft);
	color: var(--market-text-2);
}

.signal-refresh-warning > .iconify {
	flex: 0 0 auto;
	margin-top: 0.05rem;
	color: var(--market-danger);
}

.signal-refresh-warning span {
	display: grid;
	gap: 0.16rem;
}

.signal-refresh-warning strong {
	font-size: 0.68rem;
	color: var(--market-text);
}

.signal-refresh-warning small {
	font-size: 0.6rem;
	line-height: 1.45;
}

.signal-warming-banner {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	margin: 0.7rem 0.8rem 0;
	padding: 0.58rem 0.7rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-accent-soft);
	font: 0.6rem var(--font-monospace);
	color: var(--market-text-2);
}

.signal-warming-banner > .iconify {
	color: var(--market-accent);
}

.signal-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	padding: 0.75rem 0.8rem 0.6rem;
}

.signal-filters button {
	padding: 0.35rem 0.7rem;
	font: 0.62rem var(--font-monospace);
	color: var(--market-text-2);
}

.signal-filters button.active {
	box-shadow: inset 0 -2px 0 var(--market-accent);
	background: var(--market-accent-soft);
	color: var(--market-accent-strong);
}

.signal-desktop {
	overflow: hidden;
	margin: 0 0.8rem 0.8rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
}

.signal-table-head,
.signal-row {
	display: grid;
	grid-template-columns: 4.25rem minmax(7rem, 0.9fr) 5.25rem minmax(8rem, 1fr) 4.5rem minmax(11rem, 1.5fr);
	align-items: center;
	gap: 0.7rem;
	padding: 0.65rem 0.75rem;
}

.signal-table-head {
	background: var(--market-panel-raised);
	font: 0.54rem var(--font-monospace);
	letter-spacing: 0.06em;
	color: var(--market-text-3);
}

.signal-row {
	min-height: 4.5rem;
	border-top: 1px solid var(--market-border);
	background: var(--market-panel);
}

.signal-row time {
	font: 600 0.66rem var(--font-monospace);
	color: var(--market-text-2);
}

.signal-stock,
.signal-title,
.signal-score {
	display: grid;
	gap: 0.16rem;
}

.signal-stock strong,
.signal-title strong {
	font-size: 0.72rem;
	color: var(--market-text);
}

.signal-stock span,
.signal-title span,
.signal-score span {
	font: 0.55rem var(--font-monospace);
	color: var(--market-text-3);
}

.signal-direction {
	font: 700 0.65rem var(--font-monospace);
}

.signal-direction[data-direction="up"],
.signal-card h3[data-direction="up"] { color: var(--market-up); }

.signal-direction[data-direction="down"],
.signal-card h3[data-direction="down"] { color: var(--market-down); }

.signal-direction[data-direction="neutral"],
.signal-card h3[data-direction="neutral"] { color: var(--market-text-3); }

.signal-score strong {
	font: 750 1rem var(--font-monospace);
	color: var(--market-accent-strong);
}

.signal-score[data-severity="strong"] strong {
	color: var(--market-up);
}

.signal-evidence,
.signal-card-evidence {
	display: flex;
	flex-wrap: wrap;
	gap: 0.28rem;
}

.signal-evidence span,
.signal-card-evidence span {
	padding: 0.2rem 0.34rem;
	border: 1px solid var(--market-border);
	border-radius: 0.25rem;
	background: var(--c-bg-soft);
	font: 0.54rem var(--font-monospace);
	color: var(--market-text-2);
}

.signal-mobile {
	display: none;
}

.signal-card {
	display: grid;
	gap: 0.65rem;
	padding: 0.8rem;
	border: 1px solid var(--market-border);
	border-radius: 0.4rem;
	background: var(--market-panel);
}

.signal-card header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.6rem;
}

.signal-card header > div {
	display: flex;
	align-items: baseline;
	gap: 0.4rem;
	min-width: 0;
}

.signal-card time,
.signal-card header span {
	font: 0.55rem var(--font-monospace);
	color: var(--market-text-3);
}

.signal-card header strong {
	font-size: 0.75rem;
	color: var(--market-text);
}

.signal-card header b {
	flex: 0 0 auto;
	padding: 0.24rem 0.36rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.25rem;
	font: 700 0.55rem var(--font-monospace);
	color: var(--market-accent-strong);
}

.signal-card header b[data-severity="strong"] {
	border-color: color-mix(in srgb, var(--market-up) 45%, transparent);
	background: var(--market-up-soft);
	color: var(--market-up);
}

.signal-card h3 {
	margin: 0;
	font-size: 0.82rem;
}

.signal-discipline {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	margin: 0 0.8rem 0.8rem;
	padding-top: 0.7rem;
	border-top: 1px solid var(--market-border);
	font: 0.58rem/1.55 var(--font-monospace);
	color: var(--market-text-3);
}

.signal-discipline > .iconify {
	flex: 0 0 auto;
	color: var(--market-accent);
}

@keyframes signal-spin {
	to { transform: rotate(360deg); }
}

@media (max-width: 760px) {
	.signal-desk-header {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
	}

	.signal-header-actions {
		grid-column: 1 / -1;
		justify-content: space-between;
	}

	.signal-summary {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.signal-summary > div:last-child {
		grid-column: 1 / -1;
	}

	.signal-desktop { display: none; }

	.signal-mobile {
		display: grid;
		gap: 0.55rem;
		padding: 0 0.65rem 0.7rem;
	}

	.signal-filters {
		padding-inline: 0.65rem;
	}

	.signal-filters button,
	.signal-header-actions button,
	.signal-state button,
	.signal-state a {
		min-height: 44px;
	}

	.signal-warming-banner,
	.signal-discipline {
		margin-inline: 0.65rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.signal-loading > .iconify { animation: none; }
}

@media (prefers-reduced-transparency: reduce) {
	.market-signal-desk,
	.signal-row,
	.signal-card { background: var(--market-panel); }
}
</style>
