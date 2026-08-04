<script setup lang="ts">
import type {
	AnalyticsBotRankDto,
	AnalyticsCollectorStatusDto,
	AnalyticsDevicesDto,
	AnalyticsGeoRankDto,
	AnalyticsMetricDto,
	AnalyticsPageRankDto,
	AnalyticsRealtimeDto,
	AnalyticsSummaryDto,
	AnalyticsTimeseriesPointDto,
	AnalyticsTrafficType,
	AnalyticsVisitorsDto,
} from '#shared/admin/analytics'
import { ANALYTICS_VISITOR_PAGE_SIZE } from '#shared/admin/analytics'
import { formatAnalyticsLocation, localizeAnalyticsCity } from '~/utils/analytics-location'

interface PanelState<T> {
	data: T | null
	loading: boolean
	error: string
	request: number
}

type RangePreset = 'today' | '7d' | '30d' | 'custom'

interface AnalyticsRangeValue {
	from: string
	to: string
	timezone: string
}

interface IpRevealState {
	value: string
	loading: boolean
	error: string
}

function createPanelState<T>(): PanelState<T> {
	return reactive({ data: null, loading: false, error: '', request: 0 }) as PanelState<T>
}

async function loadPanel<T>(panel: PanelState<T>, loader: () => Promise<T>, fallback: string): Promise<void> {
	const request = ++panel.request
	panel.loading = true
	panel.error = ''
	try {
		const data = await loader()
		if (request === panel.request)
			panel.data = data
	}
	catch (cause) {
		if (request === panel.request)
			panel.error = cause instanceof Error ? cause.message : fallback
	}
	finally {
		if (request === panel.request)
			panel.loading = false
	}
}

function timezoneOffset(date = new Date()): string {
	const minutes = -date.getTimezoneOffset()
	if (minutes === 0)
		return 'UTC'
	const sign = minutes >= 0 ? '+' : '-'
	const absolute = Math.abs(minutes)
	return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

function startOfLocalDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function inputDate(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

function presetRange(preset: Exclude<RangePreset, 'custom'>, now = new Date()): AnalyticsRangeValue {
	const from = startOfLocalDay(now)
	if (preset === '7d')
		from.setDate(from.getDate() - 6)
	if (preset === '30d')
		from.setDate(from.getDate() - 29)
	return { from: from.toISOString(), to: now.toISOString(), timezone: timezoneOffset(now) }
}

function formatNumber(value: number | null | undefined, digits = 0): string {
	if (value === null || value === undefined)
		return '—'
	return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value)
}

function formatDateTime(value: string | null | undefined): string {
	if (!value)
		return '—'
	const date = new Date(value)
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat('zh-CN', {
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			}).format(date)
}

function metricChange(metric: AnalyticsMetricDto | undefined): string {
	if (!metric)
		return '等待数据'
	if (metric.changePercent === null)
		return metric.value ? '上一周期无数据' : '暂无变化'
	if (metric.changePercent === 0)
		return '与上一周期持平'
	return `${metric.changePercent > 0 ? '↑' : '↓'} ${formatNumber(Math.abs(metric.changePercent), 1)}%`
}

function trafficLabel(type: AnalyticsTrafficType): string {
	return type === 'human' ? '真人' : type === 'bot' ? '爬虫' : '可疑自动流量'
}

function trafficTone(type: AnalyticsTrafficType): 'positive' | 'warning' | 'neutral' {
	return type === 'human' ? 'positive' : type === 'bot' ? 'neutral' : 'warning'
}

useSeoMeta({ title: '访问分析', robots: 'noindex, nofollow' })

const statusPanel = createPanelState<AnalyticsCollectorStatusDto>()
const summaryPanel = createPanelState<AnalyticsSummaryDto>()
const timeseriesPanel = createPanelState<AnalyticsTimeseriesPointDto[]>()
const realtimePanel = createPanelState<AnalyticsRealtimeDto>()
const pagesPanel = createPanelState<AnalyticsPageRankDto[]>()
const geoPanel = createPanelState<AnalyticsGeoRankDto[]>()
const devicesPanel = createPanelState<AnalyticsDevicesDto>()
const visitorsPanel = createPanelState<AnalyticsVisitorsDto>()
const botsPanel = createPanelState<AnalyticsBotRankDto[]>()

const rangePreset = ref<RangePreset>('7d')
const range = ref<AnalyticsRangeValue>(presetRange('7d'))
const today = new Date()
const customFrom = ref(inputDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)))
const customTo = ref(inputDate(today))
const visitorPage = ref(1)
const exporting = ref(false)
const pageError = ref('')
const visitorFilters = reactive({
	path: '',
	country: '',
	city: '',
	device: '',
	trafficType: 'human' as AnalyticsTrafficType,
})
const ipReveals = reactive<Record<string, IpRevealState>>({})
const ipTimers = new Map<number, ReturnType<typeof setTimeout>>()
let realtimeTimer: ReturnType<typeof setInterval> | null = null

