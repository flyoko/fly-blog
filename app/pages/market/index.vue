<script setup lang="ts">
import type { AdminSessionDto } from '#shared/admin/auth'
import type { FinanceFilter, FinanceFlashDto, FinanceFlashListDto, FinanceFlashSourceDto } from '#shared/admin/finance'
import type { CiticFuturesPositionHistory, CiticFuturesSeries, FinancialReportPeriod, FinancialTrendFilter, MarketDataQuality, MarketEnvelope, MarketFinancialScreenerData, MarketFinancialScreenerItem, MarketOverview, SectorFlowItem, SectorFlowWeek, SectorKind, SectorWeekOffset, WatchlistItem, WatchlistRadarItem, WatchlistRadarResponse } from '#shared/market'
import type { SectorSortDirection, SectorSortKey, SectorWeekSortKey } from '~/utils/market-sector-table'
import MarketFuturesPositionChart from '~/components/market/MarketFuturesPositionChart.vue'
import MarketSignalDesk from '~/components/market/MarketSignalDesk.vue'
import { isShanghaiMarketWindow, millisecondsUntilNextShanghaiWindow, WATCHLIST_MARKET_WINDOWS } from '~/utils/market-polling'
import { sectorPageCount as countSectorPages, paginateSectorFlowItems, SECTOR_PAGE_SIZE, sortSectorFlowItems } from '~/utils/market-sector-table'

type MarketWorkspace = 'radar' | 'funds' | 'watchlist' | 'signals' | 'strategy'
type WatchlistSortMode = 'custom' | 'change' | 'attention' | 'turnover'
type FundsPanel = 'sectors' | 'citic'
type FinancialSortKey = 'netProfitYoY' | 'grossMarginYoYChange' | 'inventoryYoYPct'

const workspaceTabs: Array<{ id: MarketWorkspace, label: string, icon: string, note: string }> = [
	{ id: 'radar', label: '市场雷达', icon: 'tabler:radar', note: '行情与财经事件' },
	{ id: 'funds', label: '资金', icon: 'tabler:arrows-exchange', note: '板块与周期累计' },
	{ id: 'watchlist', label: '自选', icon: 'tabler:star', note: '自选雷达' },
	{ id: 'signals', label: '信号', icon: 'tabler:activity-heartbeat', note: '5分钟观察信号' },
	{ id: 'strategy', label: '策略', icon: 'tabler:filter-cog', note: '收盘筛选' },
]

const sectorKindOptions: Array<{ id: SectorKind, label: string }> = [
	{ id: 'industry', label: '行业' },
	{ id: 'concept', label: '概念' },
]

const futuresProductOptions: Array<{ id: CiticFuturesSeries, label: string }> = [
	{ id: 'ALL', label: '股指合计' },
	{ id: 'IF', label: 'IF 沪深300' },
	{ id: 'IH', label: 'IH 上证50' },
	{ id: 'IC', label: 'IC 中证500' },
	{ id: 'IM', label: 'IM 中证1000' },
]

const financialPeriodOptions: Array<{ id: FinancialReportPeriod, label: string }> = [
	{ id: 'q1', label: '一季报' },
	{ id: 'semiannual', label: '半年报' },
	{ id: 'q3', label: '三季报' },
	{ id: 'annual', label: '年报' },
]

const financialTrendOptions: Array<{ id: FinancialTrendFilter, label: string }> = [
	{ id: 'up', label: '同比提升' },
	{ id: 'any', label: '任意' },
]

const financialSortOptions: Array<{ id: FinancialSortKey, label: string }> = [
	{ id: 'netProfitYoY', label: '净利润同比' },
	{ id: 'grossMarginYoYChange', label: '毛利率改善' },
	{ id: 'inventoryYoYPct', label: '存货同比' },
]

const financeFilterOptions: Array<{ id: FinanceFilter, label: string }> = [
	{ id: 'all', label: '全部' },
	{ id: 'market', label: '市场' },
	{ id: 'company', label: '公司' },
	{ id: 'macro', label: '宏观' },
	{ id: 'overseas', label: '海外' },
	{ id: 'tech', label: '科技' },
]

const watchlistSortOptions: Array<{ id: WatchlistSortMode, label: string }> = [
	{ id: 'custom', label: '自定义顺序' },
	{ id: 'change', label: '涨跌幅排序' },
	{ id: 'attention', label: '距关注价排序' },
	{ id: 'turnover', label: '成交额排序' },
]

const sectorPageSizeOptions = [10, 20, 50, 100]

const sectorWeekOptions: Array<{ weekOffset: SectorWeekOffset, key: SectorWeekSortKey, label: string }> = [
	{ weekOffset: 0, key: 'week:0', label: '本周' },
	{ weekOffset: 1, key: 'week:1', label: '上周' },
	{ weekOffset: 2, key: 'week:2', label: '前2周' },
	{ weekOffset: 3, key: 'week:3', label: '前3周' },
]

const shanghaiTime = new Intl.DateTimeFormat('zh-CN', {
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
	timeZone: 'Asia/Shanghai',
})

const shanghaiDate = new Intl.DateTimeFormat('zh-CN', {
	month: '2-digit',
	day: '2-digit',
	timeZone: 'Asia/Shanghai',
})

const financeTime = new Intl.DateTimeFormat('zh-CN', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: 'Asia/Shanghai',
})

const activeWorkspace = ref<MarketWorkspace>('radar')
const financeData = ref<FinanceFlashListDto | null>(null)
const financeLoading = ref(true)
const financeError = ref('')
const financeFilter = ref<FinanceFilter>('all')
const financeImportantOnly = ref(false)
const marketOverview = ref<MarketEnvelope<MarketOverview> | null>(null)
const marketOverviewLoading = ref(true)
const marketOverviewError = ref('')
const fundsPanel = ref<FundsPanel>('sectors')
const sectorKind = ref<SectorKind>('industry')
const sectorSortKey = ref<SectorSortKey>('mainNetInflow')
const sectorSortDirection = ref<SectorSortDirection>('desc')
const sectorPage = ref(1)
const sectorPageSize = ref(SECTOR_PAGE_SIZE)
const sectorFlowData = ref<MarketEnvelope<SectorFlowItem[]> | null>(null)
const sectorFlowLoading = ref(false)
const sectorFlowError = ref('')
const sectorSearch = ref('')
const futuresProduct = ref<CiticFuturesSeries>('ALL')
const futuresPositionData = ref<CiticFuturesPositionHistory | null>(null)
const futuresPositionLoading = ref(false)
const futuresPositionError = ref('')
const financialPeriod = ref<FinancialReportPeriod>('semiannual')
const financialMinNetProfitYoY = ref(50)
const financialGrossMarginTrend = ref<FinancialTrendFilter>('up')
const financialInventoryTrend = ref<FinancialTrendFilter>('up')
const financialKeyword = ref('')
const financialSortKey = ref<FinancialSortKey>('netProfitYoY')
const financialData = ref<MarketEnvelope<MarketFinancialScreenerData> | null>(null)
const financialLoading = ref(false)
const financialError = ref('')
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
let futuresPositionRevision = 0
let financialRevision = 0
let refreshTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null
let watchlistTimer: ReturnType<typeof setInterval> | null = null
let watchlistWakeTimer: ReturnType<typeof setTimeout> | null = null
let watchlistRequestController: AbortController | null = null
let marketPageMounted = false
const watchlistRequestInFlight = ref(false)

const financeItems = computed(() => financeData.value?.items || [])
const importantFinanceCount = computed(() => financeItems.value.filter(item => item.important).length)
const visibleFinanceItems = computed(() => financeItems.value.filter(item =>
	(financeFilter.value === 'all' || item.category === financeFilter.value)
	&& (!financeImportantOnly.value || item.important),
))
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
		return { label: '正在连接', tone: 'pending' as const, detail: '读取最新财经快讯' }
	if (financeData.value?.quality === 'unavailable')
		return { label: '暂无可信财经数据', tone: 'warning' as const, detail: '等待公开来源恢复后再展示' }
	if (financeData.value?.quality === 'stale')
		return { label: '最后成功快照', tone: 'warning' as const, detail: '当前公开来源同步失败' }
	if (financeData.value?.quality === 'degraded')
		return { label: '部分来源降级', tone: 'warning' as const, detail: '仍展示可用来源与最后成功内容' }
	if (financeData.value?.prototype)
		return { label: '历史快照', tone: 'warning' as const, detail: '当前展示最近可用内容' }
	return { label: '财经链路在线', tone: 'online' as const, detail: '公开快讯持续刷新' }
})
const lastUpdatedLabel = computed(() => formatDateTime(financeData.value?.updatedAt || null))
const activeTab = computed(() => workspaceTabs.find(tab => tab.id === activeWorkspace.value) || workspaceTabs[0]!)
const marketIndices = computed(() => marketOverview.value?.data?.indices || [])
const marketBreadth = computed(() => marketOverview.value?.data?.breadth || null)
const sectorFlowItems = computed(() => sectorFlowData.value?.data || [])
const filteredSectorFlowItems = computed(() => {
	const keyword = sectorSearch.value.trim().toLocaleLowerCase('zh-CN')
	if (!keyword)
		return sectorFlowItems.value
	return sectorFlowItems.value.filter(item => [item.name, item.code, item.leaderStockName, item.leaderStockCode]
		.filter(Boolean)
		.some(value => String(value).toLocaleLowerCase('zh-CN').includes(keyword)))
})
const sortedSectorFlowItems = computed(() => sortSectorFlowItems(filteredSectorFlowItems.value, sectorSortKey.value, sectorSortDirection.value))
const sectorPages = computed(() => countSectorPages(sortedSectorFlowItems.value.length, sectorPageSize.value))
const paginatedSectorFlowItems = computed(() => paginateSectorFlowItems(sortedSectorFlowItems.value, sectorPage.value, sectorPageSize.value))
const latestFuturesPosition = computed(() => futuresPositionData.value?.items.at(-1) || null)
const previousFuturesPosition = computed(() => futuresPositionData.value?.items.at(-2) || null)
const futuresQualityState = computed(() => {
	switch (futuresPositionData.value?.quality) {
		case 'live': return { label: '最新盘后排名', tone: 'live' as const }
		case 'degraded': return { label: '公开排名不完整', tone: 'warning' as const }
		case 'stale': return { label: '等待今日盘后数据', tone: 'warning' as const }
		default: return { label: '等待盘后样本', tone: 'muted' as const }
	}
})
const marketQualityState = computed(() => qualityState(marketOverview.value?.quality))
const sectorQualityState = computed(() => sectorFlowData.value?.quality === 'unavailable'
	? { label: '暂无可信资金数据', tone: 'muted' as const }
	: qualityState(sectorFlowData.value?.quality))
