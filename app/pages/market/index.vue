<script setup lang="ts">
import type { AdminSessionDto } from '#shared/admin/auth'
import type { FinanceFilter, FinanceFlashDto, FinanceFlashListDto, FinanceFlashSourceDto } from '#shared/admin/finance'
import type { MarketDataQuality, MarketEnvelope, MarketOverview, SectorFlowItem, SectorKind, SectorWindowDays, WatchlistItem, WatchlistRadarItem, WatchlistRadarResponse } from '#shared/market'
import MarketSignalDesk from '~/components/market/MarketSignalDesk.vue'

type MarketWorkspace = 'radar' | 'funds' | 'watchlist' | 'signals' | 'strategy'
type WatchlistSortMode = 'custom' | 'change' | 'attention' | 'turnover'

const workspaceTabs: Array<{ id: MarketWorkspace, label: string, icon: string, note: string }> = [
	{ id: 'radar', label: '市场雷达', icon: 'tabler:radar', note: '事件与数据门禁' },
	{ id: 'funds', label: '资金', icon: 'tabler:arrows-exchange', note: '板块与周期累计' },
	{ id: 'watchlist', label: '自选', icon: 'tabler:star', note: '自选雷达' },
	{ id: 'signals', label: '信号', icon: 'tabler:activity-heartbeat', note: '5分钟观察信号' },
	{ id: 'strategy', label: '策略', icon: 'tabler:filter-cog', note: '收盘筛选' },
]

const financeFilters: Array<{ id: FinanceFilter, label: string }> = [
	{ id: 'all', label: '全部' },
	{ id: 'market', label: '市场' },
	{ id: 'company', label: '公司' },
	{ id: 'macro', label: '宏观' },
	{ id: 'overseas', label: '海外' },
	{ id: 'tech', label: '科技' },
]

const sectorKindOptions: Array<{ id: SectorKind, label: string }> = [
	{ id: 'industry', label: '行业' },
	{ id: 'concept', label: '概念' },
]

const watchlistSortOptions: Array<{ id: WatchlistSortMode, label: string }> = [
	{ id: 'custom', label: '自定义顺序' },
	{ id: 'change', label: '涨跌幅排序' },
	{ id: 'attention', label: '距关注价排序' },
	{ id: 'turnover', label: '成交额排序' },
]

const sectorWindowLabels: Record<SectorWindowDays, string> = {
	1: '1D',
	3: '3D',
	5: '5D',
	10: '10D',
	20: '20D',
}

const shanghaiTime = new Intl.DateTimeFormat('zh-CN', {
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
	timeZone: 'Asia/Shanghai',
})

const financeTime = new Intl.DateTimeFormat('zh-CN', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: 'Asia/Shanghai',
})

const activeWorkspace = ref<MarketWorkspace>('radar')
const financeFilter = ref<FinanceFilter>('all')
const importantOnly = ref(false)
const financeData = ref<FinanceFlashListDto | null>(null)
const financeLoading = ref(true)
const financeError = ref('')
const marketOverview = ref<MarketEnvelope<MarketOverview> | null>(null)
const marketOverviewLoading = ref(true)
const marketOverviewError = ref('')
const sectorKind = ref<SectorKind>('industry')
const sectorFlowData = ref<MarketEnvelope<SectorFlowItem[]> | null>(null)
const sectorFlowLoading = ref(false)
const sectorFlowError = ref('')
const watchlistSession = ref<AdminSessionDto | null>(null)
const watchlistSessionLoading = ref(false)
const watchlistConfig = ref<WatchlistItem[]>([])
const watchlistData = ref<WatchlistRadarResponse | null>(null)
const watchlistLoading = ref(false)
const watchlistError = ref('')
const watchlistMutationError = ref('')
const watchlistSymbolInput = ref('')
const watchlistAttentionInput = ref('')
const watchlistNoteInput = ref('')
const watchlistTagsInput = ref('')
const watchlistEditingSymbol = ref('')
const watchlistEditAttention = ref('')
const watchlistEditNote = ref('')
const watchlistEditTags = ref('')
const watchlistMutationLoading = ref(false)
const watchlistSortMode = ref<WatchlistSortMode>('custom')
const currentClock = ref<Date | null>(null)
let financeRevision = 0
let marketOverviewRevision = 0
let sectorFlowRevision = 0
let refreshTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null
let watchlistTimer: ReturnType<typeof setInterval> | null = null
let watchlistRequestController: AbortController | null = null
const watchlistRequestInFlight = ref(false)

const financeItems = computed(() => financeData.value?.items || [])
const mainlineTopics = computed(() => {
	const counts = new Map<string, number>()
	for (const item of financeItems.value) {
		const topic = item.topic?.trim()
		if (!topic)
			continue
		counts.set(topic, (counts.get(topic) || 0) + 1)
	}
	return [...counts.entries()]
		.sort(([leftTopic, leftCount], [rightTopic, rightCount]) => rightCount - leftCount || leftTopic.localeCompare(rightTopic, 'zh-CN'))
		.slice(0, 3)
		.map(([topic, count]) => ({ topic, count }))
})
const mainlineSummary = computed(() => {
	if (mainlineTopics.value.length)
		return mainlineTopics.value.map(item => `${item.topic} ×${item.count}`).join(' · ')
	return financeLoading.value ? '正在从公开财经事件提取主线。' : '当前公开财经事件暂无可归纳主题。'
})
const connectionState = computed(() => {
	if (financeError.value)
		return { label: '财经链路异常', tone: 'danger' as const, detail: '请求失败，保留已加载内容' }
	if (financeLoading.value && !financeData.value)
		return { label: '正在连接', tone: 'pending' as const, detail: '读取财经聚合 API' }
	if (financeData.value?.quality === 'unavailable')
		return { label: '暂无可信财经数据', tone: 'warning' as const, detail: '等待公开来源恢复后再展示' }
	if (financeData.value?.quality === 'stale')
		return { label: '最后成功快照', tone: 'warning' as const, detail: '当前公开来源同步失败' }
	if (financeData.value?.quality === 'degraded')
		return { label: '部分来源降级', tone: 'warning' as const, detail: '仍展示可用来源与最后成功内容' }
	if (financeData.value?.prototype)
		return { label: '回退快照', tone: 'warning' as const, detail: '当前不是实时生产源' }
	return { label: '财经链路在线', tone: 'online' as const, detail: '公开快讯持续刷新' }
})
const lastUpdatedLabel = computed(() => formatDateTime(financeData.value?.updatedAt || null))
const activeTab = computed(() => workspaceTabs.find(tab => tab.id === activeWorkspace.value) || workspaceTabs[0]!)
const marketIndices = computed(() => marketOverview.value?.data?.indices || [])
const marketBreadth = computed(() => marketOverview.value?.data?.breadth || null)
const sectorFlowItems = computed(() => sectorFlowData.value?.data || [])
const marketQualityState = computed(() => qualityState(marketOverview.value?.quality))
const sectorQualityState = computed(() => sectorFlowData.value?.quality === 'unavailable'
	? { label: '暂无可信资金数据', tone: 'muted' as const }
	: qualityState(sectorFlowData.value?.quality))

const watchlistAuthenticated = computed(() => watchlistSession.value?.authenticated === true)
const watchlistQuoteBySymbol = computed(() => new Map((watchlistData.value?.items || []).map(item => [item.watchlist.symbol, item])))
const watchlistRows = computed<WatchlistRadarItem[]>(() => {
	const rows = watchlistConfig.value.map<WatchlistRadarItem>((config) => {
		const current = watchlistQuoteBySymbol.value.get(config.symbol)
		return current || { watchlist: config, quote: null, quality: 'unavailable', staleAgeMs: null, source: null }
	})
	if (watchlistSortMode.value === 'custom')
		return rows
	return [...rows].sort((left, right) => {
		if (watchlistSortMode.value === 'change') {
			const leftValue = left.quote?.changePct ?? Number.NEGATIVE_INFINITY
			const rightValue = right.quote?.changePct ?? Number.NEGATIVE_INFINITY
			return rightValue - leftValue
		}
		if (watchlistSortMode.value === 'turnover') {
			const leftValue = left.quote?.turnover ?? Number.NEGATIVE_INFINITY
			const rightValue = right.quote?.turnover ?? Number.NEGATIVE_INFINITY
			return rightValue - leftValue
		}
		const leftValue = watchlistAttentionDistanceRatio(left)
		const rightValue = watchlistAttentionDistanceRatio(right)
		if (leftValue === null)
			return rightValue === null ? left.watchlist.sortOrder - right.watchlist.sortOrder : 1
		if (rightValue === null)
			return -1
		return leftValue - rightValue || left.watchlist.sortOrder - right.watchlist.sortOrder
	})
})
const watchlistLiveCount = computed(() => watchlistData.value?.items.filter(item => item.quality === 'live').length || 0)
const watchlistStaleCount = computed(() => watchlistData.value?.items.filter(item => item.quality === 'stale').length || 0)
const watchlistUnavailableCount = computed(() => watchlistData.value?.items.filter(item => item.quality === 'unavailable').length || 0)
const watchlistRelatedEvents = computed(() => {
	const terms = watchlistConfig.value.flatMap(item => [item.name, item.code, ...item.tags]).map(term => term.trim()).filter(Boolean)
	if (!terms.length)
		return []
	return financeItems.value.filter((event) => {
		const haystack = `${event.title} ${event.summary || ''} ${event.topic || ''}`.toLowerCase()
		return terms.some(term => haystack.includes(term.toLowerCase()))
	}).slice(0, 4)
})

useSeoMeta({
	title: '市场雷达',
	description: 'fly living 的市场雷达：财经事件、多源聚合、资金与自选能力的统一入口。',
	ogTitle: '市场雷达 · fly living',
	ogDescription: '服务器无关的 A 股市场雷达与财经事件工作台。',
})

function formatClock(value: Date | null) {
	if (!value)
		return '--.-- --:--:--'
	return shanghaiTime.format(value).replaceAll('/', '.')
}

function formatDateTime(value: string | null) {
	if (!value)
		return '等待首次同步'
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '时间未知'
	return shanghaiTime.format(date).replaceAll('/', '.')
}

function formatFinanceTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '--:--'
	return financeTime.format(date)
}

function qualityState(quality?: MarketDataQuality) {
	switch (quality) {
		case 'live':
			return { label: '最新行情', tone: 'live' as const }
		case 'degraded':
			return { label: '部分数据降级', tone: 'warning' as const }
		case 'stale':
			return { label: '最后成功快照', tone: 'warning' as const }
		default:
			return { label: '暂无可信行情', tone: 'muted' as const }
	}
}

function moveClass(value: number | null) {
	if (value === null || value === 0)
		return 'flat'
	return value > 0 ? 'up' : 'down'
}