const rangeLabel = computed(() => {
	const formatter = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' })
	return `${formatter.format(new Date(range.value.from))}—${formatter.format(new Date(range.value.to))}`
})

const newVisitorRatio = computed(() => summaryPanel.data?.visitors.value
	? (summaryPanel.data.newVisitors.value / summaryPanel.data.visitors.value) * 100
	: 0)

const collectorStatus = computed(() => {
	if (statusPanel.loading && !statusPanel.data)
		return { label: '状态检查中', tone: 'neutral' as const }
	if (statusPanel.error)
		return { label: '状态不可用', tone: 'warning' as const }
	return statusPanel.data?.enabled
		? { label: '采集中', tone: 'positive' as const }
		: { label: '采集已关闭', tone: 'warning' as const }
})

const kpis = computed(() => [
	{ label: '页面浏览', value: formatNumber(summaryPanel.data?.pageviews.value), note: metricChange(summaryPanel.data?.pageviews), icon: 'tabler:eye' },
	{ label: '独立访客', value: formatNumber(summaryPanel.data?.visitors.value), note: metricChange(summaryPanel.data?.visitors), icon: 'tabler:users' },
	{ label: '会话', value: formatNumber(summaryPanel.data?.sessions.value), note: metricChange(summaryPanel.data?.sessions), icon: 'tabler:route' },
	{ label: '新访客', value: formatNumber(summaryPanel.data?.newVisitors.value), note: `${formatNumber(newVisitorRatio.value, 1)}% 占比`, icon: 'tabler:user-plus' },
	{ label: '平均浏览深度', value: formatNumber(summaryPanel.data?.averageDepth.value, 1), note: '每次会话页面数', icon: 'tabler:layers-subtract' },
])

const visitorTotalPages = computed(() => Math.max(1, Math.ceil((visitorsPanel.data?.total ?? 0) / (visitorsPanel.data?.pageSize ?? ANALYTICS_VISITOR_PAGE_SIZE))))

function queryString(extra: Record<string, string | number | undefined> = {}): string {
	const params = new URLSearchParams({ from: range.value.from, to: range.value.to, timezone: range.value.timezone })
	for (const [key, value] of Object.entries(extra)) {
		if (value !== undefined && value !== '')
			params.set(key, String(value))
	}
	return params.toString()
}

function visitorQuery(): string {
	return queryString({
		page: visitorPage.value,
		pageSize: ANALYTICS_VISITOR_PAGE_SIZE,
		path: visitorFilters.path.trim() || undefined,
		country: visitorFilters.country.trim().toUpperCase() || undefined,
		city: visitorFilters.city.trim() || undefined,
		device: visitorFilters.device || undefined,
		trafficType: visitorFilters.trafficType,
	})
}

function loadStatus() {
	return loadPanel(statusPanel, () => useAdminApi('/api/admin/analytics/status'), '采集状态加载失败')
}

function loadSummary() {
	return loadPanel(summaryPanel, () => useAdminApi(`/api/admin/analytics/summary?${queryString()}`), '核心指标加载失败')
}

function loadTimeseries() {
	return loadPanel(timeseriesPanel, () => useAdminApi(`/api/admin/analytics/timeseries?${queryString()}`), '访问趋势加载失败')
}