const financialItems = computed(() => {
	const items = financialData.value?.data?.items || []
	const key = financialSortKey.value
	return [...items].sort((left, right) => {
		const leftValue = financialSortValue(left, key)
		const rightValue = financialSortValue(right, key)
		return rightValue - leftValue || left.securityCode.localeCompare(right.securityCode)
	})
})
const financialQualityState = computed(() => {
	if (financialError.value && financialData.value?.data)
		return { label: '刷新失败 · 保留快照', tone: 'warning' as const }
	switch (financialData.value?.quality) {
		case 'live': return { label: '财报快照可用', tone: 'live' as const }
		case 'stale': return { label: '财报快照已陈旧', tone: 'warning' as const }
		case 'degraded': return { label: '财报数据不完整', tone: 'warning' as const }
		default: return { label: '等待财报快照', tone: 'muted' as const }
	}
})
const financialSource = computed(() => financialData.value?.source[0] || null)

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
	description: 'fly living 的市场雷达：财经 7×24、指数、板块资金、中信期货盘后席位与私有自选的统一入口。',
	ogTitle: '市场雷达 · fly living',
	ogDescription: 'A 股市场雷达、财经 7×24、板块资金与盘后席位观察。',
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

function formatDataDate(value: string | null) {
	if (!value)
		return '--.--'
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '--.--'
	return shanghaiDate.format(date).replaceAll('/', '.')
}

function formatSectorDateKey(value: string | null) {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
		return '--.--'
	return `${value.slice(5, 7)}.${value.slice(8, 10)}`
}

function formatSectorWeekRange(week: SectorFlowWeek) {
	if (!week.startDate || !week.endDate)
		return '暂无日数据'
	const start = formatSectorDateKey(week.startDate)
	const end = formatSectorDateKey(week.endDate)
	return start === end ? start : `${start}→${end}`
}

function formatSectorWeekProgress(week: SectorFlowWeek) {
	const expected = week.expectedDays || '?'
	const coverage = `${week.availableDays}/${expected}交易日`
	if (week.complete)
		return coverage
	if (week.weekOffset === 0)
		return `进行中 · ${coverage}`
	return week.availableDays ? `不完整 · ${coverage}` : `未收集 · ${coverage}`
}

function sectorWeekEntries(item: SectorFlowItem): SectorFlowWeek[] {
	return sectorWeekOptions.map(({ weekOffset }) => item.weeks?.find(week => week.weekOffset === weekOffset) || {
		weekOffset,
		netInflow: null,
		availableDays: 0,
		expectedDays: 0,
		complete: false,
		startDate: null,
		endDate: null,
	})
}

function formatFinanceTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '--:--'
	return financeTime.format(date)
}

function sectorSortAria(key: SectorSortKey) {
	if (sectorSortKey.value !== key)
		return 'none' as const
	return sectorSortDirection.value === 'desc' ? 'descending' as const : 'ascending' as const
}

function toggleSectorSort(key: SectorSortKey) {
	if (sectorSortKey.value === key) {
		sectorSortDirection.value = sectorSortDirection.value === 'desc' ? 'asc' : 'desc'
	}
	else {
		sectorSortKey.value = key
		sectorSortDirection.value = 'desc'
	}
	sectorPage.value = 1
}

function sectorSortIcon(key: SectorSortKey) {
	if (sectorSortKey.value !== key)
		return 'tabler:arrows-sort'
	return sectorSortDirection.value === 'desc' ? 'tabler:arrow-down' : 'tabler:arrow-up'
}