function formatIndexValue(value: number) {
	return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPercent(value: number | null) {
	if (value === null)
		return '--'
	return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatFlow(value: number | null) {
	if (value === null)
		return '--'
	const absolute = Math.abs(value)
	const sign = value > 0 ? '+' : value < 0 ? '-' : ''
	if (absolute >= 100_000_000)
		return `${sign}${(absolute / 100_000_000).toFixed(2)}亿`
	if (absolute >= 10_000)
		return `${sign}${(absolute / 10_000).toFixed(2)}万`
	return `${sign}${absolute.toFixed(0)}`
}

function sourceEntries(item: FinanceFlashDto): FinanceFlashSourceDto[] {
	if (item.sources?.length)
		return item.sources
	return [{
		sourceId: item.sourceId,
		sourceName: item.sourceName,
		sourceUrl: item.sourceUrl,
		publishedAt: item.publishedAt,
	}]
}

function sourceSummary(item: FinanceFlashDto) {
	return sourceEntries(item).map(source => source.sourceName).join(' · ')
}

function sourceLinks(item: FinanceFlashDto) {
	return sourceEntries(item).filter(source => Boolean(source.sourceUrl))
}

async function loadFinance(options: { background?: boolean } = {}) {
	const revision = ++financeRevision
	if (!options.background)
		financeLoading.value = true
	financeError.value = ''
	try {
		const result = await $fetch<{ data: FinanceFlashListDto }>('/api/finance/flash', {
			query: {
				category: financeFilter.value,
				important: importantOnly.value ? 'true' : 'false',
				limit: 14,
			},
		})
		if (revision === financeRevision)
			financeData.value = result.data
	}
	catch (cause) {
		if (revision === financeRevision)
			financeError.value = cause instanceof Error ? cause.message : '财经聚合数据加载失败'
	}
	finally {
		if (revision === financeRevision)
			financeLoading.value = false
	}
}

async function loadMarketOverview(options: { background?: boolean } = {}) {
	const revision = ++marketOverviewRevision
	if (!options.background)
		marketOverviewLoading.value = true
	marketOverviewError.value = ''
	try {
		const result = await $fetch<{ data: MarketEnvelope<MarketOverview> }>('/api/market/overview')
		if (revision === marketOverviewRevision)
			marketOverview.value = result.data
	}
	catch (cause) {
		if (revision === marketOverviewRevision)
			marketOverviewError.value = cause instanceof Error ? cause.message : '市场行情加载失败'
	}
	finally {
		if (revision === marketOverviewRevision)
			marketOverviewLoading.value = false
	}
}

async function loadSectorFlows(options: { background?: boolean } = {}) {
	const revision = ++sectorFlowRevision
	if (!options.background)
		sectorFlowLoading.value = true
	sectorFlowError.value = ''
	try {
		const result = await $fetch<{ data: MarketEnvelope<SectorFlowItem[]> }>('/api/market/sector-flows', {
			query: { kind: sectorKind.value, limit: 20 },
		})
		if (revision === sectorFlowRevision)
			sectorFlowData.value = result.data
	}
	catch (cause) {
		if (revision === sectorFlowRevision)
			sectorFlowError.value = cause instanceof Error ? cause.message : '板块资金加载失败'
	}
	finally {
		if (revision === sectorFlowRevision)
			sectorFlowLoading.value = false
	}
}

function shanghaiParts(value: Date) {
	const formatter = new Intl.DateTimeFormat('en-GB', {
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone: 'Asia/Shanghai',
	})
	const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]))
	return { weekday: parts.weekday || '', hour: Number(parts.hour), minute: Number(parts.minute) }
}

function isChinaMarketTradingWindow(value: Date) {
	const { weekday, hour, minute } = shanghaiParts(value)
	if (weekday === 'Sat' || weekday === 'Sun')
		return false
	const minutes = hour * 60 + minute
	return (minutes >= 9 * 60 + 20 && minutes <= 11 * 60 + 35)
		|| (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 15)
}

function formatWatchlistPrice(value: number | null | undefined) {
	return value === null || value === undefined ? '--' : value.toFixed(2)
}

function formatTurnover(value: number | null | undefined) {
	if (value === null || value === undefined)
		return '--'
	if (Math.abs(value) >= 100_000_000)
		return `${(value / 100_000_000).toFixed(2)}亿`
	if (Math.abs(value) >= 10_000)
		return `${(value / 10_000).toFixed(2)}万`
	return value.toFixed(0)
}

function watchlistAttentionDistanceRatio(item: WatchlistRadarItem) {
	const attention = item.watchlist.attentionPrice
	const price = item.quote?.price
	if (!attention || price === undefined || price === null)
		return null
	return Math.abs((price - attention) / attention)
}

function watchlistDistance(item: WatchlistRadarItem) {
	const attention = item.watchlist.attentionPrice
	const price = item.quote?.price
	if (!attention || price === undefined || price === null)
		return '--'
	const delta = price - attention
	const percent = delta / attention * 100
	return `${delta > 0 ? '+' : ''}${delta.toFixed(2)} (${percent > 0 ? '+' : ''}${percent.toFixed(2)}%)`
}

function watchlistRangePosition(item: WatchlistRadarItem) {
	const quote = item.quote
	if (!quote || quote.low === null || quote.high === null || quote.high <= quote.low)
		return 50
	return Math.max(0, Math.min(100, (quote.price - quote.low) / (quote.high - quote.low) * 100))
}

function watchlistStatusLabel(item: WatchlistRadarItem) {
	if (!item.watchlist.enabled)
		return 'PAUSED'
	if (item.quality === 'unavailable')
		return 'UNAVAILABLE'
	if (item.quality === 'stale') {
		const minutes = Math.max(1, Math.floor((item.staleAgeMs || 0) / 60_000))
		return `STALE · ${minutes}m`
	}
	if (!isChinaMarketTradingWindow(currentClock.value || new Date()))
		return item.quote?.marketAt ? `已收盘 · ${formatFinanceTime(item.quote.marketAt)}` : '最近行情'
	return 'LIVE'
}

function watchlistStatusTone(item: WatchlistRadarItem) {
	if (!item.watchlist.enabled)
		return 'paused'
	return item.quality
}

function watchlistOverallLabel() {
	if (!watchlistData.value)
		return '等待自选行情'
	if (!isChinaMarketTradingWindow(currentClock.value || new Date()) && watchlistData.value.items.length)
		return '最近行情'
	switch (watchlistData.value.quality) {
		case 'live': return 'LIVE'
		case 'degraded': return 'DEGRADED'
		case 'stale': return 'STALE'
		default: return 'UNAVAILABLE'
	}
}

function csrfToken() {
	if (!import.meta.client)
		return ''
	const prefix = 'fly_admin_csrf='
	return document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length) || ''
}

function normalizeWatchlistSymbolInput(value: string) {
	const normalized = value.trim().toUpperCase()
	if (/^(?:SSE|SZSE|BSE):\d{6}$/u.test(normalized))
		return normalized
	if (!/^\d{6}$/u.test(normalized))
		throw new Error('请输入 6 位 A 股代码')
	if (/^6\d{5}$/u.test(normalized))
		return `SSE:${normalized}`
	if (/^(?:00[0-3]|30[01])\d{3}$/u.test(normalized))
		return `SZSE:${normalized}`
	if (/^[489]\d{5}$/u.test(normalized))
		return `BSE:${normalized}`
	throw new Error('暂不支持该股票代码')
}

function parseOptionalPositive(value: string) {
	const normalized = value.trim()
	if (!normalized)
		return null
	const parsed = Number(normalized)
	if (!Number.isFinite(parsed) || parsed <= 0)
		throw new Error('关注价必须大于 0')
	return parsed
}

function parseTags(value: string) {
	return [...new Set(value.split(/[,，]/u).map(tag => tag.trim()).filter(Boolean))]
}

async function loadWatchlistSession() {
	if (watchlistSessionLoading.value)
		return
	watchlistSessionLoading.value = true
	try {
		const result = await $fetch<{ data: AdminSessionDto }>('/api/auth/session')
		watchlistSession.value = result.data
	}
	catch {
		watchlistSession.value = { authenticated: false }
	}
	finally {
		watchlistSessionLoading.value = false
	}
}

async function loadWatchlistConfig() {
	if (!watchlistSession.value?.authenticated)
		return
	const result = await $fetch<{ data: WatchlistItem[] }>('/api/admin/market/watchlist')
	watchlistConfig.value = result.data
}

async function loadWatchlistQuotes(options: { background?: boolean } = {}) {
	if (activeWorkspace.value !== 'watchlist' || !watchlistSession.value?.authenticated || watchlistRequestInFlight.value)
		return
	watchlistRequestInFlight.value = true
	if (!options.background)
		watchlistLoading.value = true
	watchlistError.value = ''
	const controller = new AbortController()
	watchlistRequestController = controller
	try {
		const result = await $fetch<{ data: WatchlistRadarResponse }>('/api/admin/market/watchlist/quotes', { signal: controller.signal })
		if (!controller.signal.aborted)
			watchlistData.value = result.data
	}
	catch (cause) {
		if (!controller.signal.aborted)
			watchlistError.value = cause instanceof Error ? cause.message : '自选行情加载失败'
	}
	finally {
		if (watchlistRequestController === controller)
			watchlistRequestController = null
		watchlistRequestInFlight.value = false
		if (!options.background)
			watchlistLoading.value = false
	}
}

function stopWatchlistPolling(options: { abort?: boolean } = {}) {
	if (watchlistTimer) {
		clearInterval(watchlistTimer)
		watchlistTimer = null
	}
	if (options.abort) {
		watchlistRequestController?.abort()
		watchlistRequestController = null
	}
}

function startWatchlistPolling() {
	stopWatchlistPolling()
	if (!import.meta.client || activeWorkspace.value !== 'watchlist' || !watchlistSession.value?.authenticated)
		return
	if (document.visibilityState !== 'visible' || !isChinaMarketTradingWindow(new Date()))
		return
	watchlistTimer = setInterval(() => {
		if (activeWorkspace.value === 'watchlist' && document.visibilityState === 'visible' && isChinaMarketTradingWindow(new Date()))
			void loadWatchlistQuotes({ background: true })
		else
			stopWatchlistPolling()
	}, 45_000)
}

async function activateWatchlist() {
	stopWatchlistPolling({ abort: true })
	await loadWatchlistSession()
	if (!watchlistSession.value?.authenticated)
		return
	watchlistLoading.value = true
	watchlistError.value = ''
	try {
		await Promise.all([loadWatchlistConfig(), loadWatchlistQuotes()])
	}
	catch (cause) {
		watchlistError.value = cause instanceof Error ? cause.message : '自选配置加载失败'
	}
	finally {
		watchlistLoading.value = false
		startWatchlistPolling()
	}
}

function handleMarketVisibilityChange() {
	if (document.visibilityState !== 'visible') {
		stopWatchlistPolling({ abort: true })
		return
	}
	if (activeWorkspace.value === 'watchlist' && watchlistSession.value?.authenticated) {
		void loadWatchlistQuotes().finally(() => startWatchlistPolling())
	}
}

async function mutateWatchlist(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>) {
	const token = csrfToken()
	if (!token)
		throw new Error('登录状态缺少 CSRF 凭据，请重新登录')
	return $fetch(path, {
		method,
		headers: { 'x-csrf-token': token },
		...(body ? { body } : {}),
	})
}

async function refreshWatchlistAfterMutation() {
	await loadWatchlistConfig()
	await loadWatchlistQuotes()
	startWatchlistPolling()
}

async function addWatchlistItem() {
	if (watchlistMutationLoading.value)
		return
	watchlistMutationLoading.value = true
	watchlistMutationError.value = ''
	try {
		const symbol = normalizeWatchlistSymbolInput(watchlistSymbolInput.value)
		await mutateWatchlist('/api/admin/market/watchlist', 'POST', {
			symbol,
			attentionPrice: parseOptionalPositive(watchlistAttentionInput.value),
			note: watchlistNoteInput.value.trim() || null,
			tags: parseTags(watchlistTagsInput.value),
		})
		watchlistSymbolInput.value = ''
		watchlistAttentionInput.value = ''
		watchlistNoteInput.value = ''
		watchlistTagsInput.value = ''
		await refreshWatchlistAfterMutation()
	}
	catch (cause) {
		watchlistMutationError.value = cause instanceof Error ? cause.message : '添加自选失败'
	}
	finally {
		watchlistMutationLoading.value = false
	}
}