function loadRealtime() {
	return loadPanel(realtimePanel, () => useAdminApi('/api/admin/analytics/realtime'), '实时访客加载失败')
}

function loadPages() {
	return loadPanel(pagesPanel, () => useAdminApi(`/api/admin/analytics/pages?${queryString()}`), '热门页面加载失败')
}

function loadGeo() {
	return loadPanel(geoPanel, () => useAdminApi(`/api/admin/analytics/geo?${queryString()}`), '地域分布加载失败')
}

function loadDevices() {
	return loadPanel(devicesPanel, () => useAdminApi(`/api/admin/analytics/devices?${queryString()}`), '设备分布加载失败')
}

function loadVisitors() {
	return loadPanel(visitorsPanel, () => useAdminApi(`/api/admin/analytics/visitors?${visitorQuery()}`), '最近访客加载失败')
}

function loadBots() {
	return loadPanel(botsPanel, () => useAdminApi(`/api/admin/analytics/bots?${queryString()}`), '爬虫统计加载失败')
}

async function refreshAll(): Promise<void> {
	pageError.value = ''
	await Promise.allSettled([
		loadStatus(),
		loadSummary(),
		loadTimeseries(),
		loadRealtime(),
		loadPages(),
		loadGeo(),
		loadDevices(),
		loadVisitors(),
		loadBots(),
	])
}

function setPreset(preset: Exclude<RangePreset, 'custom'>): void {
	rangePreset.value = preset
	range.value = presetRange(preset)
	visitorPage.value = 1
	void refreshAll()
}

function applyCustomRange(): void {
	const from = new Date(`${customFrom.value}T00:00:00`)
	const to = new Date(`${customTo.value}T23:59:59.999`)
	if (!customFrom.value || !customTo.value || from >= to) {
		pageError.value = '自定义时间范围无效，请检查开始和结束日期。'
		return
	}
	rangePreset.value = 'custom'
	range.value = { from: from.toISOString(), to: to.toISOString(), timezone: timezoneOffset(from) }
	visitorPage.value = 1
	void refreshAll()
}

function applyVisitorFilters(): void {
	visitorPage.value = 1
	void loadVisitors()
}

function resetVisitorFilters(): void {
	Object.assign(visitorFilters, { path: '', country: '', city: '', device: '', trafficType: 'human' })
	visitorPage.value = 1
	void loadVisitors()
}

function goToVisitorPage(page: number): void {
	visitorPage.value = Math.min(Math.max(page, 1), visitorTotalPages.value)
	void loadVisitors()
}

function stopRealtime(): void {
	if (realtimeTimer !== null) {
		clearInterval(realtimeTimer)
		realtimeTimer = null
	}
}

function startRealtime(): void {
	stopRealtime()
	if (document.visibilityState !== 'visible')
		return
	realtimeTimer = setInterval(() => void loadRealtime(), 30_000)
}

function handleVisibilityChange(): void {
	if (document.visibilityState === 'visible') {
		void loadRealtime()
		startRealtime()
	}
	else {
		stopRealtime()
	}
}

function ipState(eventId: number): IpRevealState | undefined {
	return ipReveals[String(eventId)]
}

function hideIp(eventId: number): void {
	const timer = ipTimers.get(eventId)
	if (timer)
		clearTimeout(timer)
	ipTimers.delete(eventId)
	delete ipReveals[String(eventId)]
}

async function revealIp(eventId: number): Promise<void> {
	const existing = ipState(eventId)
	if (existing?.value) {
		hideIp(eventId)
		return
	}
	ipReveals[String(eventId)] = { value: '', loading: true, error: '' }
	try {
		const result = await useAdminApi<{ ip: string }>(`/api/admin/analytics/events/${eventId}/ip`)
		ipReveals[String(eventId)] = { value: result.ip, loading: false, error: '' }
		ipTimers.set(eventId, setTimeout(hideIp, 30_000, eventId))
	}
	catch (cause) {
		ipReveals[String(eventId)] = { value: '', loading: false, error: cause instanceof Error ? cause.message : '完整 IP 已不可用' }
	}
}