function goSectorPage(page: number) {
	sectorPage.value = Math.min(Math.max(1, page), sectorPages.value)
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

function formatSectorFlowStreak(item: SectorFlowItem) {
	const { streak } = item
	if (streak.direction === 'neutral' || streak.days < 1)
		return '暂无连续'
	const direction = streak.direction === 'inflow' ? '流入' : '流出'
	const days = streak.complete ? String(streak.days) : `≥${streak.days}`
	return `连续${direction} ${days} 天`
}

function formatLots(value: number) {
	return `${value > 0 ? '+' : ''}${value.toLocaleString('zh-CN')} 手`
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

async function loadFinance(options: { background?: boolean } = {}) {
	const revision = ++financeRevision
	if (!options.background)
		financeLoading.value = true
	financeError.value = ''
	try {
		const result = await $fetch<{ data: FinanceFlashListDto }>('/api/finance/flash', {
			query: { limit: 100 },
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
			query: { kind: sectorKind.value, limit: 600 },
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

async function loadFuturesPositions(options: { background?: boolean } = {}) {
	const revision = ++futuresPositionRevision
	if (!options.background)
		futuresPositionLoading.value = true
	futuresPositionError.value = ''
	try {
		const result = await $fetch<{ data: CiticFuturesPositionHistory }>('/api/market/citic-futures-positions', {
			query: { product: futuresProduct.value, days: 30 },
		})
		if (revision === futuresPositionRevision)
			futuresPositionData.value = result.data
	}
	catch (cause) {
		if (revision === futuresPositionRevision)
			futuresPositionError.value = cause instanceof Error ? cause.message : '中信期货席位数据加载失败'
	}
	finally {
		if (revision === futuresPositionRevision)
			futuresPositionLoading.value = false
	}
}

async function loadFinancialScreener() {
	const minNetProfitYoY = Number(financialMinNetProfitYoY.value)
	if (!Number.isFinite(minNetProfitYoY) || minNetProfitYoY < -1000 || minNetProfitYoY > 100000) {
		financialError.value = '归母净利润同比阈值需在 -1000% 到 100000% 之间'
		return
	}
	const revision = ++financialRevision
	financialLoading.value = true
	financialError.value = ''
	try {
		const result = await $fetch<{ data: MarketEnvelope<MarketFinancialScreenerData> }>('/api/market/financial-screener', {
			query: {
				period: financialPeriod.value,
				minNetProfitYoY,
				grossMarginTrend: financialGrossMarginTrend.value,
				inventoryTrend: financialInventoryTrend.value,
				q: financialKeyword.value.trim() || undefined,
				limit: 100,
			},
		})
		if (revision === financialRevision)
			financialData.value = result.data
	}
	catch (cause) {
		if (revision === financialRevision)
			financialError.value = cause instanceof Error ? cause.message : '财报筛选加载失败'
	}
	finally {
		if (revision === financialRevision)
			financialLoading.value = false
	}
}

function resetFinancialScreener() {
	financialPeriod.value = 'semiannual'
	financialMinNetProfitYoY.value = 50
	financialGrossMarginTrend.value = 'up'
	financialInventoryTrend.value = 'up'
	financialKeyword.value = ''
	financialSortKey.value = 'netProfitYoY'
	void loadFinancialScreener()
}

function financialSortValue(item: MarketFinancialScreenerItem, key: FinancialSortKey) {
	return item[key] ?? Number.NEGATIVE_INFINITY
}

function formatFinancialPercent(value: number | null | undefined, signed = false) {
	if (value === null || value === undefined)
		return '--'
	return `${signed && value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatFinancialPointChange(value: number | null | undefined) {
	if (value === null || value === undefined)
		return '--'
	return `${value > 0 ? '+' : ''}${value.toFixed(2)}pct`
}

function formatFinancialInventory(value: number | null | undefined) {
	if (value === null || value === undefined)
		return '--'
	if (Math.abs(value) >= 100_000_000)
		return `${(value / 100_000_000).toFixed(2)}亿`
	if (Math.abs(value) >= 10_000)
		return `${(value / 10_000).toFixed(2)}万`
	return value.toFixed(0)
}

function isChinaMarketTradingWindow(value: Date) {
	return isShanghaiMarketWindow(value, WATCHLIST_MARKET_WINDOWS)
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
	if (!marketPageMounted || activeWorkspace.value !== 'watchlist' || !watchlistSession.value?.authenticated)
		return
	const result = await $fetch<{ data: WatchlistItem[] }>('/api/admin/market/watchlist')
	watchlistConfig.value = result.data
}

async function loadWatchlistQuotes(options: { background?: boolean } = {}) {
	if (!marketPageMounted || activeWorkspace.value !== 'watchlist' || !watchlistSession.value?.authenticated || watchlistRequestInFlight.value)
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
		if (watchlistRequestController === controller) {
			watchlistRequestController = null
			watchlistRequestInFlight.value = false
			if (!options.background)
				watchlistLoading.value = false
		}
	}
}

function stopWatchlistPolling(options: { abort?: boolean } = {}) {
	if (watchlistTimer) {
		clearInterval(watchlistTimer)
		watchlistTimer = null
	}
	if (watchlistWakeTimer) {
		clearTimeout(watchlistWakeTimer)
		watchlistWakeTimer = null
	}
	if (options.abort) {
		const controller = watchlistRequestController
		watchlistRequestController = null
		watchlistRequestInFlight.value = false
		watchlistLoading.value = false
		controller?.abort()
	}
}

function scheduleWatchlistWakeup() {
	const delay = millisecondsUntilNextShanghaiWindow(new Date(), WATCHLIST_MARKET_WINDOWS)
	if (delay === null)
		return
	watchlistWakeTimer = setTimeout(() => {
		watchlistWakeTimer = null
		if (activeWorkspace.value !== 'watchlist' || !watchlistSession.value?.authenticated || document.visibilityState !== 'visible')
			return
		if (isChinaMarketTradingWindow(new Date()))
			void loadWatchlistQuotes({ background: true }).finally(() => startWatchlistPolling())
		else
			startWatchlistPolling()
	}, Math.max(250, delay + 250))
}

function startWatchlistPolling() {
	stopWatchlistPolling()
	if (!import.meta.client || !marketPageMounted || activeWorkspace.value !== 'watchlist' || !watchlistSession.value?.authenticated)
		return
	if (document.visibilityState !== 'visible')
		return
	if (!isChinaMarketTradingWindow(new Date())) {
		scheduleWatchlistWakeup()
		return
	}
	watchlistTimer = setInterval(() => {
		if (activeWorkspace.value === 'watchlist' && document.visibilityState === 'visible' && isChinaMarketTradingWindow(new Date()))
			void loadWatchlistQuotes({ background: true })
		else
			startWatchlistPolling()
	}, 45_000)
}

async function activateWatchlist() {
	stopWatchlistPolling({ abort: true })
	await loadWatchlistSession()
	if (!marketPageMounted || activeWorkspace.value !== 'watchlist' || !watchlistSession.value?.authenticated)
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
		return
	}
	if (activeWorkspace.value === 'funds') {
		if (fundsPanel.value === 'sectors')
			void loadSectorFlows({ background: true })
		else
			void loadFuturesPositions({ background: true })
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

watch(activeWorkspace, (workspace) => {
	if (workspace === 'funds') {
		if (fundsPanel.value === 'sectors')
			void loadSectorFlows()
		else
			void loadFuturesPositions()
	}
	if (workspace === 'watchlist') {
		void activateWatchlist()
	}
	else {
		stopWatchlistPolling({ abort: true })
		if (workspace === 'signals')
			void loadWatchlistSession()
	}
	if (workspace === 'strategy' && !financialData.value && !financialLoading.value)
		void loadFinancialScreener()
})

watch(sectorKind, () => {
	sectorPage.value = 1
	if (activeWorkspace.value === 'funds' && fundsPanel.value === 'sectors')
		void loadSectorFlows()
})

watch(sectorSearch, () => {
	sectorPage.value = 1
})

watch(sectorPageSize, () => {
	sectorPage.value = 1
})

watch(fundsPanel, (panel) => {
	if (activeWorkspace.value !== 'funds')
		return
	if (panel === 'sectors')
		void loadSectorFlows()
	else
		void loadFuturesPositions()
})

watch(futuresProduct, () => {
	if (activeWorkspace.value === 'funds' && fundsPanel.value === 'citic')
		void loadFuturesPositions()
})

onMounted(() => {
	marketPageMounted = true
	currentClock.value = new Date()
	document.addEventListener('visibilitychange', handleMarketVisibilityChange)
	void loadFinance()
	void loadMarketOverview()
	refreshTimer = setInterval(() => {
		void loadFinance({ background: true })
		void loadMarketOverview({ background: true })
		if (activeWorkspace.value === 'funds') {
			if (fundsPanel.value === 'sectors')
				void loadSectorFlows({ background: true })
			else
				void loadFuturesPositions({ background: true })
		}
	}, 60_000)
	clockTimer = setInterval(() => {
		currentClock.value = new Date()
	}, 1_000)
})

onBeforeUnmount(() => {
	marketPageMounted = false
	document.removeEventListener('visibilitychange', handleMarketVisibilityChange)
	stopWatchlistPolling({ abort: true })
	if (refreshTimer)
		clearInterval(refreshTimer)
	if (clockTimer)
		clearInterval(clockTimer)
})
</script>

<template>
<div class="mobile-only">
	<BlogHeader class="mobile-page-header" to="/" />
</div>
<section class="market-terminal">
	<header class="market-terminal-header">
		<div class="market-title-block">
			<p class="market-kicker">
				FLY · MARKET INTELLIGENCE
			</p>
			<div class="market-title-row">
				<h1>市场雷达</h1>
				<span class="market-build">DECISION DESK</span>
			</div>
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
					暂无可信行情，稍后刷新后再看。
				</p>
				<footer><Icon name="tabler:clock" aria-hidden="true" />{{ marketOverview?.marketAt ? formatDateTime(marketOverview.marketAt) : '等待可信行情' }}</footer>
			</article>
			<article class="market-capability market-capability-live">
				<header><span>TODAY / THEMES</span><b>NEWS-BASED</b></header>
				<h3>今日主线</h3>
				<p>{{ mainlineSummary }}</p>
				<footer><Icon name="tabler:chart-dots" aria-hidden="true" />按公开财经事件主题频次归纳</footer>
			</article>
			<article class="market-capability">
				<header><span>WATCHLIST</span><b>自选</b></header>
				<h3>自选雷达</h3>
				<p>最多 30 只私有自选，集中观察价格、涨跌和关注价距离。</p>
				<footer><Icon name="tabler:star" aria-hidden="true" />最多 30 只私有自选</footer>
			</article>
			<article class="market-capability market-capability-live">
				<header><span>SECTOR FLOW</span><b>资金</b></header>
				<h3>板块 / 概念资金</h3>
				<p>查看当日排名与本周、上周及近一个月的周资金累计。</p>
				<footer><Icon name="tabler:database-search" aria-hidden="true" />行业 / 概念资金覆盖与周期累计</footer>
			</article>
			<article class="market-capability market-capability-live">
				<header><span>NEWS SIGNAL</span><b>7×24</b></header>
				<h3>财经事件聚合</h3>
				<footer><Icon name="tabler:activity" aria-hidden="true" />{{ financeData?.total || 0 }} 条当前事件</footer>
			</article>
		</section>

		<div class="market-main-grid">
			<section class="market-panel market-feed market-finance-summary" aria-labelledby="market-finance-title">
				<header class="market-panel-header">
					<div>
						<span>FINANCE 7×24</span>
						<h2 id="market-finance-title">
							财经 7×24
						</h2>
					</div>
					<label class="market-important-switch">
						<input v-model="financeImportantOnly" type="checkbox">
						<span aria-hidden="true" />只看重要
					</label>
				</header>

				<div class="market-finance-filters" aria-label="财经分类">
					<button
						v-for="option in financeFilterOptions"
						:key="option.id"
						type="button"
						:class="{ active: financeFilter === option.id }"
						:aria-pressed="financeFilter === option.id"
						@click="financeFilter = option.id"
					>
						{{ option.label }}
					</button>
				</div>

				<div class="market-finance-metrics">
					<div><span>当前事件</span><strong>{{ financeData?.total || 0 }}</strong></div>
					<div><span>重要事件</span><strong>{{ importantFinanceCount }}</strong></div>
					<div><span>当前筛选</span><strong>{{ visibleFinanceItems.length }}</strong></div>
				</div>

				<div v-if="financeError" class="market-error" role="alert">
					<Icon name="tabler:alert-triangle" aria-hidden="true" />
					<div><strong>财经快讯暂不可用</strong><span>{{ financeError }}</span></div>
					<button type="button" @click="loadFinance()">
						重新加载
					</button>
				</div>
				<div v-else-if="financeLoading && !financeData" class="market-loading" aria-label="财经快讯加载中">
					<span v-for="index in 6" :key="index" />
				</div>
				<div v-else-if="visibleFinanceItems.length" class="market-finance-highlights market-finance-stream" aria-live="polite">
					<article v-for="item in visibleFinanceItems" :key="item.id" :class="{ important: item.important }">
						<header>
							<time :datetime="item.publishedAt">{{ formatFinanceTime(item.publishedAt) }}</time>
							<b v-if="item.important">重要</b>
							<span>{{ item.topic || item.categoryLabel }}</span>
							<span v-if="(item.sourceCount || 1) > 1">多源 ×{{ item.sourceCount }}</span>
						</header>
						<h3>{{ item.title }}</h3>
						<p v-if="item.summary">
							{{ item.summary }}
						</p>
						<footer class="market-finance-sources">
							<template v-for="source in sourceEntries(item)" :key="`${item.id}:${source.sourceId}`">
								<a v-if="source.sourceUrl" :href="source.sourceUrl" target="_blank" rel="noopener noreferrer">{{ source.sourceName }}</a>
								<span v-else>{{ source.sourceName }}</span>
							</template>
						</footer>
					</article>
				</div>
				<div v-else class="market-empty">
					<Icon name="tabler:radar-off" aria-hidden="true" />
					<strong>当前筛选暂无财经快讯</strong>
					<p>可以切换分类或关闭“只看重要”。</p>
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
						<div><span>03</span><p><strong>观察频率</strong>每 5 分钟更新已启用自选的观察状态。</p></div>
					</div>
					<footer>仅做观察信号，不自动下单。</footer>
				</section>
			</aside>
		</div>
	</div>

	<section v-else-if="activeWorkspace === 'funds'" class="market-panel market-stage-view market-funds-view">
		<header class="market-stage-header market-funds-header">
			<div class="market-funds-title">
				<span>CAPITAL FLOW</span><h2>资金观察</h2><p>板块强弱 · 盘后席位多空</p>
			</div>
			<nav class="market-funds-subnav" aria-label="资金观察类型">
				<button type="button" :class="{ active: fundsPanel === 'sectors' }" :aria-pressed="fundsPanel === 'sectors'" @click="fundsPanel = 'sectors'">
					<Icon name="tabler:chart-bar" aria-hidden="true" />板块资金
				</button>
				<button type="button" :class="{ active: fundsPanel === 'citic' }" :aria-pressed="fundsPanel === 'citic'" @click="fundsPanel = 'citic'">
					<Icon name="tabler:chart-candle" aria-hidden="true" />中信期货
				</button>
			</nav>
		</header>

		<template v-if="fundsPanel === 'sectors'">
			<div class="market-funds-toolbar">
				<div class="market-funds-primary">
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
					<label>
						<Icon name="tabler:search" aria-hidden="true" />
						<input v-model="sectorSearch" type="search" autocomplete="off" placeholder="搜索板块 / 代码 / 龙头股">
					</label>
				</div>
				<div class="market-funds-meta">
					<b :data-tone="sectorQualityState.tone">{{ sectorQualityState.label }}</b>
					<span>{{ sectorFlowItems.length }} 个 · 匹配 {{ filteredSectorFlowItems.length }}</span>
					<label class="market-page-size-select">
						<span>每页</span>
						<select v-model.number="sectorPageSize" aria-label="每页展示板块数量">
							<option v-for="size in sectorPageSizeOptions" :key="size" :value="size">{{ size }} 条/页</option>
						</select>
					</label>
					<button class="market-refresh compact" type="button" :disabled="sectorFlowLoading" @click="loadSectorFlows()">
						<Icon name="tabler:refresh" aria-hidden="true" />{{ sectorFlowLoading ? '刷新中' : '刷新资金' }}
					</button>
				</div>
			</div>

			<div v-if="sectorFlowData" class="market-data-freshness" aria-label="板块资金数据时间">
				<span><b>数据日</b>{{ formatDataDate(sectorFlowData.marketAt) }}</span>
				<span><b>市场时间</b>{{ formatDateTime(sectorFlowData.marketAt) }}</span>
				<span><b>抓取时间</b>{{ formatDateTime(sectorFlowData.fetchedAt) }}</span>
			</div>

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
							<th :aria-sort="sectorSortAria('changePct')">
								<button class="market-flow-sort" type="button" @click="toggleSectorSort('changePct')">
									涨跌 <Icon :name="sectorSortIcon('changePct')" />
								</button>
							</th>
							<th :aria-sort="sectorSortAria('mainNetInflow')">
								<button class="market-flow-sort" type="button" @click="toggleSectorSort('mainNetInflow')">
									今日主力 <Icon :name="sectorSortIcon('mainNetInflow')" />
								</button>
							</th>
							<th>连续流向</th>
							<th v-for="option in sectorWeekOptions" :key="option.key" :aria-sort="sectorSortAria(option.key)">
								<button class="market-flow-sort" type="button" @click="toggleSectorSort(option.key)">
									{{ option.label }} <Icon :name="sectorSortIcon(option.key)" />
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="item in paginatedSectorFlowItems" :key="`${item.kind}:${item.code}`">
							<td><strong>{{ item.name }}</strong><small>{{ item.code }}<template v-if="item.leaderStockName"> · {{ item.leaderStockName }}</template></small></td>
							<td><b :class="moveClass(item.changePct)">{{ formatPercent(item.changePct) }}</b></td>
							<td><b :class="moveClass(item.mainNetInflow)">{{ formatFlow(item.mainNetInflow) }}</b></td>
							<td class="market-flow-streak-cell">
								<b class="market-flow-streak" :data-direction="item.streak.direction">{{ formatSectorFlowStreak(item) }}</b>
							</td>
							<td v-for="week in sectorWeekEntries(item)" :key="week.weekOffset" class="market-flow-week-cell">
								<b :class="moveClass(week.netInflow)">{{ formatFlow(week.netInflow) }}</b>
								<small class="market-flow-week-range">{{ formatSectorWeekRange(week) }}</small>
								<small class="market-flow-week-progress" :data-complete="week.complete">{{ formatSectorWeekProgress(week) }}</small>
							</td>
						</tr>
						<tr v-if="!filteredSectorFlowItems.length" class="market-flow-search-empty">
							<td colspan="8">
								当前 {{ sectorFlowItems.length }} 个板块中没有匹配“{{ sectorSearch }}”的板块。
							</td>
						</tr>
					</tbody>
				</table>
				<footer class="market-flow-footer market-flow-pagination">
					<span>{{ sectorKind === 'industry' ? '行业' : '概念' }} · {{ filteredSectorFlowItems.length }}/{{ sectorFlowItems.length }} 个板块</span>
					<div>
						<button type="button" :disabled="sectorPage <= 1" @click="goSectorPage(1)">
							首页
						</button>
						<button type="button" :disabled="sectorPage <= 1" @click="goSectorPage(sectorPage - 1)">
							上一页
						</button>
						<b>第 {{ sectorPage }} / {{ sectorPages }} 页</b>
						<button type="button" :disabled="sectorPage >= sectorPages" @click="goSectorPage(sectorPage + 1)">
							下一页
						</button>
						<button type="button" :disabled="sectorPage >= sectorPages" @click="goSectorPage(sectorPages)">
							末页
						</button>
					</div>
					<span>{{ sectorFlowData?.marketAt ? formatDateTime(sectorFlowData.marketAt) : '时间未知' }}</span>
				</footer>
			</div>

			<div v-else class="market-stage-notice">
				<Icon name="tabler:database-off" /><div><strong>暂无可信资金数据</strong><p>暂时没有可用的板块资金数据，请稍后刷新。</p></div>
			</div>
		</template>

		<section v-else class="market-futures-section" aria-labelledby="citic-futures-title">
			<header class="market-futures-header">
				<div>
					<span>POST-CLOSE POSITION</span><h3 id="citic-futures-title">
						中信期货 · 股指席位
					</h3><p>中金所公开席位 · IF / IH / IC / IM · 最近30天</p>
				</div>
				<div class="market-futures-actions">
					<b :data-tone="futuresQualityState.tone">{{ futuresQualityState.label }}</b>
					<button class="market-refresh compact" type="button" :disabled="futuresPositionLoading" @click="loadFuturesPositions()">
						<Icon name="tabler:refresh" aria-hidden="true" />{{ futuresPositionLoading ? '刷新中' : '刷新席位' }}
					</button>
				</div>
			</header>

			<div v-if="futuresPositionData" class="market-data-freshness market-futures-freshness" aria-label="中信期货数据时间">
				<span><b>数据日</b>{{ latestFuturesPosition?.tradeDate || '--' }}</span>
				<span><b>抓取时间</b>{{ formatDateTime(futuresPositionData.fetchedAt) }}</span>
				<span><b>同步状态</b>{{ futuresPositionData.quality === 'live' ? '今日已同步' : futuresQualityState.label }}</span>
			</div>

			<div class="market-futures-tabs" aria-label="股指期货品种">
				<button v-for="option in futuresProductOptions" :key="option.id" type="button" :class="{ active: futuresProduct === option.id }" :aria-pressed="futuresProduct === option.id" @click="futuresProduct = option.id">
					{{ option.label }}
				</button>
			</div>

			<div v-if="futuresPositionError" class="market-error" role="alert">
				<Icon name="tabler:alert-triangle" aria-hidden="true" /><div><strong>盘后席位暂不可用</strong><span>{{ futuresPositionError }}</span></div><button type="button" @click="loadFuturesPositions()">
					重新加载
				</button>
			</div>
			<div v-else-if="futuresPositionLoading && !futuresPositionData" class="market-loading market-flow-loading" aria-label="中信期货席位加载中">
				<span v-for="index in 4" :key="index" />
			</div>
			<template v-else-if="latestFuturesPosition && futuresPositionData?.items.length">
				<div class="market-futures-metrics">
					<div><span>多单变化</span><strong :class="moveClass(latestFuturesPosition.longChange)">{{ formatLots(latestFuturesPosition.longChange) }}</strong></div>
					<div><span>空单变化</span><strong :class="moveClass(-latestFuturesPosition.shortChange)">{{ formatLots(latestFuturesPosition.shortChange) }}</strong></div>
					<div><span>{{ latestFuturesPosition.netChange >= 0 ? '净偏多' : '净偏空' }}</span><strong :class="moveClass(latestFuturesPosition.netChange)">{{ formatLots(latestFuturesPosition.netChange) }}</strong></div>
				</div>
				<div v-if="previousFuturesPosition" class="market-futures-previous">
					<span>{{ previousFuturesPosition.tradeDate }}</span><strong>多 {{ formatLots(previousFuturesPosition.longChange) }}</strong><strong>空 {{ formatLots(previousFuturesPosition.shortChange) }}</strong><b :class="moveClass(previousFuturesPosition.netChange)">{{ previousFuturesPosition.netChange >= 0 ? '净偏多' : '净偏空' }} {{ formatLots(previousFuturesPosition.netChange) }}</b>
				</div>
				<MarketFuturesPositionChart :points="futuresPositionData.items" />
				<footer class="market-futures-footnote">
					<span>最新 {{ latestFuturesPosition.tradeDate }} · 持买上榜 {{ latestFuturesPosition.longRankedContractCount }}/{{ latestFuturesPosition.contractCount }} 合约 · 持卖上榜 {{ latestFuturesPosition.shortRankedContractCount }}/{{ latestFuturesPosition.contractCount }} 合约</span><a :href="futuresPositionData.sourceUrl" target="_blank" rel="noopener noreferrer">中金所来源 <Icon name="tabler:arrow-up-right" /></a>
				</footer>
				<p class="market-futures-disclaimer">
					仅统计中金所前20名中出现的中信期货(代客)席位；未上榜不补0。仅作资金观察，不代表自营观点或次日涨跌。
				</p>
			</template>
			<div v-else class="market-stage-notice">
				<Icon name="tabler:calendar-stats" /><div><strong>等待盘后样本</strong><p>最近交易日数据会在盘后更新；暂时没有可用记录时保持空态。</p></div>
			</div>
		</section>
	</section>

	<section v-else-if="activeWorkspace === 'watchlist'" class="market-panel market-stage-view market-watchlist-view">
		<header class="market-stage-header market-watchlist-header">
			<div><span>PRIVATE WATCHLIST</span><h2>自选雷达</h2><p>私有自选 · 最多30只。集中查看价格、涨跌、关注价与标签。</p></div>
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
			<p>登录后查看和维护你的 0–30 只私有自选股。</p>
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
				<Icon name="tabler:shield-check" />暂无真实报价时保留最近可信行情或明确标记不可用，不显示模拟价格。
			</footer>
		</template>
	</section>

	<MarketSignalDesk
		v-else-if="activeWorkspace === 'signals'"
		:authenticated="watchlistAuthenticated"
		:session-loading="watchlistSessionLoading"
	/>

	<section v-else class="market-panel market-stage-view market-strategy-view">
		<header class="market-stage-header market-financial-header">
			<div><span>FINANCIAL SCREEN</span><h2>财报条件筛选</h2><p>同报告期同比 · 真实财报快照 · 条件证据可复核</p></div>
			<b :data-tone="financialQualityState.tone">{{ financialQualityState.label }}</b>
		</header>

		<div v-if="financialData?.data" class="market-financial-summary" aria-label="财报筛选快照摘要">
			<div><span>报告期</span><strong>{{ financialData.data.reportDate }}</strong><small>对比 {{ financialData.data.comparisonReportDate }}</small></div>
			<div><span>覆盖公司</span><strong>{{ financialData.data.totalAvailable }}</strong><small>当前完整快照</small></div>
			<div><span>当前命中</span><strong>{{ financialData.data.matchedCount }}</strong><small>按当前条件计算</small></div>
			<div>
				<span>数据来源</span>
				<a v-if="financialSource" :href="financialSource.endpoint" target="_blank" rel="noopener noreferrer">{{ financialSource.sourceName }}</a>
				<strong v-else>--</strong>
				<small>{{ formatDateTime(financialData.fetchedAt) }}</small>
			</div>
		</div>

		<form class="market-financial-filters" @submit.prevent="loadFinancialScreener()">
			<label>
				<span>报告期</span>
				<select v-model="financialPeriod">
					<option v-for="option in financialPeriodOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
				</select>
			</label>
			<label>
				<span>归母净利润同比 ≥</span>
				<div class="market-financial-number"><input v-model.number="financialMinNetProfitYoY" type="number" min="-1000" max="100000" step="0.1" inputmode="decimal"><em>%</em></div>
			</label>
			<label>
				<span>毛利率同比</span>
				<select v-model="financialGrossMarginTrend">
					<option v-for="option in financialTrendOptions" :key="`gm-${option.id}`" :value="option.id">{{ option.label }}</option>
				</select>
			</label>
			<label>
				<span>存货同比</span>
				<select v-model="financialInventoryTrend">
					<option v-for="option in financialTrendOptions" :key="`inv-${option.id}`" :value="option.id">{{ option.label }}</option>
				</select>
			</label>
			<label class="market-financial-search">
				<span>搜索</span>
				<input v-model="financialKeyword" type="search" maxlength="40" placeholder="代码 / 名称 / 行业">
			</label>
			<label>
				<span>排序</span>
				<select v-model="financialSortKey">
					<option v-for="option in financialSortOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
				</select>
			</label>
			<div class="market-financial-actions">
				<button type="button" :disabled="financialLoading" @click="resetFinancialScreener">
					<Icon name="tabler:restore" aria-hidden="true" />恢复三条件
				</button>
				<button class="primary" type="submit" :disabled="financialLoading">
					<Icon name="tabler:filter-check" aria-hidden="true" />{{ financialLoading ? '筛选中' : '应用筛选' }}
				</button>
			</div>
		</form>

		<p class="market-financial-rule">
			<b>默认三条件</b><span>归母净利润同比 ≥ 50%</span><span>毛利率同报告期同比提升</span><span>存货同报告期同比提升</span>
		</p>

		<div v-if="financialLoading && !financialData" class="market-loading market-financial-state">
			<Icon name="tabler:loader-2" />正在读取真实财报快照…
		</div>
		<div v-else-if="financialError && !financialData?.data" class="market-error market-financial-state">
			<Icon name="tabler:alert-triangle" /><div><strong>财报筛选加载失败</strong><p>{{ financialError }}</p></div><button type="button" @click="loadFinancialScreener()">
				重新加载
			</button>
		</div>
		<div v-else-if="!financialData?.data || financialData.quality === 'unavailable'" class="market-empty market-financial-state">
			<Icon name="tabler:database-off" /><div><strong>等待真实财报批处理数据</strong><p>当前没有可用的完整财报快照，不使用静态示例公司补位。</p></div>
		</div>
		<template v-else>
			<div v-if="financialData.stale || financialError" class="market-financial-warning">
				<Icon name="tabler:clock-exclamation" /><span>{{ financialError ? '本次刷新失败，继续展示最近完整财报快照。' : '当前财报快照已超过新鲜度窗口，请结合报告期与同步时间判断。' }}</span>
			</div>

			<div class="market-financial-result-head">
				<div><strong>筛选结果</strong><span v-if="financialData.data.matchedCount > financialItems.length">展示前 {{ financialItems.length }} / {{ financialData.data.matchedCount }} 条</span><span v-else>共 {{ financialData.data.matchedCount }} 条</span></div>
				<small>只说明条件命中，不构成交易结论</small>
			</div>

			<div v-if="!financialItems.length" class="market-empty market-financial-state">
				<Icon name="tabler:filter-off" /><div><strong>暂无可用财报筛选结果</strong><p>当前完整快照中没有公司同时满足所选条件，可放宽条件后重新筛选。</p></div>
			</div>

			<div v-else class="market-financial-desktop">
				<table>
					<thead><tr><th>股票</th><th>行业</th><th>归母净利润同比</th><th>毛利率同比</th><th>存货同比</th><th>报告期 / 公告日</th></tr></thead>
					<tbody>
						<tr v-for="item in financialItems" :key="`${item.reportDate}-${item.securityCode}`">
							<td><strong>{{ item.securityName }}</strong><small>{{ item.securityCode }}</small></td>
							<td>{{ item.industryName || '--' }}</td>
							<td class="financial-positive">
								<strong>{{ formatFinancialPercent(item.netProfitYoY, true) }}</strong><small>阈值 ≥ {{ financialData.data.filters.minNetProfitYoY }}%</small>
							</td>
							<td :class="{ 'financial-positive': (item.grossMarginYoYChange || 0) > 0 }">
								<strong>{{ formatFinancialPercent(item.grossMargin) }}</strong><small>上年同期 {{ formatFinancialPercent(item.previousGrossMargin) }} · {{ formatFinancialPointChange(item.grossMarginYoYChange) }}</small>
							</td>
							<td :class="{ 'financial-positive': (item.inventoryYoYChange || 0) > 0 }">
								<strong>{{ formatFinancialInventory(item.inventory) }}</strong><small>上年同期 {{ formatFinancialInventory(item.previousInventory) }} · {{ formatFinancialPercent(item.inventoryYoYPct, true) }}</small>
							</td>
							<td><strong>{{ item.reportDate }}</strong><small>公告日 {{ item.noticeDate }}</small></td>
						</tr>
					</tbody>
				</table>
			</div>

			<div v-if="financialItems.length" class="market-financial-mobile">
				<article v-for="item in financialItems" :key="`mobile-${item.reportDate}-${item.securityCode}`">
					<header><div><strong>{{ item.securityName }}</strong><span>{{ item.securityCode }} · {{ item.industryName || '行业未标注' }}</span></div><b>{{ formatFinancialPercent(item.netProfitYoY, true) }}</b></header>
					<div class="market-financial-mobile-metrics">
						<div><span>归母净利润同比</span><strong>{{ formatFinancialPercent(item.netProfitYoY, true) }}</strong><small>阈值 ≥ {{ financialData.data.filters.minNetProfitYoY }}%</small></div>
						<div><span>毛利率同比</span><strong>{{ formatFinancialPointChange(item.grossMarginYoYChange) }}</strong><small>{{ formatFinancialPercent(item.previousGrossMargin) }} → {{ formatFinancialPercent(item.grossMargin) }}</small></div>
						<div><span>存货同比</span><strong>{{ formatFinancialPercent(item.inventoryYoYPct, true) }}</strong><small>{{ formatFinancialInventory(item.previousInventory) }} → {{ formatFinancialInventory(item.inventory) }}</small></div>
					</div>
					<footer><span>报告期 {{ item.reportDate }}</span><span>公告日 {{ item.noticeDate }}</span></footer>
				</article>
			</div>
		</template>
	</section>
</section>
</template>

<style scoped lang="scss">
.market-terminal {
	--market-bg: var(--c-bg);
	--market-panel: var(--ld-bg-card);
	--market-panel-raised: var(--ld-bg-card);
	--market-panel-soft: var(--c-bg-1);
	--market-panel-2: var(--c-bg-2);
	--market-border: var(--c-border);
	--market-border-strong: color-mix(in srgb, var(--c-primary) 30%, var(--c-border));
	--market-accent: var(--c-primary);
	--market-accent-strong: var(--c-primary);
	--market-accent-soft: var(--c-primary-soft);
	--market-text: var(--c-text);
	--market-text-2: var(--c-text-2);
	--market-text-3: var(--c-text-3);
	--market-up: var(--c-error);
	--market-up-soft: var(--c-error-soft);
	--market-down: var(--c-success);
	--market-down-soft: var(--c-success-soft);
	--market-danger: var(--c-error);
	--market-focus: var(--c-primary);

	contain: layout style;
	position: relative;
	overflow: clip;
	min-height: min(70rem, calc(100dvh - 1rem));
	padding: clamp(0.7rem, 1.4vw, 1.15rem);
	border: 1px solid var(--market-border);
	border-radius: 0.65rem;
	box-shadow: var(--box-shadow-1);
	background: var(--glass-frost-fill);
	backdrop-filter: var(--glass-frost-filter);
	font-family: var(--font-basic);
	color: var(--market-text);
	-webkit-font-smoothing: antialiased;
}

:global(.dark) .market-terminal,
:global(.dynamic) .market-terminal {
	--market-up: hsl(0deg 84% 72%);
	--market-up-soft: hsl(0deg 84% 72% / 18%);
	--market-down: hsl(145deg 55% 64%);
	--market-down-soft: hsl(145deg 55% 64% / 18%);
	--market-danger: hsl(0deg 84% 72%);
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
	color: var(--market-accent);
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
	background: var(--market-accent-soft);
	font: 700 0.58rem/1.2 var(--font-monospace);
	letter-spacing: 0.08em;
	color: var(--market-accent-strong);
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
	background: var(--c-bg-soft);
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
	color: var(--market-accent-strong);
}

.market-state-dot {
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 50%;
	box-shadow: 0 0 0 0.26rem var(--market-accent-soft);
	background: var(--market-accent);
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
	color: var(--market-accent);
}

.market-discipline-bar strong {
	color: var(--market-text);
}

.market-discipline-bar > a {
	margin-left: auto;
	color: var(--market-accent-strong);
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
	box-shadow: inset 0 -2px 0 var(--market-accent);
	background: linear-gradient(180deg, var(--market-panel-raised), var(--market-panel));
	color: var(--market-accent-strong);
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
	background: var(--market-accent-soft);
	font-size: 0.68rem;
	color: var(--market-accent-strong);
	transition: background-color 0.18s ease, transform 0.18s ease;
}

.market-refresh:hover:not(:disabled) { background: color-mix(in srgb, var(--market-accent) 18%, transparent); }
.market-refresh:active:not(:disabled) { transform: translateY(1px); }

.market-refresh:disabled {
	opacity: 0.5;
	cursor: wait;
}

.market-capability-grid {
	display: grid;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	gap: 0.55rem;
}

.market-capability-grid > .market-capability:first-child { grid-column: span 2; }

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
	color: var(--market-accent);
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
	grid-row: 4;
	align-items: center;
	gap: 0.35rem;
	padding-top: 0.5rem;
	border-top: 1px solid var(--market-border);
	font: 0.58rem/1.45 var(--font-monospace);
	color: var(--market-text-3);
}

.market-capability-live {
	border-color: var(--market-border-strong);
	background: linear-gradient(150deg, var(--market-accent-soft), var(--market-panel) 48%);
}

.market-capability-live footer { color: var(--market-accent-strong); }

.market-capability p.market-capability-error { color: var(--market-up); }

.market-index-strip {
	display: grid;
	gap: 0.32rem;
}

.market-index-quote,
.market-breadth-quote {
	display: grid;
	align-items: center;
	gap: 0.14rem 0.5rem;
	padding-bottom: 0.3rem;
	border-bottom: 1px solid var(--market-border);
}

.market-index-quote { grid-template-columns: minmax(0, 1fr) auto auto; }
.market-breadth-quote { grid-template-columns: minmax(0, 1fr) auto; }

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
	border-color: color-mix(in srgb, var(--market-up) 45%, transparent);
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
	background: var(--market-accent-soft);
	color: var(--market-accent-strong);
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
	border: 1px solid color-mix(in srgb, var(--market-danger) 32%, transparent);
	border-radius: 0.35rem;
	background: var(--market-up-soft);
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
	color: var(--market-accent);
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
	box-shadow: 0 0 0 0.2rem var(--market-accent-soft);
	background: var(--market-accent);
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
	color: var(--market-accent-strong);
}

.market-important-badge {
	border-color: color-mix(in srgb, var(--market-up) 38%, transparent);
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
	color: var(--market-accent-strong);
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
	color: var(--market-accent);
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
	color: var(--market-accent-strong);
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
	color: var(--market-accent);
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

.market-funds-view { min-height: 0; }

.market-funds-header {
	align-items: center;
	padding: 0.7rem 0.8rem;
}

.market-funds-title {
	display: grid;
	gap: 0.08rem;
}

.market-funds-title p { margin-top: 0.12rem; }

.market-funds-subnav {
	display: flex;
	flex: 0 0 auto;
	gap: 0.55rem;
	padding: 0.22rem;
	border: 1px solid color-mix(in srgb, var(--market-accent) 18%, var(--market-border));
	border-radius: 0.58rem;
	box-shadow: 0 0.35rem 1rem color-mix(in srgb, var(--market-text) 9%, transparent), inset 0 1px 0 color-mix(in srgb, white 62%, transparent);
	background: linear-gradient(180deg, color-mix(in srgb, var(--market-panel-raised) 92%, var(--market-accent-soft)), var(--market-panel));
}

.market-funds-subnav button {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	position: relative;
	overflow: hidden;
	min-height: 44px;
	padding-inline: 0.9rem;
	border: 1px solid color-mix(in srgb, var(--market-accent) 18%, var(--market-border));
	border-radius: 0.42rem;
	box-shadow: 0 0.2rem 0.55rem color-mix(in srgb, var(--market-text) 8%, transparent);
	background: linear-gradient(180deg, var(--market-panel-raised), var(--market-panel));
	font-size: 0.7rem;
	font-weight: 600;
	letter-spacing: 0.01em;
	color: var(--market-text-2);
	transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, color 0.18s ease;
}

.market-funds-subnav button::before {
	content: "";
	position: absolute;
	opacity: 0.32;
	inset: 1px;
	border-radius: inherit;
	background: linear-gradient(115deg, transparent 0 28%, color-mix(in srgb, white 28%, transparent) 48%, transparent 68%);
	pointer-events: none;
}

.market-funds-subnav button:hover {
	border-color: color-mix(in srgb, var(--market-accent) 38%, var(--market-border));
	box-shadow: 0 0.38rem 0.9rem color-mix(in srgb, var(--market-accent) 14%, transparent);
	color: var(--market-text);
	transform: translateY(-1px);
}

.market-funds-subnav button:active {
	transform: translateY(0) scale(0.98);
}

.market-funds-subnav button > .iconify {
	flex: 0 0 auto;
	position: relative;
	padding: 0.18rem;
	border-radius: 0.3rem;
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--market-accent) 14%, transparent);
	background: color-mix(in srgb, var(--market-accent) 8%, var(--market-panel-raised));
	font-size: 1rem;
	z-index: 1;
}

.market-funds-subnav button.active {
	border-color: color-mix(in srgb, var(--market-accent) 78%, white);
	box-shadow: 0 0.55rem 1.35rem color-mix(in srgb, var(--market-accent) 32%, transparent), 0 0 0 0.12rem color-mix(in srgb, var(--market-accent) 22%, transparent), inset 0 1px 0 hsl(0deg 0% 100% / 42%);
	background: linear-gradient(135deg, color-mix(in srgb, var(--market-accent) 76%, white), var(--market-accent));
	text-shadow: 0 1px 1px hsl(220deg 75% 22% / 30%);
	color: white;
	transform: translateY(-1px);
}

.market-funds-subnav button.active:hover {
	box-shadow: 0 0.7rem 1.55rem color-mix(in srgb, var(--market-accent) 38%, transparent), 0 0 0 0.14rem color-mix(in srgb, var(--market-accent) 26%, transparent), inset 0 1px 0 hsl(0deg 0% 100% / 48%);
	color: white;
	transform: translateY(-2px);
}

.market-funds-subnav button.active > .iconify {
	box-shadow: inset 0 0 0 1px hsl(0deg 0% 100% / 24%), 0 0 0 0.12rem hsl(0deg 0% 100% / 10%);
	background: hsl(0deg 0% 100% / 14%);
	color: white;
}

.market-kind-switch {
	display: flex;
	padding: 0.16rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-panel-2);
}

.market-kind-switch button {
	min-height: 40px;
	padding-inline: 0.65rem;
	border-radius: 0.25rem;
	font-size: 0.66rem;
	color: var(--market-text-2);
}

.market-kind-switch button.active {
	background: var(--market-accent-soft);
	color: var(--market-accent-strong);
}

.market-refresh.compact {
	min-height: 40px;
	padding-inline: 0.6rem;
}

.market-flow-loading { margin: 0.8rem; }

.market-table-scroll {
	overflow-x: auto;
	width: calc(100% - 1.6rem);
	max-width: calc(100% - 1.6rem);
	margin: 0.55rem 0.8rem 0.7rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-panel);
	overscroll-behavior-inline: contain;
}

.market-flow-table {
	width: 100%;
	min-width: 69rem;
	border-collapse: collapse;
	font-variant-numeric: tabular-nums;
}

.market-flow-table th,
.market-flow-table td {
	padding: 0.55rem 0.62rem;
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

.market-flow-sort {
	display: inline-flex;
	align-items: center;
	justify-content: flex-end;
	gap: 0.25rem;
	min-height: 32px;
	margin: -0.35rem -0.35rem -0.35rem 0;
	padding: 0.35rem;
	font: inherit;
	letter-spacing: inherit;
	color: inherit;
}

.market-flow-sort:hover,
.market-flow-sort:focus-visible {
	color: var(--market-accent-strong);
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

.market-flow-streak-cell { min-width: 7rem; }

.market-flow-streak[data-direction="inflow"] { color: var(--market-up); }
.market-flow-streak[data-direction="outflow"] { color: var(--market-down); }
.market-flow-streak[data-direction="neutral"] { color: var(--market-text-3); }

.market-flow-week-cell { min-width: 7.2rem; }

.market-flow-week-range {
	font-family: var(--font-monospace);
	letter-spacing: 0.01em;
}

.market-flow-week-progress {
	font-family: var(--font-monospace);
	color: var(--market-warning);
}

.market-flow-week-progress[data-complete="true"] { color: var(--market-text-3); }

.market-flow-footer {
	display: flex;
	justify-content: space-between;
	gap: 0.6rem;
	padding: 0.55rem 0.7rem;
	border-top: 1px solid var(--market-border);
	font: 0.56rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-flow-pagination {
	align-items: center;
}

.market-flow-pagination > div {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.3rem;
}

.market-flow-pagination button {
	min-height: 36px;
	padding-inline: 0.55rem;
	border: 1px solid var(--market-border);
	border-radius: 0.28rem;
	color: var(--market-text-2);
}

.market-flow-pagination button:disabled {
	opacity: 0.35;
	cursor: not-allowed;
}

.market-flow-pagination b {
	min-width: 6.6rem;
	text-align: center;
	color: var(--market-text);
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
	border-left: 2px solid var(--market-accent);
	background: var(--market-accent-soft);
}

.market-stage-notice > .iconify {
	margin-top: 0.1rem;
	color: var(--market-accent);
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
	color: var(--market-accent);
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

.market-strategy-view {
	min-width: 0;
}

.market-financial-header > b[data-tone="live"] { color: var(--market-down); }
.market-financial-header > b[data-tone="warning"] { color: var(--market-up); }

.market-financial-summary {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 1px;
	margin: 0.8rem 0.8rem 0;
	border: 1px solid var(--market-border);
	background: var(--market-border);
}

.market-financial-summary > div {
	display: grid;
	align-content: center;
	gap: 0.18rem;
	min-height: 5.15rem;
	padding: 0.72rem 0.8rem;
	background: var(--market-panel);
}

.market-financial-summary span,
.market-financial-filters label > span,
.market-financial-mobile-metrics span {
	font: 0.56rem var(--font-monospace);
	letter-spacing: 0.04em;
	color: var(--market-text-3);
}

.market-financial-summary strong,
.market-financial-summary a {
	overflow: hidden;
	min-width: 0;
	font: 700 0.86rem var(--font-monospace);
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--market-text);
}

.market-financial-summary a {
	text-decoration: none;
	color: var(--market-accent);
}

.market-financial-summary small {
	font: 0.56rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-financial-filters {
	display: grid;
	grid-template-columns: repeat(4, minmax(8rem, 1fr));
	gap: 0.55rem;
	margin: 0.65rem 0.8rem 0;
	padding: 0.75rem;
	border: 1px solid var(--market-border);
	background: var(--market-panel-soft);
}

.market-financial-filters label {
	display: grid;
	align-content: end;
	gap: 0.32rem;
	min-width: 0;
}

.market-financial-filters input,
.market-financial-filters select,
.market-financial-actions button {
	min-height: 44px;
	border: 1px solid var(--market-border);
	border-radius: 0.3rem;
	background: var(--market-panel);
	color: var(--market-text);
}

.market-financial-filters input,
.market-financial-filters select {
	width: 100%;
	min-width: 0;
	padding: 0 0.65rem;
	font: 0.68rem var(--font-monospace);
}

.market-financial-filters input:focus-visible,
.market-financial-filters select:focus-visible,
.market-financial-actions button:focus-visible {
	outline: 2px solid var(--market-focus);
	outline-offset: 2px;
}

.market-financial-number {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	border: 1px solid var(--market-border);
	border-radius: 0.3rem;
	background: var(--market-panel);
}

.market-financial-number input {
	border: 0;
	background: transparent;
}

.market-financial-number em {
	padding-right: 0.65rem;
	font: normal 0.65rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-financial-search {
	grid-column: span 2;
}

.market-financial-actions {
	display: grid;
	grid-column: span 2;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	align-items: end;
	gap: 0.45rem;
}

.market-financial-actions button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.35rem;
	padding: 0 0.7rem;
	font-size: 0.66rem;
	cursor: pointer;
}

.market-financial-actions button.primary {
	border-color: color-mix(in srgb, var(--market-accent) 55%, var(--market-border));
	background: var(--market-accent-soft);
	color: var(--market-accent);
}

.market-financial-actions button:disabled {
	opacity: 0.48;
	cursor: not-allowed;
}

.market-financial-rule {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.38rem;
	margin: 0.55rem 0.8rem 0;
	font-size: 0.6rem;
	color: var(--market-text-3);
}

.market-financial-rule b {
	color: var(--market-accent);
}

.market-financial-rule span {
	padding-left: 0.42rem;
	border-left: 1px solid var(--market-border);
}

.market-financial-state {
	margin: 0.7rem 0.8rem;
}

.market-financial-warning {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	margin: 0.65rem 0.8rem 0;
	padding: 0.55rem 0.65rem;
	border-left: 2px solid var(--market-up);
	background: var(--market-up-soft);
	font-size: 0.62rem;
	line-height: 1.5;
	color: var(--market-text-2);
}

.market-financial-result-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	margin: 0.75rem 0.8rem 0.38rem;
}

.market-financial-result-head > div {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
}

.market-financial-result-head strong { font-size: 0.76rem; }

.market-financial-result-head span,
.market-financial-result-head small {
	font-size: 0.58rem;
	color: var(--market-text-3);
}

.market-financial-desktop {
	overflow-x: auto;
	margin: 0 0.8rem 0.8rem;
	border: 1px solid var(--market-border);
}

.market-financial-desktop table {
	width: 100%;
	min-width: 64rem;
	border-collapse: collapse;
}

.market-financial-desktop th,
.market-financial-desktop td {
	padding: 0.62rem 0.72rem;
	border-bottom: 1px solid var(--market-border);
	vertical-align: middle;
	text-align: left;
}

.market-financial-desktop th {
	position: sticky;
	top: 0;
	background: var(--market-panel-soft);
	font: 600 0.56rem var(--font-monospace);
	letter-spacing: 0.03em;
	color: var(--market-text-3);
	z-index: 1;
}

.market-financial-desktop tbody tr:last-child td { border-bottom: 0; }
.market-financial-desktop tbody tr:hover { background: var(--market-panel-soft); }

.market-financial-desktop td {
	font-size: 0.66rem;
	color: var(--market-text-2);
}

.market-financial-desktop td strong,
.market-financial-desktop td small {
	display: block;
}

.market-financial-desktop td strong {
	font: 700 0.7rem var(--font-monospace);
	font-variant-numeric: tabular-nums;
	color: var(--market-text);
}

.market-financial-desktop td small {
	margin-top: 0.18rem;
	font: 0.54rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-financial-desktop td.financial-positive strong {
	color: var(--market-accent);
}

.market-financial-mobile { display: none; }

.market-financial-mobile article {
	padding: 0.75rem;
	border: 1px solid var(--market-border);
	background: var(--market-panel);
}

.market-financial-mobile article > header,
.market-financial-mobile article > footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.6rem;
}

.market-financial-mobile article > header > div {
	display: grid;
	gap: 0.14rem;
	min-width: 0;
}

.market-financial-mobile article > header strong {
	font-size: 0.76rem;
}

.market-financial-mobile article > header span,
.market-financial-mobile article > footer {
	font: 0.54rem var(--font-monospace);
	color: var(--market-text-3);
}

.market-financial-mobile article > header b {
	font: 700 0.78rem var(--font-monospace);
	color: var(--market-accent);
}

.market-financial-mobile-metrics {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 1px;
	margin: 0.65rem 0;
	background: var(--market-border);
}

.market-financial-mobile-metrics > div {
	display: grid;
	gap: 0.16rem;
	min-width: 0;
	padding: 0.55rem;
	background: var(--market-panel-soft);
}

.market-financial-mobile-metrics strong {
	font: 700 0.68rem var(--font-monospace);
	font-variant-numeric: tabular-nums;
	color: var(--market-text);
}

.market-financial-mobile-metrics small {
	overflow: hidden;
	font: 0.5rem var(--font-monospace);
	white-space: nowrap;
	text-overflow: ellipsis;
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
	color: var(--market-accent);
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
.market-watch-edit textarea:focus { border-color: var(--market-accent); }

.market-watchlist-add > button,
.market-watch-edit button,
.market-watch-actions button {
	min-height: 2.75rem;
	padding: 0.45rem 0.65rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.3rem;
	font-size: 0.62rem;
	color: var(--market-accent-strong);
}

.market-watchlist-add > button {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.3rem;
	background: var(--market-accent-soft);
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
.market-watchlist-summary strong { color: var(--market-accent-strong); }

.live-dot, .stale-dot, .unavailable-dot {
	width: 0.45rem;
	height: 0.45rem;
	border-radius: 50%;
}
.live-dot { background: var(--market-down); }
.stale-dot { background: var(--market-accent); }
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
	background: var(--market-accent-soft);
	color: var(--market-accent-strong);
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
	background: var(--market-accent);
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
	border-color: color-mix(in srgb, var(--market-down) 46%, transparent);
	background: var(--market-down-soft);
	color: var(--market-down);
}

.market-watch-status[data-tone="stale"] {
	border-color: var(--market-border-strong);
	background: var(--market-accent-soft);
	color: var(--market-accent-strong);
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
	color: var(--market-accent);
}

.market-watchlist-side > section > header h3 {
	margin: 0.18rem 0 0;
	font-size: 0.76rem;
}

.market-watchlist-side > section > header b {
	font: 0.56rem var(--font-monospace);
	color: var(--market-accent-strong);
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
	color: var(--market-accent);
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
.market-watchlist-discipline .iconify { color: var(--market-accent); }

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
	.market-capability-grid > .market-capability:first-child { grid-column: 1 / -1; }
	.market-main-grid { grid-template-columns: minmax(0, 1fr); }
	.market-side-stack { grid-template-columns: minmax(0, 1fr); }
}

.market-finance-link {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	min-height: 44px;
	padding: 0 0.72rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.32rem;
	font: 700 0.64rem/1 var(--font-monospace);
	color: var(--market-accent-strong);
}

.market-finance-metrics {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 1px;
	margin: 0.8rem;
	border: 1px solid var(--market-border);
	background: var(--market-border);
}

.market-finance-metrics > div {
	display: grid;
	gap: 0.3rem;
	padding: 0.78rem;
	background: var(--market-panel);
}

.market-finance-metrics span {
	font: 0.56rem/1.2 var(--font-monospace);
	color: var(--market-text-3);
}

.market-finance-metrics strong {
	font: 700 1rem/1 var(--font-monospace);
	color: var(--market-accent-strong);
}

.market-finance-highlights {
	display: grid;
	gap: 0.55rem;
	padding: 0 0.8rem 0.8rem;
}

.market-finance-highlights article {
	display: grid;
	gap: 0.4rem;
	padding: 0.75rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-panel-soft);
}

.market-finance-highlights article.important {
	border-color: color-mix(in srgb, var(--market-up) 58%, var(--market-border));
	box-shadow: inset 3px 0 0 var(--market-up);
	background: linear-gradient(90deg, var(--market-up-soft), var(--market-panel-soft) 32%);
}

.market-finance-highlights article.important h3,
.market-finance-highlights article.important time {
	color: var(--market-up);
}

.market-finance-highlights header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.35rem;
	font: 0.56rem/1.3 var(--font-monospace);
	color: var(--market-text-3);
}

.market-finance-highlights header b {
	padding: 0.16rem 0.3rem;
	border: 1px solid color-mix(in srgb, var(--market-up) 48%, transparent);
	border-radius: 0.22rem;
	background: var(--market-up-soft);
	color: var(--market-up);
}

.market-finance-highlights h3 {
	margin: 0;
	font-size: 0.78rem;
	line-height: 1.6;
}

.market-finance-highlights p,
.market-finance-highlights footer {
	margin: 0;
	font-size: 0.62rem;
	line-height: 1.65;
	color: var(--market-text-2);
}

.market-finance-highlights footer {
	font-family: var(--font-monospace);
	color: var(--market-text-3);
}

.market-finance-stream {
	overflow-y: auto;
	max-height: 48rem;
	scrollbar-width: thin;
}

.market-finance-sources {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem 0.7rem;
}

.market-finance-sources a {
	color: var(--market-accent-strong);
}

.market-futures-previous {
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	gap: 0.45rem 0.7rem;
	overflow-x: auto;
	margin: 0.4rem 0 0.55rem;
	padding: 0.45rem 0.55rem;
	border: 1px solid var(--market-border);
	border-radius: 0.32rem;
	font: 0.62rem/1.45 var(--font-monospace);
	white-space: nowrap;
	color: var(--market-text-2);
	scrollbar-width: thin;
}

.market-futures-previous b.is-up { color: var(--market-up); }
.market-futures-previous b.is-down { color: var(--market-down); }

.market-funds-toolbar {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 0.8rem 0;
}

.market-funds-primary,
.market-funds-meta {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	min-width: 0;
}

.market-funds-primary label {
	display: flex;
	flex: 1 1 22rem;
	align-items: center;
	gap: 0.45rem;
	min-width: 0;
	min-height: 40px;
	padding: 0 0.65rem;
	border: 1px solid var(--market-border);
	border-radius: 0.35rem;
	background: var(--market-panel-2);
	color: var(--market-text-3);
}

.market-funds-toolbar input {
	width: 100%;
	min-width: 0;
	border: 0;
	outline: 0;
	background: transparent;
	font-size: 0.68rem;
	color: var(--market-text);
}

.market-funds-meta { justify-content: flex-end; }

.market-funds-meta > b {
	padding: 0.25rem 0.42rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.28rem;
	font: 700 0.56rem/1.2 var(--font-monospace);
	color: var(--market-accent-strong);
}

.market-funds-meta > span {
	font: 0.56rem/1.35 var(--font-monospace);
	white-space: nowrap;
	color: var(--market-text-3);
}

.market-data-freshness {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.3rem 0.6rem;
	margin: 0.45rem 0.8rem 0;
	padding: 0.42rem 0.55rem;
	border: 1px solid color-mix(in srgb, var(--market-accent) 20%, var(--market-border));
	border-radius: 0.35rem;
	background: color-mix(in srgb, var(--market-accent-soft) 42%, var(--market-panel));
	font: 0.56rem/1.4 var(--font-monospace);
	color: var(--market-text-2);
}

.market-data-freshness span {
	display: inline-flex;
	align-items: center;
	gap: 0.28rem;
	white-space: nowrap;
}

.market-data-freshness b {
	font-weight: 700;
	color: var(--market-accent-strong);
}

.market-futures-freshness {
	margin: 0.5rem 0 0;
}

.market-flow-table .market-flow-search-empty td {
	position: static;
	padding: 1.2rem;
	text-align: center;
	color: var(--market-text-3);
}

.market-futures-section {
	margin: 0.55rem 0.8rem 0.7rem;
	padding: 0.7rem;
	border: 1px solid var(--market-border);
	border-radius: 0.45rem;
	background: var(--market-panel-soft);
}

.market-futures-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.market-futures-header > div:first-child > span {
	font: 700 0.54rem/1.2 var(--font-monospace);
	letter-spacing: 0.12em;
	color: var(--market-accent);
}

.market-futures-header h3 {
	margin: 0.22rem 0 0;
	font-size: 1rem;
}

.market-futures-header p {
	max-width: 52rem;
	margin: 0.2rem 0 0;
	font-size: 0.62rem;
	line-height: 1.45;
	color: var(--market-text-2);
}

.market-futures-actions {
	display: flex;
	align-items: center;
	gap: 0.45rem;
}

.market-futures-actions > b {
	padding: 0.25rem 0.42rem;
	border: 1px solid var(--market-border-strong);
	border-radius: 0.28rem;
	font: 700 0.58rem/1.2 var(--font-monospace);
	color: var(--market-accent-strong);
}

.market-futures-tabs {
	display: flex;
	gap: 0.4rem;
	overflow-x: auto;
	padding-block: 0.5rem;
	overscroll-behavior-inline: contain;
}

.market-futures-tabs button {
	flex: 0 0 auto;
	min-height: 44px;
	padding-inline: 0.75rem;
	border: 1px solid var(--market-border);
	border-radius: 0.32rem;
	font-size: 0.64rem;
	color: var(--market-text-2);
}

.market-futures-tabs button.active {
	border-color: var(--market-border-strong);
	background: var(--market-accent-soft);
	color: var(--market-accent-strong);
}

.market-futures-metrics {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 1px;
	margin-bottom: 0.55rem;
	border: 1px solid var(--market-border);
	background: var(--market-border);
}

.market-futures-metrics > div {
	display: grid;
	gap: 0.22rem;
	padding: 0.55rem 0.6rem;
	background: var(--market-panel);
}

.market-futures-metrics span {
	font: 0.56rem/1.3 var(--font-monospace);
	color: var(--market-text-3);
}

.market-futures-metrics strong {
	font: 700 0.8rem/1.3 var(--font-monospace);
	font-variant-numeric: tabular-nums;
}

.market-futures-footnote {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	margin-top: 0.45rem;
	font: 0.56rem/1.5 var(--font-monospace);
	color: var(--market-text-3);
}

.market-futures-footnote a {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	min-height: 44px;
	color: var(--market-accent-strong);
}

.market-futures-disclaimer {
	margin: 0.1rem 0 0;
	padding-top: 0.5rem;
	border-top: 1px dashed var(--market-border);
	font-size: 0.58rem;
	line-height: 1.5;
	color: var(--market-text-3);
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
		gap: 0.35rem;
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
	.market-title-row h1 { font-size: clamp(1.75rem, 9vw, 2.25rem); }
	.market-title-block > p:last-child { margin-top: 0.5rem; }
	.market-build { display: none; }

	.market-clock,
	.market-connection {
		min-height: 2.85rem;
		padding: 0.45rem 0.55rem;
	}

	.market-discipline-bar {
		gap: 0.9rem;
		overflow-x: auto;
		padding-inline: 0.25rem;
		white-space: nowrap;
		scrollbar-width: none;
	}

	.market-discipline-bar::-webkit-scrollbar { display: none; }

	.market-discipline-bar > div,
	.market-discipline-bar > a { flex: 0 0 auto; }
	.market-discipline-bar > a { margin-left: 0; }

	.market-workspaces {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		margin-inline: -0.1rem;
		padding: 0.1rem;
		border: 0;
		background: transparent;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}

	.market-workspaces::-webkit-scrollbar { display: none; }

	.market-workspaces button {
		flex: 0 0 5.9rem;
		justify-content: flex-start;
		min-height: 3rem;
		border: 1px solid var(--market-border);
		border-radius: 0.4rem;
		scroll-snap-align: start;
	}

	.market-workspaces small { display: none; }

	.market-workspace-heading {
		align-items: center;
		padding-top: 0.75rem;
	}

	.market-capability-grid {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.2rem;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}

	.market-capability-grid::-webkit-scrollbar { display: none; }

	.market-capability {
		flex: 0 0 min(88vw, 22rem);
		min-height: auto;
		scroll-snap-align: start;
	}

	.market-capability-grid > .market-capability:first-child { grid-column: auto; }

	.market-index-quote strong { font-size: 0.92rem; }

	.market-index-quote b,
	.market-breadth-quote strong { font-size: 0.68rem; }
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
	.market-finance-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }

	.market-finance-link {
		align-self: stretch;
		justify-content: center;
	}

	.market-finance-filters {
		flex-wrap: nowrap;
		overflow-x: auto;
		padding-bottom: 0.15rem;
		scrollbar-width: none;
	}

	.market-finance-filters::-webkit-scrollbar { display: none; }
	.market-finance-filters button { flex: 0 0 auto; }

	.market-finance-highlights { padding-inline: 0.55rem; }
	.market-finance-highlights article { padding: 0.7rem; }

	.market-funds-header {
		gap: 0.5rem;
		padding: 0.55rem;
	}

	.market-funds-title p {
		margin-top: 0.08rem;
		line-height: 1.4;
	}

	.market-funds-subnav {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		width: 100%;
		padding: 0.28rem;
	}

	.market-funds-subnav button {
		justify-content: center;
		min-height: 48px;
		padding-inline: 0.65rem;
	}

	.market-funds-toolbar {
		grid-template-columns: minmax(0, 1fr);
		gap: 0.4rem;
		padding: 0.45rem 0.55rem 0;
	}

	.market-funds-primary {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.4rem;
	}

	.market-kind-switch button {
		min-height: 40px;
		padding-inline: 0.55rem;
	}

	.market-funds-primary label {
		min-height: 40px;
		padding-inline: 0.55rem;
	}

	.market-funds-meta {
		justify-content: space-between;
		gap: 0.35rem;
	}

	.market-funds-meta > span { font-size: 0.52rem; }

	.market-data-freshness {
		gap: 0.28rem 0.5rem;
		margin: 0.4rem 0.55rem 0;
		padding: 0.42rem 0.48rem;
	}

	.market-futures-freshness {
		margin-inline: 0;
	}

	.market-table-scroll {
		width: calc(100% - 1.1rem);
		max-width: calc(100% - 1.1rem);
		margin: 0.4rem 0.55rem 0.55rem;
	}

	.market-flow-table { min-width: 61rem; }

	.market-flow-table th,
	.market-flow-table td { padding: 0.46rem 0.5rem; }

	.market-flow-week-cell { min-width: 6.6rem; }

	.market-flow-week-range,
	.market-flow-week-progress { font-size: 0.48rem; }

	.market-flow-pagination {
		flex-direction: column;
		align-items: stretch;
		gap: 0.35rem;
	}

	.market-flow-pagination > span:first-child { display: none; }

	.market-flow-pagination > div {
		justify-content: flex-start;
		overflow-x: auto;
	}

	.market-futures-section {
		margin: 0.45rem 0.55rem 0.55rem;
		padding: 0.55rem;
	}

	.market-futures-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 0.45rem;
	}

	.market-futures-header p { font-size: 0.56rem; }

	.market-futures-actions {
		justify-content: flex-end;
		width: auto;
	}

	.market-futures-tabs { padding-block: 0.42rem; }

	.market-futures-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }

	.market-futures-metrics > div { padding: 0.48rem 0.42rem; }
	.market-futures-metrics strong { font-size: 0.7rem; }

	.market-futures-footnote {
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.55rem;
	}

	.market-financial-summary {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-inline: 0.55rem;
	}

	.market-financial-filters {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-inline: 0.55rem;
		padding: 0.6rem;
	}

	.market-financial-search,
	.market-financial-actions { grid-column: span 2; }

	.market-financial-rule,
	.market-financial-warning,
	.market-financial-result-head,
	.market-financial-state {
		margin-inline: 0.55rem;
	}

	.market-financial-result-head {
		align-items: flex-start;
		gap: 0.45rem;
	}

	.market-financial-result-head small { text-align: right; }
	.market-financial-desktop { display: none; }

	.market-financial-mobile {
		display: grid;
		gap: 0.5rem;
		margin: 0 0.55rem 0.7rem;
	}

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
	.market-status-cluster { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.market-workspaces button { justify-content: flex-start; }
	.market-panel-header { align-items: flex-start; }
	.market-important-switch { margin-left: auto; }
	.market-error { grid-template-columns: auto minmax(0, 1fr); }

	.market-error button {
		grid-column: 2;
		justify-self: start;
	}
	.market-flow-grid { grid-template-columns: minmax(0, 1fr); }
	.market-financial-summary { grid-template-columns: minmax(0, 1fr); }
	.market-financial-filters { grid-template-columns: minmax(0, 1fr); }

	.market-financial-search,
	.market-financial-actions { grid-column: auto; }
	.market-financial-mobile-metrics { grid-template-columns: minmax(0, 1fr); }
	.market-financial-result-head { flex-direction: column; }
	.market-financial-result-head small { text-align: left; }
}

@media (prefers-reduced-transparency: reduce) {
	.market-terminal {
		background: var(--market-bg);
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