function beginWatchlistEdit(item: WatchlistItem) {
	watchlistEditingSymbol.value = item.symbol
	watchlistEditAttention.value = item.attentionPrice?.toString() || ''
	watchlistEditNote.value = item.note || ''
	watchlistEditTags.value = item.tags.join(', ')
	watchlistMutationError.value = ''
}

async function saveWatchlistEdit() {
	if (!watchlistEditingSymbol.value || watchlistMutationLoading.value)
		return
	watchlistMutationLoading.value = true
	watchlistMutationError.value = ''
	try {
		await mutateWatchlist(`/api/admin/market/watchlist/${encodeURIComponent(watchlistEditingSymbol.value)}`, 'PATCH', {
			attentionPrice: parseOptionalPositive(watchlistEditAttention.value),
			note: watchlistEditNote.value.trim() || null,
			tags: parseTags(watchlistEditTags.value),
		})
		watchlistEditingSymbol.value = ''
		await refreshWatchlistAfterMutation()
	}
	catch (cause) {
		watchlistMutationError.value = cause instanceof Error ? cause.message : '保存关注设置失败'
	}
	finally {
		watchlistMutationLoading.value = false
	}
}

async function toggleWatchlistItem(item: WatchlistItem) {
	watchlistMutationError.value = ''
	try {
		await mutateWatchlist(`/api/admin/market/watchlist/${encodeURIComponent(item.symbol)}`, 'PATCH', { enabled: !item.enabled })
		await refreshWatchlistAfterMutation()
	}
	catch (cause) {
		watchlistMutationError.value = cause instanceof Error ? cause.message : '更新自选状态失败'
	}
}

async function removeWatchlistItem(item: WatchlistItem) {
	watchlistMutationError.value = ''
	try {
		await mutateWatchlist(`/api/admin/market/watchlist/${encodeURIComponent(item.symbol)}`, 'DELETE')
		if (watchlistEditingSymbol.value === item.symbol)
			watchlistEditingSymbol.value = ''
		await refreshWatchlistAfterMutation()
	}
	catch (cause) {
		watchlistMutationError.value = cause instanceof Error ? cause.message : '删除自选失败'
	}
}

function refreshRadar() {
	void Promise.all([loadFinance(), loadMarketOverview()])
}

watch([financeFilter, importantOnly], () => {
	void loadFinance()
})

watch([activeWorkspace, sectorKind], ([workspace]) => {
	if (workspace === 'funds')
		void loadSectorFlows()
	if (workspace === 'watchlist') {
		void activateWatchlist()
	}
	else {
		stopWatchlistPolling({ abort: true })
		if (workspace === 'signals')
			void loadWatchlistSession()
	}
})

onMounted(() => {
	currentClock.value = new Date()
	document.addEventListener('visibilitychange', handleMarketVisibilityChange)
	void loadFinance()
	void loadMarketOverview()
	refreshTimer = setInterval(() => {
		void loadFinance({ background: true })
		void loadMarketOverview({ background: true })
		if (activeWorkspace.value === 'funds')
			void loadSectorFlows({ background: true })
	}, 60_000)
	clockTimer = setInterval(() => {
		currentClock.value = new Date()
	}, 1_000)
})

onBeforeUnmount(() => {
	document.removeEventListener('visibilitychange', handleMarketVisibilityChange)
	stopWatchlistPolling({ abort: true })
	if (refreshTimer)
		clearInterval(refreshTimer)
	if (clockTimer)
		clearInterval(clockTimer)
})
</script>