async function exportCsv(): Promise<void> {
	exporting.value = true
	pageError.value = ''
	try {
		const url = `/api/admin/analytics/export?${queryString({
			limit: 5_000,
			path: visitorFilters.path.trim() || undefined,
			country: visitorFilters.country.trim().toUpperCase() || undefined,
			city: visitorFilters.city.trim() || undefined,
			device: visitorFilters.device || undefined,
			trafficType: visitorFilters.trafficType,
		})}`
		const response = await fetch(url, { credentials: 'include' })
		if (!response.ok)
			throw new Error('CSV 导出失败')
		const href = URL.createObjectURL(await response.blob())
		const anchor = document.createElement('a')
		anchor.href = href
		anchor.download = `fly-living-analytics-${range.value.from.slice(0, 10)}.csv`
		anchor.click()
		URL.revokeObjectURL(href)
	}
	catch (cause) {
		pageError.value = cause instanceof Error ? cause.message : 'CSV 导出失败'
	}
	finally {
		exporting.value = false
	}
}

onMounted(async () => {
	document.addEventListener('visibilitychange', handleVisibilityChange)
	await refreshAll()
	startRealtime()
})

onBeforeUnmount(() => {
	stopRealtime()
	document.removeEventListener('visibilitychange', handleVisibilityChange)
	for (const timer of ipTimers.values())
		clearTimeout(timer)
})
</script>