<template>
<section class="market-terminal">
	<div class="market-grid-noise" aria-hidden="true" />

	<header class="market-terminal-header">
		<div class="market-title-block">
			<p class="market-kicker">
				FLY · MARKET INTELLIGENCE
			</p>
			<div class="market-title-row">
				<h1>市场雷达</h1>
				<span class="market-build">P2B</span>
			</div>
			<p>把财经事件、资金、自选和信号放进一个决策入口；未通过生产验收的数据一律不展示。</p>
		</div>

		<div class="market-status-cluster">
			<div class="market-clock" aria-label="北京时间">
				<span>CN / UTC+8</span>
				<strong>{{ formatClock(currentClock) }}</strong>
			</div>
			<div class="market-connection" :data-tone="connectionState.tone">
				<span class="market-state-dot" aria-hidden="true" />
				<div>
					<strong>{{ connectionState.label }}</strong>
					<span>{{ connectionState.detail }} · {{ lastUpdatedLabel }}</span>
				</div>
			</div>
		</div>
	</header>

	<div class="market-discipline-bar" role="note">
		<div><Icon name="tabler:shield-check" aria-hidden="true" /><span>数据纪律</span><strong>不展示模拟行情</strong></div>
		<div><span class="market-up-mark">涨</span><span>红涨</span><span class="market-down-mark">跌</span><span>绿跌</span></div>
		<a href="https://stock.zzzai.cc.cd" target="_blank" rel="noopener noreferrer">
			个股深度分析 <Icon name="tabler:arrow-up-right" aria-hidden="true" />
		</a>
	</div>

	<nav class="market-workspaces" aria-label="市场工作区">
		<button
			v-for="tab in workspaceTabs"
			:key="tab.id"
			type="button"
			:class="{ active: activeWorkspace === tab.id }"
			:aria-pressed="activeWorkspace === tab.id"
			@click="activeWorkspace = tab.id"
		>
			<Icon :name="tab.icon" aria-hidden="true" />
			<span><strong>{{ tab.label }}</strong><small>{{ tab.note }}</small></span>
		</button>
	</nav>

	<div class="market-workspace-heading">
		<div>
			<span>{{ activeTab.note }}</span>
			<h2>{{ activeTab.label }}</h2>
		</div>
		<button v-if="activeWorkspace === 'radar'" class="market-refresh" type="button" :disabled="financeLoading || marketOverviewLoading" @click="refreshRadar()">
			<Icon name="tabler:refresh" aria-hidden="true" />
			{{ financeLoading || marketOverviewLoading ? '刷新中' : '刷新雷达' }}
		</button>
	</div>

	<div v-if="activeWorkspace === 'radar'" class="market-radar-view">
		<section class="market-capability-grid" aria-label="市场能力状态">
			<article class="market-capability" :class="{ 'market-capability-live': marketIndices.length === 3 }">
				<header><span>INDEX / BREADTH</span><b :data-tone="marketQualityState.tone">{{ marketQualityState.label }}</b></header>
				<h3>指数与市场宽度</h3>
				<p v-if="marketOverviewError" class="market-capability-error">
					{{ marketOverviewError }}
				</p>
				<p v-else-if="marketOverviewLoading && !marketOverview">
					正在读取真实行情。
				</p>
				<div v-else-if="marketIndices.length" class="market-index-strip">
					<div v-for="index in marketIndices" :key="index.code" class="market-index-quote">
						<span>{{ index.name }}</span>
						<strong>{{ formatIndexValue(index.value) }}</strong>
						<b :class="moveClass(index.changePct)">{{ formatPercent(index.changePct) }}</b>
					</div>
					<div v-if="marketBreadth" class="market-breadth-quote">
						<span>市场宽度</span>
						<strong><i class="up">{{ marketBreadth.advancing }} 涨</i><i class="down">{{ marketBreadth.declining }} 跌</i></strong>
						<small>平 {{ marketBreadth.flat }} · 共 {{ marketBreadth.total }}</small>
					</div>
				</div>
				<p v-else>
					暂无可信行情；Provider 未通过或上游当前不可用，不展示示例点位。
				</p>
				<footer><Icon name="tabler:clock" aria-hidden="true" />{{ marketOverview?.marketAt ? formatDateTime(marketOverview.marketAt) : '等待可信行情' }}</footer>
			</article>
			<article class="market-capability market-capability-live">
				<header><span>TODAY / THEMES</span><b>NEWS-BASED</b></header>
				<h3>今日主线</h3>
				<p>{{ mainlineSummary }}</p>
				<footer><Icon name="tabler:chart-dots" aria-hidden="true" />仅按公开财经事件 topic 频次聚合，不使用 LLM</footer>
			</article>
			<article class="market-capability">
				<header><span>WATCHLIST</span><b>PRIVATE</b></header>
				<h3>自选雷达</h3>
				<p>最多 30 只私有自选；页面按需批量读取，后台每 5 分钟仅扫描已启用自选。</p>
				<footer><Icon name="tabler:star" aria-hidden="true" />P2A · 不做全市场扫描</footer>
			</article>
			<article class="market-capability market-capability-live">
				<header><span>SECTOR FLOW</span><b>ON DEMAND</b></header>
				<h3>板块 / 概念资金</h3>
				<p>当日排名与 1 / 3 / 5 / 10 / 20 日累计由本站 Market API 提供；不存全市场 Tick。</p>
				<footer><Icon name="tabler:database-search" aria-hidden="true" />行业 / 概念资金按需加载真实数据</footer>
			</article>
			<article class="market-capability market-capability-live">
				<header><span>NEWS SIGNAL</span><b>LIVE</b></header>
				<h3>财经事件聚合</h3>
				<p>公开来源经过确定性跨源去重；同事件可保留多来源证据，不用 LLM 猜测是否重复。</p>
				<footer><Icon name="tabler:activity" aria-hidden="true" />{{ financeData?.total || 0 }} 条当前事件</footer>
			</article>
		</section>

		<div class="market-main-grid">
			<section class="market-panel market-feed" aria-labelledby="market-finance-title">
				<header class="market-panel-header">
					<div>
						<span>EVENT STREAM</span>
						<h2 id="market-finance-title">
							财经驱动
						</h2>
						<p>公开财经快讯 · 跨源相似事件折叠 · 上海时区</p>
					</div>
					<label class="market-important-switch">
						<input v-model="importantOnly" type="checkbox">
						<span aria-hidden="true" />
						<strong>只看重要</strong>
					</label>
				</header>

				<nav class="market-finance-filters" aria-label="财经事件分类">
					<button
						v-for="filter in financeFilters"
						:key="filter.id"
						type="button"
						:class="{ active: financeFilter === filter.id }"
						:aria-pressed="financeFilter === filter.id"
						@click="financeFilter = filter.id"
					>
						{{ filter.label }}
					</button>
				</nav>

				<div v-if="financeError" class="market-error" role="alert">
					<Icon name="tabler:alert-triangle" aria-hidden="true" />
					<div><strong>财经链路暂不可用</strong><span>{{ financeError }}</span></div>
					<button type="button" @click="loadFinance()">
						重新加载
					</button>
				</div>

				<div v-else-if="financeLoading && !financeData" class="market-loading" aria-label="财经事件加载中">
					<span v-for="index in 6" :key="index" />
				</div>

				<div v-else-if="financeItems.length" class="market-event-list" aria-live="polite">
					<article v-for="item in financeItems" :key="item.id" class="market-event" :class="{ important: item.important }">
						<time :datetime="item.publishedAt">{{ formatFinanceTime(item.publishedAt) }}</time>
						<div class="market-event-marker" aria-hidden="true">
							<span />
						</div>
						<div class="market-event-body">
							<header>
								<b v-if="item.important" class="market-important-badge">重要</b>
								<span>{{ item.categoryLabel }}</span>
								<span v-if="item.topic">{{ item.topic }}</span>
								<span v-if="(item.sourceCount || 1) > 1" class="market-multisource">多源 ×{{ item.sourceCount }}</span>
							</header>
							<h3>{{ item.title }}</h3>
							<p v-if="item.summary">
								{{ item.summary }}
							</p>
							<footer>
								<span title="事件来源">{{ sourceSummary(item) }}</span>
								<div v-if="sourceLinks(item).length" class="market-source-links">
									<a
										v-for="source in sourceLinks(item)"
										:key="source.sourceId"
										:href="source.sourceUrl || undefined"
										target="_blank"
										rel="noopener noreferrer"
									>
										{{ source.sourceName }} <Icon name="tabler:arrow-up-right" aria-hidden="true" />
									</a>
								</div>
							</footer>
						</div>
					</article>
				</div>

				<div v-else class="market-empty">
					<Icon name="tabler:radar-off" aria-hidden="true" />
					<strong>当前筛选没有财经事件</strong>
					<p>切换分类或关闭“只看重要”；这里不会为了填满页面生成模拟数据。</p>
				</div>
			</section>

			<aside class="market-side-stack" aria-label="市场雷达状态">
				<section class="market-panel market-signal-panel">
					<header class="market-panel-header compact">
						<div><span>SIGNAL ENGINE</span><h2>T 监控</h2></div>
						<b class="market-state-chip">待行情源</b>
					</header>
					<div class="market-rule-list">
						<div><span>01</span><p><strong>量能异常</strong>分钟成交量明显放大时进入观察。</p></div>
						<div><span>02</span><p><strong>价量方向</strong>结合上涨 / 下跌方向，避免仅看单一柱体。</p></div>
						<div><span>03</span><p><strong>后台频率</strong>现有 5 分钟任务只扫描少量自选股。</p></div>
					</div>
					<footer>仅做观察信号，不自动下单。</footer>
				</section>

				<section class="market-panel market-integrity-panel">
					<header class="market-panel-header compact">
						<div><span>DATA INTEGRITY</span><h2>当前边界</h2></div>
					</header>
					<ul>
						<li><Icon name="tabler:circle-check" />财经公开流：已接入</li>
						<li><Icon name="tabler:lock" />金十：私有采集，不直接公开</li>
						<li><Icon name="tabler:clock-pause" />新浪 iNews：凭据 / 授权后启用</li>
						<li><Icon name="tabler:ban" />Level2 / 五档：P0 不做</li>
					</ul>
				</section>
			</aside>
		</div>
	</div>

	<section v-else-if="activeWorkspace === 'funds'" class="market-panel market-stage-view">
		<header class="market-stage-header market-funds-header">
			<div><span>CAPITAL FLOW</span><h2>板块资金</h2><p>当前主力净流入来自真实 Provider；1 / 3 / 5 / 10 / 20 日只按 D1 已积累交易日计算。</p></div>
			<div class="market-funds-actions">
				<b :data-tone="sectorQualityState.tone">{{ sectorQualityState.label }}</b>
				<div class="market-kind-switch" aria-label="板块资金类型">
					<button
						v-for="option in sectorKindOptions"
						:key="option.id"
						type="button"
						:class="{ active: sectorKind === option.id }"
						:aria-pressed="sectorKind === option.id"
						@click="sectorKind = option.id"
					>
						{{ option.label }}
					</button>
				</div>
				<button class="market-refresh compact" type="button" :disabled="sectorFlowLoading" @click="loadSectorFlows()">
					<Icon name="tabler:refresh" aria-hidden="true" />{{ sectorFlowLoading ? '刷新中' : '刷新资金' }}
				</button>
			</div>
		</header>

		<div v-if="sectorFlowError" class="market-error" role="alert">
			<Icon name="tabler:alert-triangle" aria-hidden="true" />
			<div><strong>资金链路暂不可用</strong><span>{{ sectorFlowError }}</span></div>
			<button type="button" @click="loadSectorFlows()">
				重新加载
			</button>
		</div>

		<div v-else-if="sectorFlowLoading && !sectorFlowData" class="market-loading market-flow-loading" aria-label="板块资金加载中">
			<span v-for="index in 6" :key="index" />
		</div>

		<div v-else-if="sectorFlowItems.length" class="market-table-scroll">
			<table class="market-flow-table">
				<thead>
					<tr>
						<th>板块</th>
						<th>涨跌</th>
						<th>今日主力</th>
						<th v-for="label in sectorWindowLabels" :key="label">
							{{ label }}
						</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in sectorFlowItems" :key="`${item.kind}:${item.code}`">
						<td>
							<strong>{{ item.name }}</strong>
							<small>{{ item.code }}<template v-if="item.leaderStockName"> · {{ item.leaderStockName }}</template></small>
						</td>
						<td><b :class="moveClass(item.changePct)">{{ formatPercent(item.changePct) }}</b></td>
						<td><b :class="moveClass(item.mainNetInflow)">{{ formatFlow(item.mainNetInflow) }}</b></td>
						<td v-for="window in item.windows" :key="window.days">
							<b :class="moveClass(window.netInflow)">{{ formatFlow(window.netInflow) }}</b>
							<small v-if="!window.complete">积累中 {{ window.availableDays }}/{{ window.days }}日</small>
						</td>
					</tr>
				</tbody>
			</table>
			<footer class="market-flow-footer">
				<span>{{ sectorKind === 'industry' ? '行业' : '概念' }} · {{ sectorFlowItems.length }} 个板块</span>
				<span>{{ sectorFlowData?.marketAt ? formatDateTime(sectorFlowData.marketAt) : '时间未知' }}</span>
			</footer>
		</div>

		<div v-else class="market-stage-notice">
			<Icon name="tabler:database-off" /><div><strong>暂无可信资金数据</strong><p>Provider 未通过、上游不可用或 D1 尚无最后成功快照时保持空态，不使用静态榜单或随机数。</p></div>
		</div>
	</section>

	<section v-else-if="activeWorkspace === 'watchlist'" class="market-panel market-stage-view market-watchlist-view">
		<header class="market-stage-header market-watchlist-header">
			<div><span>PRIVATE WATCHLIST</span><h2>自选雷达</h2><p>私有自选 · 最多30只。页面只批量读取当前自选，后台 5 分钟仅保存真实快照，不做全市场扫描。</p></div>
			<div v-if="watchlistAuthenticated" class="market-watchlist-header-actions">
				<div class="market-watchlist-auto">
					<span :class="{ active: isChinaMarketTradingWindow(currentClock || new Date()) }" />自动刷新 45s
				</div>
				<button class="market-refresh compact" type="button" :disabled="watchlistLoading || watchlistRequestInFlight" @click="loadWatchlistQuotes()">
					<Icon name="tabler:refresh" aria-hidden="true" />{{ watchlistLoading ? '刷新中' : '刷新' }}
				</button>
			</div>
			<b v-else>PRIVATE</b>
		</header>

		<div v-if="watchlistSessionLoading" class="market-loading market-flow-loading" aria-label="登录状态加载中">
			<span v-for="index in 3" :key="index" />
		</div>

		<div v-else-if="!watchlistAuthenticated" class="market-stage-empty market-watchlist-private">
			<Icon name="tabler:lock" />
			<strong>自选雷达 · 私有</strong>
			<p>登录后查看和维护你的 0–30 只自选股。未登录时不会请求私人自选 API。</p>
			<a href="/api/auth/login">登录管理端 <Icon name="tabler:login" /></a>
		</div>

		<template v-else>
			<form class="market-watchlist-add" @submit.prevent="addWatchlistItem">
				<div class="market-watchlist-form-title">
					<Icon name="tabler:star-plus" /><div><strong>添加自选</strong><span>{{ watchlistConfig.length }}/30</span></div>
				</div>
				<label><span>股票代码</span><input v-model="watchlistSymbolInput" name="watchlist-symbol" inputmode="numeric" autocomplete="off" placeholder="300308" maxlength="20"></label>
				<label><span>关注价</span><input v-model="watchlistAttentionInput" name="attention-price" inputmode="decimal" autocomplete="off" placeholder="可选"></label>
				<label><span>标签</span><input v-model="watchlistTagsInput" name="watchlist-tags" autocomplete="off" placeholder="CPO, 算力"></label>
				<label class="market-watchlist-note-input"><span>备注</span><input v-model="watchlistNoteInput" name="watchlist-note" autocomplete="off" placeholder="观察理由，可选" maxlength="240"></label>
				<button type="submit" :disabled="watchlistMutationLoading || !watchlistSymbolInput.trim() || watchlistConfig.length >= 30">
					<Icon name="tabler:plus" />添加
				</button>
			</form>

			<div v-if="watchlistMutationError" class="market-error" role="alert">
				<Icon name="tabler:alert-triangle" /><div><strong>关注设置未保存</strong><span>{{ watchlistMutationError }}</span></div>
			</div>
			<div v-if="watchlistError" class="market-error" role="alert">
				<Icon name="tabler:alert-triangle" /><div><strong>自选行情暂不可用</strong><span>{{ watchlistError }}</span></div><button type="button" @click="loadWatchlistQuotes()">
					重新加载
				</button>
			</div>

			<div v-if="watchlistLoading && !watchlistData" class="market-loading market-flow-loading" aria-label="自选行情加载中">
				<span v-for="index in 5" :key="index" />
			</div>

			<div v-else-if="!watchlistConfig.length" class="market-stage-empty">
				<Icon name="tabler:star" /><strong>还没有自选股</strong><p>上方输入股票代码即可添加。空自选不是行情 unavailable，也不会触发上游报价请求。</p>
			</div>

			<template v-else>
				<div class="market-watchlist-summary">
					<div><span>质量</span><strong>{{ watchlistOverallLabel() }}</strong><small>{{ watchlistData?.fetchedAt ? `更新 ${formatDateTime(watchlistData.fetchedAt)}` : '等待首次行情' }}</small></div>
					<div><span class="live-dot" />{{ isChinaMarketTradingWindow(currentClock || new Date()) ? `${watchlistLiveCount} LIVE` : `${watchlistLiveCount} 最新` }}</div>
					<div><span class="stale-dot" />{{ watchlistStaleCount }} STALE</div>
					<div><span class="unavailable-dot" />{{ watchlistUnavailableCount }} UNAVAILABLE</div>
				</div>

				<div class="market-watchlist-sort" aria-label="自选排序">
					<span>临时排序</span>
					<button
						v-for="option in watchlistSortOptions"
						:key="option.id"
						type="button"
						:class="{ active: watchlistSortMode === option.id }"
						:aria-pressed="watchlistSortMode === option.id"
						@click="watchlistSortMode = option.id"
					>
						{{ option.label }}
					</button>
					<small>仅改变当前视图，不覆盖自定义 sortOrder。</small>
				</div>

				<div class="market-watchlist-layout">
					<div class="market-watchlist-radar">
						<div class="market-watchlist-desktop">
							<table>
								<thead><tr><th>股票</th><th>现价</th><th>涨跌幅</th><th>日内高低</th><th>成交额</th><th>距关注价</th><th>状态</th><th>操作</th></tr></thead>
								<tbody>
									<tr v-for="row in watchlistRows" :key="row.watchlist.symbol" :class="{ paused: !row.watchlist.enabled }">
										<td><strong>{{ row.watchlist.name }}</strong><small>{{ row.watchlist.code }} · {{ row.watchlist.tags.join(' / ') || '未打标签' }}</small></td>
										<td><b :class="moveClass(row.quote?.changePct ?? null)">{{ formatWatchlistPrice(row.quote?.price) }}</b></td>
										<td><b :class="moveClass(row.quote?.changePct ?? null)">{{ formatPercent(row.quote?.changePct ?? null) }}</b></td>
										<td class="market-watch-range">
											<div><span>{{ formatWatchlistPrice(row.quote?.low) }}</span><i><em :style="{ left: `${watchlistRangePosition(row)}%` }" /></i><span>{{ formatWatchlistPrice(row.quote?.high) }}</span></div>
										</td>
										<td>{{ formatTurnover(row.quote?.turnover) }}</td>
										<td><b :class="moveClass(row.quote && row.watchlist.attentionPrice ? row.quote.price - row.watchlist.attentionPrice : null)">{{ watchlistDistance(row) }}</b></td>
										<td><span class="market-watch-status" :data-tone="watchlistStatusTone(row)">{{ watchlistStatusLabel(row) }}</span></td>
										<td>
											<div class="market-watch-actions">
												<button type="button" @click="beginWatchlistEdit(row.watchlist)">
													编辑
												</button><button type="button" @click="toggleWatchlistItem(row.watchlist)">
													{{ row.watchlist.enabled ? '停用' : '启用' }}
												</button><button type="button" class="danger" @click="removeWatchlistItem(row.watchlist)">
													删除
												</button>
											</div>
										</td>
									</tr>
								</tbody>
							</table>
						</div>

						<div class="market-watchlist-mobile">
							<article v-for="row in watchlistRows" :key="row.watchlist.symbol" class="market-watch-card" :class="{ paused: !row.watchlist.enabled }">
								<header><div><strong>{{ row.watchlist.name }}</strong><span>{{ row.watchlist.code }}</span></div><span class="market-watch-status" :data-tone="watchlistStatusTone(row)">{{ watchlistStatusLabel(row) }}</span></header>
								<div class="market-watch-card-price">
									<strong :class="moveClass(row.quote?.changePct ?? null)">{{ formatWatchlistPrice(row.quote?.price) }}</strong><b :class="moveClass(row.quote?.changePct ?? null)">{{ formatPercent(row.quote?.changePct ?? null) }}</b><span>距关注价 <em :class="moveClass(row.quote && row.watchlist.attentionPrice ? row.quote.price - row.watchlist.attentionPrice : null)">{{ watchlistDistance(row) }}</em></span>
								</div>
								<div class="market-watch-range mobile">
									<span>日内高低 {{ formatWatchlistPrice(row.quote?.low) }}</span><i><em :style="{ left: `${watchlistRangePosition(row)}%` }" /></i><span>{{ formatWatchlistPrice(row.quote?.high) }}</span>
								</div>
								<footer><span>成交额 {{ formatTurnover(row.quote?.turnover) }}</span><span>{{ row.watchlist.tags.join(' / ') || '未打标签' }}</span></footer>
								<div class="market-watch-actions">
									<button type="button" @click="beginWatchlistEdit(row.watchlist)">
										编辑
									</button><button type="button" @click="toggleWatchlistItem(row.watchlist)">
										{{ row.watchlist.enabled ? '停用' : '启用' }}
									</button><button type="button" class="danger" @click="removeWatchlistItem(row.watchlist)">
										删除
									</button>
								</div>
							</article>
						</div>
					</div>

					<aside class="market-watchlist-side">
						<section>
							<header><div><span>EVENT MATCH</span><h3>最近相关事件</h3></div><b>{{ watchlistRelatedEvents.length }}</b></header>
							<div v-if="watchlistRelatedEvents.length" class="market-watch-events">
								<article v-for="event in watchlistRelatedEvents" :key="event.id">
									<time>{{ formatFinanceTime(event.publishedAt) }}</time><div><strong>{{ event.title }}</strong><span>{{ event.topic || event.categoryLabel }} · {{ sourceSummary(event) }}</span></div>
								</article>
							</div>
							<p v-else>
								当前公开财经事件没有可信的股票名 / 代码 / 标签关联。
							</p>
						</section>

						<section>
							<header><div><span>WATCH SETTINGS</span><h3>关注设置</h3></div><b>{{ watchlistEditingSymbol ? 'EDIT' : 'READY' }}</b></header>
							<form v-if="watchlistEditingSymbol" class="market-watch-edit" @submit.prevent="saveWatchlistEdit">
								<strong>{{ watchlistConfig.find(item => item.symbol === watchlistEditingSymbol)?.name }}</strong>
								<label><span>关注价</span><input v-model="watchlistEditAttention" inputmode="decimal" placeholder="可留空"></label>
								<label><span>标签</span><input v-model="watchlistEditTags" placeholder="通信, CPO"></label>
								<label><span>备注</span><textarea v-model="watchlistEditNote" maxlength="240" rows="3" /></label>
								<div>
									<button type="submit" :disabled="watchlistMutationLoading">
										保存
									</button><button type="button" @click="watchlistEditingSymbol = ''">
										取消
									</button>
								</div>
							</form>
							<p v-else>
								点击任意自选的“编辑”，维护关注价、标签与个人观察备注。关注价仅用于距离计算。
							</p>
						</section>
					</aside>
				</div>
			</template>

			<footer class="market-watchlist-discipline">
				<Icon name="tabler:shield-check" />无真实报价时显示 unavailable / last-good，不生成模拟行情。
			</footer>
		</template>
	</section>

	<MarketSignalDesk
		v-else-if="activeWorkspace === 'signals'"
		:authenticated="watchlistAuthenticated"
		:session-loading="watchlistSessionLoading"
	/>

	<section v-else class="market-panel market-stage-view">
		<header class="market-stage-header">
			<div><span>BATCH STRATEGY</span><h2>策略</h2><p>低频任务交给 GitHub Actions，实时链路继续留在 Cloudflare Worker。</p></div>
			<b>AFTER CLOSE</b>
		</header>
		<div class="market-strategy-list">
			<div><span>01</span><div><strong>财报三条件筛选</strong><p>业绩增速 &gt; 50% · 毛利率上升 · 存货上升。</p></div><b>待批处理</b></div>
			<div><span>02</span><div><strong>每日收盘筛选</strong><p>收盘后计算，不依赖分钟级调度。</p></div><b>待批处理</b></div>
			<div><span>03</span><div><strong>历史回填</strong><p>补齐资金日快照与策略结果，避免阻塞实时 Worker。</p></div><b>待批处理</b></div>
		</div>
	</section>
</section>
</template>

<style scoped lang="scss">
.market-terminal {
	--market-bg: #080806;
	--market-panel: #0F0E0B;
	--market-panel-raised: #15130E;
	--market-panel-soft: #1B1811;
	--market-border: rgb(218 188 112 / 18%);
	--market-border-strong: rgb(218 188 112 / 38%);
	--market-gold: #D9BC72;
	--market-gold-bright: #F0D895;
	--market-gold-soft: rgb(217 188 114 / 10%);
	--market-text: #F2EEE4;
	--market-text-2: #BDB6A6;
	--market-text-3: #827C6F;
	--market-up: #EF5D5D;
	--market-up-soft: rgb(239 93 93 / 12%);
	--market-down: #49A36C;
	--market-down-soft: rgb(73 163 108 / 12%);
	--market-danger: #F17767;
	--market-focus: #FFE6A7;

	contain: layout style;
	position: relative;
	overflow: clip;
	min-height: min(70rem, calc(100dvh - 1rem));
	padding: clamp(0.7rem, 1.4vw, 1.15rem);
	border: 1px solid var(--market-border);
	border-radius: 0.65rem;
	box-shadow: inset 0 1px 0 rgb(255 255 255 / 3%);
	background:
		radial-gradient(90rem 32rem at 15% -10%, rgb(217 188 114 / 9%), transparent 58%),
		linear-gradient(180deg, #0B0A08 0%, var(--market-bg) 24rem, #070706 100%);
	font-family: var(--font-sans-serif);
	color: var(--market-text);
	color-scheme: dark;
	-webkit-font-smoothing: antialiased;
}

.market-grid-noise {
	position: absolute;
	inset: 0;
	background-image:
		linear-gradient(rgb(217 188 114 / 2.8%) 1px, transparent 1px),
		linear-gradient(90deg, rgb(217 188 114 / 2.8%) 1px, transparent 1px);
	background-size: 36px 36px;
	mask-image: linear-gradient(to bottom, black, transparent 58%);
	pointer-events: none;
}

.market-terminal > :not(.market-grid-noise) {
	position: relative;
	z-index: 1;
}

.market-terminal-header {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: end;
	gap: 1.25rem;
	padding: clamp(0.7rem, 1.2vw, 1rem) clamp(0.25rem, 0.8vw, 0.7rem) 1rem;
	border-bottom: 1px solid var(--market-border);
}

.market-kicker,
.market-panel-header > div > span,
.market-stage-header > div > span,
.market-workspace-heading > div > span {
	margin: 0;
	font: 600 0.64rem/1.2 var(--font-monospace);
	letter-spacing: 0.16em;
	color: var(--market-gold);
}

.market-title-row {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	margin-top: 0.3rem;
}

.market-title-row h1 {
	margin: 0;
	font-size: clamp(2rem, 4vw, 3.25rem);
	font-weight: 720;
	letter-spacing: -0.055em;
	line-height: 1;
	text-wrap: balance;
}

.market-build,
.market-state-chip,
.market-stage-header > b {
	padding: 0.2rem 0.42rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.28rem;
	background: var(--market-gold-soft);
	font: 700 0.58rem/1.2 var(--font-monospace);
	letter-spacing: 0.08em;
	color: var(--market-gold-bright);
}

.market-title-block > p:last-child {
	max-width: 48rem;
	margin: 0.75rem 0 0;
	font-size: 0.8rem;
	line-height: 1.7;
	text-wrap: pretty;
	color: var(--market-text-2);
}

.market-status-cluster {
	display: grid;
	gap: 0.45rem;
	min-width: 20rem;
}

.market-clock,
.market-connection {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	gap: 0.65rem;
	min-height: 3.25rem;
	padding: 0.55rem 0.7rem;
	border: 1px solid var(--market-border);
	border-radius: 0.4rem;
	background: rgb(255 255 255 / 1.7%);
}

.market-clock span {
	font: 600 0.58rem var(--font-monospace);
	letter-spacing: 0.08em;
	color: var(--market-text-3);
}

.market-clock strong {
	justify-self: end;
	font: 700 0.72rem var(--font-monospace);
	font-variant-numeric: tabular-nums;
	color: var(--market-gold-bright);
}

.market-state-dot {
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 50%;
	box-shadow: 0 0 0 0.26rem rgb(217 188 114 / 7%);
	background: var(--market-gold);
}

.market-connection[data-tone="online"] .market-state-dot {
	box-shadow: 0 0 0 0.26rem var(--market-down-soft);
	background: var(--market-down);
}

.market-connection[data-tone="danger"] .market-state-dot {
	box-shadow: 0 0 0 0.26rem var(--market-up-soft);
	background: var(--market-danger);
}

.market-connection div {
	display: grid;
	gap: 0.15rem;
}

.market-connection strong {
	font-size: 0.72rem;
}

.market-connection div span {
	font: 0.6rem/1.4 var(--font-monospace);
	font-variant-numeric: tabular-nums;
	color: var(--market-text-3);
}

.market-discipline-bar {
	display: flex;
	align-items: center;
	gap: clamp(0.8rem, 2vw, 1.5rem);
	min-height: 2.75rem;
	padding: 0.45rem 0.7rem;
	border-bottom: 1px solid var(--market-border);
	font-size: 0.68rem;
	color: var(--market-text-2);
}

.market-discipline-bar > div,
.market-discipline-bar > a {
	display: flex;
	align-items: center;
	gap: 0.4rem;
}

.market-discipline-bar > div:first-child .iconify {
	color: var(--market-gold);
}

.market-discipline-bar strong {
	color: var(--market-text);
}

.market-discipline-bar > a {
	margin-left: auto;
	color: var(--market-gold-bright);
}

.market-up-mark,
.market-down-mark {
	display: grid;
	place-items: center;
	width: 1.35rem;
	height: 1.35rem;
	border: 1px solid currentcolor;
	border-radius: 0.2rem;
	font: 700 0.62rem var(--font-monospace);
}

.market-up-mark { color: var(--market-up); }
.market-down-mark { color: var(--market-down); }

.market-workspaces {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 1px;
	overflow: hidden;
	margin-top: 0.75rem;
	border: 1px solid var(--market-border);
	border-radius: 0.45rem;
	background: var(--market-border);
}

.market-workspaces button {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.55rem;
	min-width: 0;
	min-height: 3.5rem;
	padding: 0.55rem 0.65rem;
	background: var(--market-panel);
	color: var(--market-text-2);
	transition: background-color 0.18s ease, color 0.18s ease;
}

.market-workspaces button:hover {
	background: var(--market-panel-raised);
	color: var(--market-text);
}

.market-workspaces button.active {
	box-shadow: inset 0 -2px 0 var(--market-gold);
	background: linear-gradient(180deg, var(--market-panel-raised), var(--market-panel));
	color: var(--market-gold-bright);
}

.market-workspaces button > .iconify {
	flex: 0 0 auto;
	font-size: 1.1rem;
}

.market-workspaces button > span {
	display: grid;
	gap: 0.1rem;
	min-width: 0;
	text-align: left;
}

.market-workspaces strong {
	font-size: 0.74rem;
}

.market-workspaces small {
	overflow: hidden;
	font: 0.56rem var(--font-monospace);
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--market-text-3);
}