<template>
<section class="admin-analytics-page">
	<header class="admin-page-heading admin-analytics-heading">
		<div>
			<span class="admin-badge">FIRST-PARTY · D1 · PRIVACY</span>
			<h1>访问分析</h1>
			<p>查看真实访客、内容热度、地域设备与爬虫流量。地域来自 Cloudflare 城市级近似定位。</p>
		</div>
		<div class="admin-heading-actions">
			<AdminStatusPill :tone="collectorStatus.tone">
				{{ collectorStatus.label }}
			</AdminStatusPill>
			<button v-if="statusPanel.error" class="admin-button" type="button" @click="loadStatus">
				重试状态
			</button>
			<button class="admin-button" type="button" :disabled="exporting" @click="exportCsv">
				<Icon name="tabler:file-export" />{{ exporting ? '导出中' : '导出 CSV' }}
			</button>
			<button class="admin-button admin-button-primary" type="button" @click="refreshAll">
				<Icon name="tabler:refresh" />刷新
			</button>
		</div>
	</header>

	<p v-if="pageError" class="admin-error">
		{{ pageError }}
	</p>

	<section class="admin-analytics-toolbar" aria-label="统计时间范围">
		<div class="admin-analytics-presets" role="group" aria-label="快捷时间范围">
			<button type="button" :aria-pressed="rangePreset === 'today'" @click="setPreset('today')">
				今天
			</button>
			<button type="button" :aria-pressed="rangePreset === '7d'" @click="setPreset('7d')">
				7 天
			</button>
			<button type="button" :aria-pressed="rangePreset === '30d'" @click="setPreset('30d')">
				30 天
			</button>
		</div>
		<div class="admin-analytics-custom-range">
			<label><span>开始</span><input v-model="customFrom" type="date"></label>
			<label><span>结束</span><input v-model="customTo" type="date"></label>
			<button class="admin-button" type="button" @click="applyCustomRange">
				应用
			</button>
		</div>
		<span class="admin-analytics-range-label">{{ rangeLabel }} · {{ range.timezone }}</span>
	</section>

	<div v-if="summaryPanel.loading && !summaryPanel.data" class="admin-analytics-kpis">
		<div v-for="index in 5" :key="index" class="admin-skeleton" />
	</div>
	<div v-else class="admin-analytics-kpis">
		<AdminStatusCard v-for="item in kpis" :key="item.label" :label="item.label" :value="item.value" :note="item.note" :icon="item.icon" />
	</div>
	<p v-if="summaryPanel.error" class="admin-analytics-inline-error">
		{{ summaryPanel.error }} <button type="button" @click="loadSummary">
			重试
		</button>
	</p>

	<div class="admin-analytics-pulse-grid">
		<section class="admin-panel admin-analytics-pulse-panel">
			<header class="admin-panel-header">
				<div><span class="admin-analytics-section-label">访问脉冲</span><h2>PV / UV 趋势</h2><p>爬虫与可疑自动流量默认不计入真人指标。</p></div>
			</header>
			<div v-if="timeseriesPanel.loading && !timeseriesPanel.data" class="admin-skeleton admin-analytics-chart-skeleton" />
			<div v-else-if="timeseriesPanel.error" class="admin-analytics-panel-message">
				<p>{{ timeseriesPanel.error }}</p><button class="admin-button" type="button" @click="loadTimeseries">
					重新加载
				</button>
			</div>
			<AdminEmptyState v-else-if="!timeseriesPanel.data?.length" icon="tabler:chart-line" title="这个时间段还没有访问" description="公开页面产生访问后，趋势会自动出现。" />
			<AdminAnalyticsLineChart v-else :points="timeseriesPanel.data" :title="`${rangeLabel} 访问趋势`" />
		</section>

		<aside class="admin-panel admin-analytics-live-panel">
			<header class="admin-panel-header">
				<div><span class="admin-analytics-section-label">最近 30 分钟</span><h2>实时访客</h2></div><span class="admin-analytics-live-dot" aria-hidden="true" />
			</header>
			<div v-if="realtimePanel.loading && !realtimePanel.data" class="admin-skeleton admin-analytics-live-skeleton" />
			<div v-else-if="realtimePanel.error" class="admin-analytics-panel-message">
				<p>{{ realtimePanel.error }}</p><button class="admin-button" type="button" @click="loadRealtime">
					重试
				</button>
			</div>
			<div v-else class="admin-analytics-live-value">
				<strong>{{ formatNumber(realtimePanel.data?.activeVisitors) }}</strong><span>活跃访客 · {{ formatNumber(realtimePanel.data?.pageviews) }} 次浏览</span>
			</div>
			<div class="admin-analytics-mini-ranks">
				<div>
					<h3>正在阅读</h3><ol>
						<li v-for="item in realtimePanel.data?.pages.slice(0, 5)" :key="item.label">
							<span>{{ item.label }}</span><strong>{{ item.count }}</strong>
						</li>
					</ol>
				</div>
				<div>
					<h3>所在城市</h3><ol>
						<li v-for="item in realtimePanel.data?.cities.slice(0, 5)" :key="item.label">
							<span>{{ localizeAnalyticsCity(null, item.label) }}</span><strong>{{ item.count }}</strong>
						</li>
					</ol>
				</div>
			</div>
		</aside>
	</div>

	<div class="admin-analytics-insight-grid">
		<section class="admin-panel">
			<header class="admin-panel-header">
				<div><h2>热门页面</h2><p>按真人页面浏览排序。</p></div>
			</header>
			<div v-if="pagesPanel.loading && !pagesPanel.data" class="admin-skeleton admin-list-skeleton" />
			<div v-else-if="pagesPanel.error" class="admin-analytics-panel-message">
				<p>{{ pagesPanel.error }}</p><button class="admin-button" type="button" @click="loadPages">
					重试
				</button>
			</div>
			<AdminEmptyState v-else-if="!pagesPanel.data?.length" icon="tabler:file-search" title="暂无热门页面" description="当前时间段没有真人页面浏览。" />
			<div v-else class="admin-analytics-table-wrap">
				<table>
					<thead><tr><th>页面</th><th>PV</th><th>UV</th></tr></thead><tbody>
						<tr v-for="item in pagesPanel.data" :key="item.path">
							<td><strong>{{ item.title || item.path }}</strong><small>{{ item.path }}</small></td><td>{{ formatNumber(item.pageviews) }}</td><td>{{ formatNumber(item.visitors) }}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>

		<section class="admin-panel">
			<header class="admin-panel-header">
				<div><h2>地域分布</h2><p>城市信息为近似定位，可能为空或存在偏差。</p></div>
			</header>
			<div v-if="geoPanel.loading && !geoPanel.data" class="admin-skeleton admin-list-skeleton" />
			<div v-else-if="geoPanel.error" class="admin-analytics-panel-message">
				<p>{{ geoPanel.error }}</p><button class="admin-button" type="button" @click="loadGeo">
					重试
				</button>
			</div>
			<AdminEmptyState v-else-if="!geoPanel.data?.length" icon="tabler:map-pin" title="暂无地域数据" description="Cloudflare 地域字段可用后会显示在这里。" />
			<div v-else class="admin-analytics-table-wrap">
				<table>
					<thead><tr><th>地区</th><th>PV</th><th>UV</th></tr></thead><tbody>
						<tr v-for="item in geoPanel.data" :key="`${item.country}-${item.region}-${item.city}`">
							<td>{{ formatAnalyticsLocation(item.country, item.region, item.city) }}</td><td>{{ formatNumber(item.pageviews) }}</td><td>{{ formatNumber(item.visitors) }}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>

		<section class="admin-panel admin-analytics-device-panel">
			<header class="admin-panel-header">
				<div><h2>设备与环境</h2><p>轻量解析 User-Agent，不进行设备指纹识别。</p></div>
			</header>
			<div v-if="devicesPanel.loading && !devicesPanel.data" class="admin-skeleton admin-analytics-device-skeleton" />
			<div v-else-if="devicesPanel.error" class="admin-analytics-panel-message">
				<p>{{ devicesPanel.error }}</p><button class="admin-button" type="button" @click="loadDevices">
					重试
				</button>
			</div>
			<AdminEmptyState v-else-if="!devicesPanel.data?.devices.length" icon="tabler:devices" title="暂无设备数据" description="真人访问产生后会统计设备、浏览器和操作系统。" />
			<div v-else class="admin-analytics-device-content">
				<AdminAnalyticsDonut :items="devicesPanel.data.devices" /><div class="admin-analytics-environment-lists">
					<div>
						<h3>浏览器</h3><ol>
							<li v-for="item in devicesPanel.data.browsers.slice(0, 6)" :key="item.label">
								<span>{{ item.label }}</span><strong>{{ item.pageviews }}</strong>
							</li>
						</ol>
					</div><div>
						<h3>操作系统</h3><ol>
							<li v-for="item in devicesPanel.data.operatingSystems.slice(0, 6)" :key="item.label">
								<span>{{ item.label }}</span><strong>{{ item.pageviews }}</strong>
							</li>
						</ol>
					</div>
				</div>
			</div>
		</section>
	</div>

	<section class="admin-panel admin-analytics-visitors-panel">
		<header class="admin-panel-header">
			<div><h2>最近访客</h2><p>IP 默认遮罩；完整 IP 仅能逐条查看，并写入审计日志。</p></div>
		</header>
		<form class="admin-analytics-filters" @submit.prevent="applyVisitorFilters">
			<label><span>页面路径</span><input v-model="visitorFilters.path" placeholder="/2026/welcome"></label>
			<label><span>国家代码</span><input v-model="visitorFilters.country" maxlength="2" placeholder="US"></label>
			<label><span>城市</span><input v-model="visitorFilters.city" placeholder="San Francisco"></label>
			<label><span>设备</span><select v-model="visitorFilters.device"><option value="">全部</option><option value="desktop">桌面</option><option value="mobile">手机</option><option value="tablet">平板</option></select></label>
			<label><span>流量类型</span><select v-model="visitorFilters.trafficType"><option value="human">真人</option><option value="bot">爬虫</option><option value="suspected">可疑自动流量</option></select></label>
			<div class="admin-analytics-filter-actions">
				<button class="admin-button admin-button-primary" type="submit">
					筛选
				</button><button class="admin-button" type="button" @click="resetVisitorFilters">
					重置
				</button>
			</div>
		</form>
		<div v-if="visitorsPanel.loading && !visitorsPanel.data" class="admin-skeleton admin-list-skeleton" />
		<div v-else-if="visitorsPanel.error" class="admin-analytics-panel-message">
			<p>{{ visitorsPanel.error }}</p><button class="admin-button" type="button" @click="loadVisitors">
				重试
			</button>
		</div>
		<AdminEmptyState v-else-if="!visitorsPanel.data?.items.length" icon="tabler:user-search" title="没有匹配的访客" description="调整时间范围或筛选条件后再查看。" />
		<div v-else class="admin-analytics-table-wrap">
			<table class="admin-analytics-visitors-table">
				<thead><tr><th>最近访问</th><th>访客 / IP</th><th>地区</th><th>页面</th><th>设备</th><th>累计</th><th>隐私操作</th></tr></thead><tbody>
					<tr v-for="item in visitorsPanel.data.items" :key="item.eventId">
						<td>{{ formatDateTime(item.lastSeenAt) }}</td><td>
							<div class="admin-analytics-identity">
								<strong>{{ item.visitorId }}</strong><code>{{ item.maskedIp || 'IP 不可用' }}</code><AdminStatusPill :tone="trafficTone(item.trafficType)">
									{{ trafficLabel(item.trafficType) }}
								</AdminStatusPill>
							</div>
						</td><td>{{ formatAnalyticsLocation(item.country, item.region, item.city) }}</td><td><code>{{ item.lastPath }}</code></td><td>{{ [item.device, item.browser, item.os].filter(Boolean).join(' · ') || '未知' }}</td><td>{{ item.totalPageviews }} PV<span v-if="item.trafficType === 'human'"> · {{ item.totalSessions }} 会话</span></td><td>
							<div class="admin-analytics-ip-action">
								<button class="admin-button" type="button" :disabled="ipState(item.eventId)?.loading" @click="revealIp(item.eventId)">
									{{ ipState(item.eventId)?.value ? '隐藏完整 IP' : ipState(item.eventId)?.loading ? '读取中' : '查看完整 IP' }}
								</button><code v-if="ipState(item.eventId)?.value" class="admin-analytics-full-ip">{{ ipState(item.eventId)?.value }}</code><small v-if="ipState(item.eventId)?.error">{{ ipState(item.eventId)?.error }}</small>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<footer v-if="visitorsPanel.data?.total" class="admin-analytics-pagination">
			<span>共 {{ visitorsPanel.data.total }} 条</span><div>
				<button class="admin-button" type="button" :disabled="visitorPage <= 1" @click="goToVisitorPage(visitorPage - 1)">
					上一页
				</button><span>{{ visitorPage }} / {{ visitorTotalPages }}</span><button class="admin-button" type="button" :disabled="visitorPage >= visitorTotalPages" @click="goToVisitorPage(visitorPage + 1)">
					下一页
				</button>
			</div>
		</footer>
	</section>

	<section class="admin-panel admin-analytics-bots-panel">
		<header class="admin-panel-header">
			<div><h2>爬虫与自动流量</h2><p>单独统计，不混入真人 PV、UV、会话和新访客。</p></div>
		</header>
		<div v-if="botsPanel.loading && !botsPanel.data" class="admin-skeleton admin-list-skeleton" />
		<div v-else-if="botsPanel.error" class="admin-analytics-panel-message">
			<p>{{ botsPanel.error }}</p><button class="admin-button" type="button" @click="loadBots">
				重试
			</button>
		</div>
		<AdminEmptyState v-else-if="!botsPanel.data?.length" icon="tabler:robot" title="暂无自动流量" description="当前时间段没有识别到爬虫或可疑自动请求。" />
		<div v-else class="admin-analytics-table-wrap">
			<table>
				<thead><tr><th>名称</th><th>分类</th><th>识别来源</th><th>类型</th><th>PV</th><th>最近出现</th></tr></thead><tbody>
					<tr v-for="item in botsPanel.data" :key="`${item.name}-${item.trafficType}-${item.classificationSource}`">
						<td><strong>{{ item.name }}</strong></td><td>{{ item.category || '未分类' }}</td><td>{{ item.classificationSource || '未知' }}</td><td>{{ trafficLabel(item.trafficType) }}</td><td>{{ item.pageviews }}</td><td>{{ formatDateTime(item.lastSeenAt) }}</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<footer class="admin-analytics-privacy-note">
		<Icon name="tabler:shield-lock" aria-hidden="true" /><div><strong>隐私与保留</strong><p>原始 IP 保留 30 天，之后自动置空；事件明细保留 180 天。长期趋势仅保留匿名聚合，不采集精确街道地址，也不使用设备指纹。</p></div>
	</footer>
</section>
</template>