.market-workspace-heading {
	display: flex;
	align-items: end;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem 0.2rem 0.65rem;
}

.market-workspace-heading h2 {
	margin: 0.16rem 0 0;
	font-size: 1.08rem;
	letter-spacing: -0.02em;
}

.market-refresh {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	min-height: 2.75rem;
	padding: 0.48rem 0.72rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.35rem;
	background: var(--market-gold-soft);
	font-size: 0.68rem;
	color: var(--market-gold-bright);
	transition: background-color 0.18s ease, transform 0.18s ease;
}

.market-refresh:hover:not(:disabled) { background: rgb(217 188 114 / 17%); }
.market-refresh:active:not(:disabled) { transform: translateY(1px); }

.market-refresh:disabled {
	opacity: 0.5;
	cursor: wait;
}

.market-capability-grid {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 0.55rem;
}

.market-capability,
.market-panel {
	border: 1px solid var(--market-border);
	border-radius: 0.45rem;
	background: color-mix(in srgb, var(--market-panel) 97%, transparent);
}

.market-capability {
	display: grid;
	grid-template-rows: auto auto 1fr auto;
	gap: 0.5rem;
	min-height: 10.5rem;
	padding: 0.8rem;
}

.market-capability header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	font: 0.55rem var(--font-monospace);
	letter-spacing: 0.08em;
	color: var(--market-text-3);
}

.market-capability header b {
	font-weight: 700;
	color: var(--market-gold);
}

.market-capability h3 {
	margin: 0;
	font-size: 0.86rem;
}

.market-capability p {
	margin: 0;
	font-size: 0.7rem;
	line-height: 1.65;
	color: var(--market-text-2);
}

.market-capability footer {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	padding-top: 0.5rem;
	border-top: 1px solid var(--market-border);
	font: 0.58rem/1.45 var(--font-monospace);
	color: var(--market-text-3);
}

.market-capability-live {
	border-color: var(--market-border-strong);
	background: linear-gradient(150deg, var(--market-gold-soft), var(--market-panel) 48%);
}

.market-capability-live footer { color: var(--market-gold-bright); }

.market-capability p.market-capability-error { color: var(--market-up); }

.market-index-strip {
	display: grid;
	gap: 0.32rem;
}

.market-index-quote,
.market-breadth-quote {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.14rem 0.4rem;
	padding-bottom: 0.3rem;
	border-bottom: 1px solid var(--market-border);
}

.market-index-quote:last-child,
.market-breadth-quote:last-child { border-bottom: 0; }

.market-index-quote span,
.market-breadth-quote span {
	font-size: 0.58rem;
	color: var(--market-text-3);
}

.market-index-quote strong {
	font: 700 0.76rem var(--font-monospace);
	font-variant-numeric: tabular-nums;
	color: var(--market-text);
}

.market-index-quote b,
.market-breadth-quote strong {
	font: 700 0.6rem var(--font-monospace);
	font-variant-numeric: tabular-nums;
}

.market-breadth-quote strong {
	display: flex;
	gap: 0.35rem;
}

.market-breadth-quote small {
	grid-column: 1 / -1;
	font: 0.55rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-terminal .up { color: var(--market-up); }
.market-terminal .down { color: var(--market-down); }
.market-terminal .flat { color: var(--market-text-2); }

.market-main-grid {
	display: grid;
	grid-template-columns: minmax(0, 1.85fr) minmax(17rem, 0.65fr);
	align-items: start;
	gap: 0.55rem;
	margin-top: 0.55rem;
}

.market-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.85rem 0.9rem;
	border-bottom: 1px solid var(--market-border);
}

.market-panel-header.compact { padding: 0.7rem 0.75rem; }

.market-panel-header h2 {
	margin: 0.18rem 0 0;
	font-size: 0.96rem;
}

.market-panel-header p {
	margin: 0.22rem 0 0;
	font-size: 0.64rem;
	color: var(--market-text-3);
}

.market-important-switch {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-height: 2.75rem;
	font-size: 0.68rem;
	color: var(--market-text-2);
	cursor: pointer;
}

.market-important-switch input {
	position: absolute;
	opacity: 0;
	pointer-events: none;
}

.market-important-switch > span {
	position: relative;
	width: 2.25rem;
	height: 1.25rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 999px;
	background: var(--market-panel-soft);
}

.market-important-switch > span::after {
	content: "";
	position: absolute;
	top: 0.16rem;
	left: 0.17rem;
	width: 0.78rem;
	height: 0.78rem;
	border-radius: 50%;
	background: var(--market-text-2);
	transition: transform 0.18s ease, background-color 0.18s ease;
}

.market-important-switch input:checked + span {
	border-color: rgb(239 93 93 / 45%);
	background: var(--market-up-soft);
}

.market-important-switch input:checked + span::after {
	background: var(--market-up);
	transform: translateX(0.95rem);
}

.market-finance-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem;
	padding: 0.55rem 0.75rem;
	border-bottom: 1px solid var(--market-border);
}

.market-finance-filters button {
	min-height: 2.75rem;
	padding: 0.42rem 0.68rem;
	border: 1px solid transparent;
	border-radius: 0.28rem;
	font-size: 0.64rem;
	color: var(--market-text-3);
}

.market-finance-filters button:hover { color: var(--market-text); }

.market-finance-filters button.active {
	border-color: var(--market-border-strong);
	background: var(--market-gold-soft);
	color: var(--market-gold-bright);
}

.market-loading {
	display: grid;
	gap: 1px;
	background: var(--market-border);
}

.market-loading span {
	display: block;
	height: 6rem;
	background: linear-gradient(100deg, var(--market-panel) 30%, var(--market-panel-raised) 46%, var(--market-panel) 62%);
	background-size: 220% 100%;
	animation: market-scan 1.6s linear infinite;
}

.market-error {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.75rem;
	margin: 0.75rem;
	padding: 0.75rem;
	border: 1px solid rgb(241 119 103 / 32%);
	border-radius: 0.35rem;
	background: rgb(241 119 103 / 8%);
	color: var(--market-danger);
}

.market-error > .iconify { font-size: 1.15rem; }

.market-error div {
	display: grid;
	gap: 0.15rem;
}
.market-error div strong { font-size: 0.72rem; }

.market-error div span {
	font-size: 0.64rem;
	line-height: 1.5;
	color: var(--market-text-2);
}

.market-error button {
	min-height: 2.75rem;
	padding: 0 0.7rem;
	border: 1px solid currentcolor;
	border-radius: 0.28rem;
}

.market-event-list { padding: 0 0.75rem 0.75rem; }

.market-event {
	content-visibility: auto;
	contain-intrinsic-size: auto 6.4rem;
	display: grid;
	grid-template-columns: 3.2rem 0.8rem minmax(0, 1fr);
	gap: 0.45rem;
	min-height: 6rem;
}

.market-event > time {
	padding-top: 0.92rem;
	font: 700 0.66rem var(--font-monospace);
	font-variant-numeric: tabular-nums;
	text-align: right;
	color: var(--market-gold);
}

.market-event-marker {
	display: flex;
	justify-content: center;
	position: relative;
}

.market-event-marker::before {
	content: "";
	position: absolute;
	top: 1.15rem;
	bottom: -0.45rem;
	width: 1px;
	background: var(--market-border);
}

.market-event:last-child .market-event-marker::before { bottom: 1.2rem; }

.market-event-marker span {
	position: relative;
	width: 0.4rem;
	height: 0.4rem;
	margin-top: 1rem;
	border-radius: 50%;
	box-shadow: 0 0 0 0.2rem var(--market-gold-soft);
	background: var(--market-gold);
	z-index: 1;
}

.market-event-body {
	margin: 0.2rem 0 0.45rem;
	padding: 0.65rem 0.7rem;
	border-bottom: 1px solid var(--market-border);
}

.market-event-body header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.32rem;
}

.market-event-body header > span,
.market-important-badge {
	padding: 0.15rem 0.32rem;
	border: 1px solid var(--market-border);
	border-radius: 0.2rem;
	font: 0.56rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-event-body header .market-multisource {
	border-color: var(--market-border-strong);
	color: var(--market-gold-bright);
}

.market-important-badge {
	border-color: rgb(239 93 93 / 38%);
	background: var(--market-up-soft);
	font-weight: 700;
	color: var(--market-up);
}

.market-event-body h3 {
	margin: 0.42rem 0 0;
	font-size: 0.82rem;
	letter-spacing: -0.01em;
	line-height: 1.55;
}

.market-event.important .market-event-body h3,
.market-event.important > time { color: var(--market-up); }

.market-event.important .market-event-marker span {
	box-shadow: 0 0 0 0.2rem var(--market-up-soft);
	background: var(--market-up);
}

.market-event-body > p {
	margin: 0.3rem 0 0;
	font-size: 0.68rem;
	line-height: 1.65;
	color: var(--market-text-2);
}

.market-event-body footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	margin-top: 0.5rem;
	font-size: 0.58rem;
	color: var(--market-text-3);
}

.market-source-links {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 0.45rem;
}

.market-source-links a {
	display: inline-flex;
	align-items: center;
	gap: 0.16rem;
	min-height: 2.5rem;
	padding-inline: 0.2rem;
	color: var(--market-gold-bright);
}

.market-empty,
.market-stage-empty {
	display: grid;
	place-items: center;
	gap: 0.45rem;
	min-height: 18rem;
	padding: 2rem;
	text-align: center;
	color: var(--market-text-2);
}

.market-empty > .iconify,
.market-stage-empty > .iconify {
	font-size: 1.8rem;
	color: var(--market-gold);
}

.market-empty strong,
.market-stage-empty strong { color: var(--market-text); }

.market-empty p,
.market-stage-empty p {
	max-width: 34rem;
	margin: 0;
	font-size: 0.7rem;
	line-height: 1.7;
	color: var(--market-text-3);
}

.market-stage-empty a {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	min-height: 2.75rem;
	color: var(--market-gold-bright);
}

.market-side-stack {
	display: grid;
	gap: 0.55rem;
}

.market-rule-list { display: grid; }

.market-rule-list > div {
	display: grid;
	grid-template-columns: 2rem minmax(0, 1fr);
	gap: 0.45rem;
	padding: 0.7rem 0.75rem;
	border-bottom: 1px solid var(--market-border);
}

.market-rule-list > div > span {
	font: 0.6rem var(--font-monospace);
	color: var(--market-gold);
}

.market-rule-list p {
	margin: 0;
	font-size: 0.66rem;
	line-height: 1.6;
	color: var(--market-text-3);
}

.market-rule-list strong {
	display: block;
	margin-bottom: 0.16rem;
	color: var(--market-text-2);
}

.market-signal-panel > footer {
	padding: 0.7rem 0.75rem;
	font-size: 0.62rem;
	color: var(--market-text-3);
}

.market-integrity-panel ul {
	display: grid;
	gap: 0;
	margin: 0;
	padding: 0;
	list-style: none;
}

.market-integrity-panel li {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	padding: 0.62rem 0.75rem;
	border-bottom: 1px solid var(--market-border);
	font-size: 0.64rem;
	color: var(--market-text-2);
}
.market-integrity-panel li:last-child { border-bottom: 0; }

.market-integrity-panel li .iconify {
	flex: 0 0 auto;
	color: var(--market-gold);
}

.market-stage-view { min-height: 28rem; }

.market-stage-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem;
	border-bottom: 1px solid var(--market-border);
}

.market-stage-header h2 {
	margin: 0.18rem 0 0;
	font-size: 1.15rem;
}

.market-stage-header p {
	max-width: 48rem;
	margin: 0.35rem 0 0;
	font-size: 0.7rem;
	line-height: 1.65;
	color: var(--market-text-2);
}

.market-funds-header { align-items: center; }

.market-funds-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
	gap: 0.45rem;
}

.market-funds-actions > b {
	padding: 0.25rem 0.42rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.28rem;
	font: 700 0.58rem/1.2 var(--font-monospace);
	color: var(--market-gold-bright);
}

.market-kind-switch {
	display: flex;
	padding: 0.16rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-panel-2);
}

.market-kind-switch button {
	min-height: 2.75rem;
	padding-inline: 0.75rem;
	border-radius: 0.25rem;
	font-size: 0.66rem;
	color: var(--market-text-2);
}

.market-kind-switch button.active {
	background: var(--market-gold-soft);
	color: var(--market-gold-bright);
}

.market-refresh.compact {
	min-height: 2.75rem;
	padding-inline: 0.6rem;
}

.market-flow-loading { margin: 0.8rem; }

.market-table-scroll {
	overflow-x: auto;
	width: calc(100% - 1.6rem);
	max-width: calc(100% - 1.6rem);
	margin: 0.8rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-panel);
	overscroll-behavior-inline: contain;
}

.market-flow-table {
	width: 100%;
	min-width: 62rem;
	border-collapse: collapse;
	font-variant-numeric: tabular-nums;
}

.market-flow-table th,
.market-flow-table td {
	padding: 0.68rem 0.72rem;
	border-bottom: 1px solid var(--market-border);
	white-space: nowrap;
	text-align: right;
}

.market-flow-table th {
	position: sticky;
	top: 0;
	background: var(--market-panel-2);
	font: 0.58rem var(--font-monospace);
	letter-spacing: 0.04em;
	color: var(--market-text-3);
}

.market-flow-table th:first-child,
.market-flow-table td:first-child {
	position: sticky;
	left: 0;
	min-width: 10rem;
	background: var(--market-panel);
	text-align: left;
	z-index: 1;
}

.market-flow-table th:first-child {
	background: var(--market-panel-2);
	z-index: 2;
}

.market-flow-table tbody tr:last-child td { border-bottom: 0; }

.market-flow-table td > b {
	font: 700 0.7rem var(--font-monospace);
}

.market-flow-table td:first-child strong {
	display: block;
	font-size: 0.72rem;
	color: var(--market-text);
}

.market-flow-table td small {
	display: block;
	margin-top: 0.18rem;
	font-size: 0.54rem;
	color: var(--market-text-3);
}

.market-flow-footer {
	display: flex;
	justify-content: space-between;
	gap: 0.6rem;
	padding: 0.55rem 0.7rem;
	border-top: 1px solid var(--market-border);
	font: 0.56rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-flow-grid {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 1px;
	margin: 0.8rem;
	border: 1px solid var(--market-border);
	background: var(--market-border);
}

.market-flow-grid > div {
	display: grid;
	gap: 0.25rem;
	min-width: 0;
	padding: 0.85rem;
	background: var(--market-panel);
}

.market-flow-grid span {
	font: 0.58rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-flow-grid strong {
	font: 700 1.2rem var(--font-monospace);
	font-variant-numeric: tabular-nums;
	color: var(--market-text-2);
}

.market-flow-grid small {
	font-size: 0.58rem;
	color: var(--market-text-3);
}

.market-stage-notice {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: start;
	gap: 0.7rem;
	margin: 0.8rem;
	padding: 0.85rem;
	border-left: 2px solid var(--market-gold);
	background: var(--market-gold-soft);
}

.market-stage-notice > .iconify {
	margin-top: 0.1rem;
	color: var(--market-gold);
}
.market-stage-notice strong { font-size: 0.72rem; }

.market-stage-notice p {
	margin: 0.25rem 0 0;
	font-size: 0.66rem;
	line-height: 1.6;
	color: var(--market-text-2);
}

.market-signal-matrix {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1px;
	margin: 0.8rem;
	border: 1px solid var(--market-border);
	background: var(--market-border);
}

.market-signal-matrix > div {
	min-height: 8.5rem;
	padding: 0.9rem;
	background: var(--market-panel);
}

.market-signal-matrix span {
	font: 0.58rem var(--font-monospace);
	color: var(--market-gold);
}

.market-signal-matrix strong {
	display: block;
	margin-top: 0.4rem;
	font-size: 0.88rem;
}

.market-signal-matrix p {
	margin: 0.35rem 0 0;
	font-size: 0.68rem;
	line-height: 1.65;
	color: var(--market-text-3);
}

.market-strategy-list {
	display: grid;
	margin: 0.8rem;
	border: 1px solid var(--market-border);
}

.market-strategy-list > div {
	display: grid;
	grid-template-columns: 2.5rem minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.75rem;
	min-height: 5rem;
	padding: 0.75rem 0.85rem;
	border-bottom: 1px solid var(--market-border);
}
.market-strategy-list > div:last-child { border-bottom: 0; }

.market-strategy-list > div > span {
	font: 0.62rem var(--font-monospace);
	color: var(--market-gold);
}
.market-strategy-list strong { font-size: 0.78rem; }

.market-strategy-list p {
	margin: 0.22rem 0 0;
	font-size: 0.64rem;
	color: var(--market-text-3);
}

.market-strategy-list > div > b {
	font: 0.58rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-watchlist-header { align-items: center; }

.market-watchlist-header-actions,
.market-watchlist-auto {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.market-watchlist-auto {
	font: 0.58rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-watchlist-auto > span {
	width: 0.45rem;
	height: 0.45rem;
	border-radius: 50%;
	background: var(--market-text-3);
}
.market-watchlist-auto > span.active { background: var(--market-down); }

.market-watchlist-add {
	display: grid;
	grid-template-columns: auto minmax(8rem, 0.7fr) minmax(7rem, 0.55fr) minmax(9rem, 0.8fr) minmax(11rem, 1fr) auto;
	align-items: end;
	gap: 0.55rem;
	padding: 0.75rem;
	border-bottom: 1px solid var(--market-border);
	background: var(--market-panel-raised);
}

.market-watchlist-form-title {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	min-height: 2.75rem;
	color: var(--market-gold);
}
.market-watchlist-form-title > .iconify { font-size: 1.1rem; }

.market-watchlist-form-title > div {
	display: grid;
	gap: 0.1rem;
}

.market-watchlist-form-title strong {
	font-size: 0.72rem;
	color: var(--market-text);
}

.market-watchlist-form-title span {
	font: 0.56rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-watchlist-add label,
.market-watch-edit label {
	display: grid;
	gap: 0.25rem;
	min-width: 0;
}

.market-watchlist-add label > span,
.market-watch-edit label > span {
	font: 0.56rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-watchlist-add input,
.market-watch-edit input,
.market-watch-edit textarea {
	width: 100%;
	min-width: 0;
	min-height: 2.75rem;
	padding: 0.48rem 0.55rem;
	border: 1px solid var(--market-border);
	border-radius: 0.3rem;
	outline: none;
	background: var(--market-panel);
	color: var(--market-text);
}

.market-watch-edit textarea {
	min-height: 5.25rem;
	resize: vertical;
}

.market-watchlist-add input:focus,
.market-watch-edit input:focus,
.market-watch-edit textarea:focus { border-color: var(--market-gold); }

.market-watchlist-add > button,
.market-watch-edit button,
.market-watch-actions button {
	min-height: 2.75rem;
	padding: 0.45rem 0.65rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.3rem;
	font-size: 0.62rem;
	color: var(--market-gold-bright);
}

.market-watchlist-add > button {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.3rem;
	background: var(--market-gold-soft);
}

.market-watchlist-add > button:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.market-watchlist-summary {
	display: flex;
	align-items: stretch;
	gap: 1px;
	overflow: hidden;
	margin: 0.75rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-border);
}

.market-watchlist-summary > div {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	min-height: 3.25rem;
	padding: 0.55rem 0.75rem;
	background: var(--market-panel);
	font: 0.6rem var(--font-monospace);
	color: var(--market-text-2);
}

.market-watchlist-summary > div:first-child {
	display: grid;
	min-width: 13rem;
	margin-right: auto;
}

.market-watchlist-summary > div:first-child span,
.market-watchlist-summary small {
	font-size: 0.55rem;
	color: var(--market-text-3);
}
.market-watchlist-summary strong { color: var(--market-gold-bright); }

.live-dot, .stale-dot, .unavailable-dot {
	width: 0.45rem;
	height: 0.45rem;
	border-radius: 50%;
}
.live-dot { background: var(--market-down); }
.stale-dot { background: var(--market-gold); }
.unavailable-dot { background: var(--market-text-3); }

.market-watchlist-sort {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	margin: 0 0.75rem 0.75rem;
	padding: 0.45rem 0.55rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-panel);
}

.market-watchlist-sort > span,
.market-watchlist-sort > small {
	font: 0.54rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-watchlist-sort > small {
	margin-left: auto;
}

.market-watchlist-sort button {
	min-height: 2rem;
	padding: 0.3rem 0.5rem;
	border: 1px solid var(--market-border);
	border-radius: 0.25rem;
	font: 0.56rem var(--font-monospace);
	color: var(--market-text-2);
}

.market-watchlist-sort button.active {
	border-color: var(--market-border-strong);
	background: var(--market-gold-soft);
	color: var(--market-gold-bright);
}

.market-watchlist-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem);
	gap: 0.65rem;
	margin: 0.75rem;
}

.market-watchlist-radar,
.market-watchlist-side > section {
	min-width: 0;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-panel);
}

.market-watchlist-desktop {
	overflow-x: auto;
	max-width: 100%;
	overscroll-behavior-inline: contain;
}

.market-watchlist-desktop table {
	width: 100%;
	min-width: 66rem;
	border-collapse: collapse;
	font-variant-numeric: tabular-nums;
}

.market-watchlist-desktop th,
.market-watchlist-desktop td {
	padding: 0.65rem 0.7rem;
	border-bottom: 1px solid var(--market-border);
	font-size: 0.64rem;
	white-space: nowrap;
	text-align: right;
}

.market-watchlist-desktop th {
	background: var(--market-panel-raised);
	font: 0.56rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-watchlist-desktop th:first-child,
.market-watchlist-desktop td:first-child {
	position: sticky;
	left: 0;
	background: var(--market-panel);
	text-align: left;
	z-index: 1;
}

.market-watchlist-desktop th:first-child {
	background: var(--market-panel-raised);
	z-index: 2;
}
.market-watchlist-desktop tbody tr:last-child td { border-bottom: 0; }
.market-watchlist-desktop tr.paused { opacity: 0.58; }

.market-watchlist-desktop td:first-child strong {
	display: block;
	font-size: 0.72rem;
	color: var(--market-text);
}

.market-watchlist-desktop td:first-child small {
	display: block;
	margin-top: 0.16rem;
	color: var(--market-text-3);
}

.market-watch-range > div,
.market-watch-range.mobile {
	display: flex;
	align-items: center;
	gap: 0.35rem;
}

.market-watch-range span {
	font: 0.54rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-watch-range i {
	display: block;
	position: relative;
	width: 5.5rem;
	height: 2px;
	background: var(--market-text-3);
}

.market-watch-range i em {
	position: absolute;
	top: 50%;
	width: 0.45rem;
	height: 0.45rem;
	border-radius: 50%;
	background: var(--market-gold);
	transform: translate(-50%, -50%);
}

.market-watch-status {
	display: inline-flex;
	align-items: center;
	min-height: 1.65rem;
	padding: 0.18rem 0.38rem;
	border: 1px solid var(--market-border);
	border-radius: 0.25rem;
	font: 700 0.54rem var(--font-monospace);
	color: var(--market-text-2);
}

.market-watch-status[data-tone="live"] {
	border-color: rgb(73 163 108 / 46%);
	background: var(--market-down-soft);
	color: #7DD99D;
}

.market-watch-status[data-tone="stale"] {
	border-color: var(--market-border-strong);
	background: var(--market-gold-soft);
	color: var(--market-gold-bright);
}

.market-watch-status[data-tone="unavailable"],
.market-watch-status[data-tone="paused"] { color: var(--market-text-3); }

.market-watch-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.25rem;
}

.market-watch-actions button {
	min-height: 2.4rem;
	padding-inline: 0.45rem;
	color: var(--market-text-2);
}
.market-watch-actions button.danger { color: var(--market-danger); }

.market-watchlist-mobile { display: none; }

.market-watchlist-side {
	display: grid;
	align-content: start;
	gap: 0.65rem;
}

.market-watchlist-side > section > header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	padding: 0.7rem;
	border-bottom: 1px solid var(--market-border);
}

.market-watchlist-side > section > header span {
	font: 0.52rem var(--font-monospace);
	letter-spacing: 0.08em;
	color: var(--market-gold);
}

.market-watchlist-side > section > header h3 {
	margin: 0.18rem 0 0;
	font-size: 0.76rem;
}

.market-watchlist-side > section > header b {
	font: 0.56rem var(--font-monospace);
	color: var(--market-gold-bright);
}

.market-watchlist-side > section > p {
	margin: 0;
	padding: 0.75rem;
	font-size: 0.64rem;
	line-height: 1.65;
	color: var(--market-text-3);
}

.market-watch-events { display: grid; }

.market-watch-events article {
	display: grid;
	grid-template-columns: 2.6rem minmax(0, 1fr);
	gap: 0.45rem;
	padding: 0.65rem 0.7rem;
	border-bottom: 1px solid var(--market-border);
}
.market-watch-events article:last-child { border-bottom: 0; }

.market-watch-events time {
	font: 0.56rem var(--font-monospace);
	color: var(--market-gold);
}

.market-watch-events div {
	display: grid;
	gap: 0.18rem;
}

.market-watch-events strong {
	font-size: 0.64rem;
	line-height: 1.45;
}

.market-watch-events span {
	font-size: 0.55rem;
	color: var(--market-text-3);
}

.market-watch-edit {
	display: grid;
	gap: 0.55rem;
	padding: 0.7rem;
}
.market-watch-edit > strong { font-size: 0.7rem; }

.market-watch-edit > div {
	display: flex;
	gap: 0.35rem;
}

.market-watchlist-discipline {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	margin: 0.75rem;
	padding: 0.6rem 0.7rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	font: 0.58rem/1.5 var(--font-monospace);
	color: var(--market-text-3);
}
.market-watchlist-discipline .iconify { color: var(--market-gold); }

.market-watch-card {
	display: grid;
	gap: 0.65rem;
	padding: 0.75rem;
	border-bottom: 1px solid var(--market-border);
}
.market-watch-card:last-child { border-bottom: 0; }
.market-watch-card.paused { opacity: 0.58; }

.market-watch-card > header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}

.market-watch-card > header > div {
	display: flex;
	align-items: baseline;
	gap: 0.35rem;
}
.market-watch-card > header strong { font-size: 0.76rem; }

.market-watch-card > header div span {
	font: 0.55rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-watch-card-price {
	display: grid;
	grid-template-columns: auto auto minmax(0, 1fr);
	align-items: baseline;
	gap: 0.5rem;
}
.market-watch-card-price > strong { font: 700 1.35rem var(--font-monospace); }
.market-watch-card-price > b { font: 700 0.68rem var(--font-monospace); }

.market-watch-card-price > span {
	justify-self: end;
	font-size: 0.55rem;
	color: var(--market-text-3);
}

.market-watch-card-price em {
	display: block;
	margin-top: 0.15rem;
	font: 700 0.6rem var(--font-monospace);
	font-style: normal;
}

.market-watch-range.mobile i {
	flex: 1 1 auto;
	width: auto;
}

.market-watch-card > footer {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	font: 0.55rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-terminal button,
.market-terminal a,
.market-important-switch {
	touch-action: manipulation;
}

.market-workspaces button,
.market-finance-filters button,
.market-refresh,
.market-error button {
	transition-property: background-color, color, border-color, transform;
	transition-duration: 0.18s;
	transition-timing-function: ease;
}

.market-workspaces button:active,
.market-finance-filters button:active,
.market-refresh:active:not(:disabled),
.market-error button:active {
	transform: scale(0.96);
}

.market-terminal button:focus-visible,
.market-terminal a:focus-visible,
.market-important-switch:has(input:focus-visible) {
	outline: 2px solid var(--market-focus);
	outline-offset: 2px;
}

@keyframes market-scan {
	from { background-position: 160% 0; }
	to { background-position: -60% 0; }
}

@media (max-width: 1100px) {
	.market-watchlist-add { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	.market-watchlist-form-title { grid-column: 1 / -1; }
	.market-watchlist-add > button { min-height: 2.75rem; }
	.market-capability-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.market-main-grid { grid-template-columns: minmax(0, 1fr); }
	.market-side-stack { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 760px) {
	.market-terminal {
		padding: 0.55rem;
		border-inline: 0;
		border-radius: 0;
	}

	.market-terminal-header {
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
	}

	.market-status-cluster {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		width: 100%;
		min-width: 0;
	}

	.market-clock,
	.market-connection {
		grid-template-columns: minmax(0, 1fr);
		align-content: center;
		min-width: 0;
	}

	.market-clock strong {
		justify-self: start;
		overflow-wrap: anywhere;
	}
	.market-discipline-bar { flex-wrap: wrap; }
	.market-discipline-bar > a { margin-left: 0; }

	.market-workspaces {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		overflow: visible;
		border: 0;
		background: transparent;
	}

	.market-workspaces button {
		border: 1px solid var(--market-border);
		border-radius: 0.35rem;
	}
	.market-capability-grid { grid-template-columns: minmax(0, 1fr); }
	.market-side-stack { grid-template-columns: minmax(0, 1fr); }
	.market-flow-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.market-signal-matrix { grid-template-columns: minmax(0, 1fr); }

	.market-event {
		grid-template-columns: 2.75rem 0.65rem minmax(0, 1fr);
		gap: 0.28rem;
	}
	.market-event-list { padding-inline: 0.35rem; }
	.market-event-body { padding-inline: 0.45rem; }

	.market-event-body footer {
		flex-direction: column;
		align-items: flex-start;
	}
	.market-source-links { justify-content: flex-start; }
	.market-stage-header { flex-direction: column; }

	.market-watchlist-header-actions {
		justify-content: space-between;
		width: 100%;
	}

	.market-watchlist-sort {
		flex-wrap: wrap;
		margin-inline: 0.55rem;
	}

	.market-watchlist-sort button {
		min-height: 44px;
	}

	.market-watchlist-sort > small {
		width: 100%;
		margin-left: 0;
	}
	.market-watchlist-add { grid-template-columns: minmax(0, 1fr); }
	.market-watchlist-form-title { grid-column: auto; }
	.market-watchlist-summary { flex-wrap: wrap; }

	.market-watchlist-summary > div:first-child {
		width: 100%;
		margin-right: 0;
	}

	.market-watchlist-layout {
		grid-template-columns: minmax(0, 1fr);
		margin-inline: 0.55rem;
	}
	.market-watchlist-desktop { display: none; }
	.market-watchlist-mobile { display: block; }
	.market-watchlist-side { grid-template-columns: minmax(0, 1fr); }

	.market-watch-actions button {
		min-height: 44px;
	}
}

@media (max-width: 480px) {
	.market-status-cluster { grid-template-columns: minmax(0, 1fr); }
	.market-workspaces { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.market-workspaces button { justify-content: flex-start; }
	.market-workspaces small { display: none; }
	.market-panel-header { align-items: flex-start; }
	.market-important-switch { margin-left: auto; }
	.market-error { grid-template-columns: auto minmax(0, 1fr); }

	.market-error button {
		grid-column: 2;
		justify-self: start;
	}
	.market-flow-grid { grid-template-columns: minmax(0, 1fr); }
	.market-strategy-list > div { grid-template-columns: 2rem minmax(0, 1fr); }
	.market-strategy-list > div > b { grid-column: 2; }
}

@media (prefers-reduced-transparency: reduce) {
	.market-terminal {
		background: var(--market-bg);
	}

	.market-grid-noise {
		display: none;
	}

	.market-clock,
	.market-connection,
	.market-capability,
	.market-panel {
		background: var(--market-panel);
	}

	.market-capability-live {
		background: var(--market-panel-raised);
	}
}

@media (prefers-reduced-motion: reduce) {
	.market-terminal *,
	.market-terminal *::before,
	.market-terminal *::after {
		transition: none;
		animation: none;
		scroll-behavior: auto;
	}
}
</style>
