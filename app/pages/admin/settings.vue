<script setup lang="ts">
import type {
	ArticlePresentationConfig,
	CategoriesConfig,
	FooterConfig,
	NavigationConfig,
	WeatherConfig,
} from '#shared/admin/site-config'
import type { WeatherCity } from '#shared/admin/weather'
import type { AdminConfigKind } from '~/types/admin'
import articleSource from '~~/config/site/article.json'
import footerSource from '~~/config/site/footer.json'
import navigationSource from '~~/config/site/navigation.json'
import weatherSource from '~~/config/site/weather.json'
import categoriesSource from '~~/config/taxonomy/categories.json'
import {
	articlePresentationConfigSchema,
	categoriesConfigSchema,
	footerConfigSchema,
	navigationConfigSchema,
	weatherConfigSchema,
} from '#shared/admin/site-config'
import AdminModuleWorkbench from '~/components/admin/settings/AdminModuleWorkbench.vue'
import { buildConfigPullRequest } from '~/types/admin'

interface PullRequestResult {
	pullRequestNumber: number
	pullRequestUrl: string
	branch: string
	resourcePath: string
}

interface ConfigResult {
	kind: string
	path: string
	sha: string
	content: unknown
}

type SettingsKind = Extract<AdminConfigKind, 'article' | 'categories' | 'navigation' | 'footer' | 'modules' | 'weather'>
type ArticleHeaderAd = ArticlePresentationConfig['headerAds'][number]
type NavigationItem = NavigationConfig[number]['items'][number]
type FooterItem = FooterConfig['iconNav'][number]

const tabs: Array<{ id: SettingsKind, kind: SettingsKind, label: string, description: string, icon: string }> = [
	{ id: 'categories', kind: 'categories', label: '分类', description: '整理文章使用的分类名称、图标和颜色。', icon: 'tabler:category' },
	{ id: 'article', kind: 'article', label: '文章广告', description: '管理文章标题下方的横幅广告与推荐位。', icon: 'tabler:ad' },
	{ id: 'navigation', kind: 'navigation', label: '导航', description: '决定访客在左侧菜单里看到什么。', icon: 'tabler:menu-2' },
	{ id: 'modules', kind: 'modules', label: '首页模块', description: '控制公开模块、显示状态和导航顺序。', icon: 'tabler:layout-grid' },
	{ id: 'weather', kind: 'weather', label: '天气', description: '选择公开展示的固定城市。', icon: 'ri:sun-cloudy-line' },
	{ id: 'footer', kind: 'footer', label: '页脚', description: '维护社交方式、订阅和站点信息。', icon: 'tabler:layout-bottombar' },
]

const selected = ref<SettingsKind>('categories')
const article = ref<ArticlePresentationConfig>(articlePresentationConfigSchema.parse(structuredClone(articleSource) as unknown))
const categories = ref<CategoriesConfig>(categoriesConfigSchema.parse(structuredClone(categoriesSource) as unknown))
const navigation = ref<NavigationConfig>(navigationConfigSchema.parse(structuredClone(navigationSource) as unknown))
const footer = ref<FooterConfig>(footerConfigSchema.parse(structuredClone(footerSource) as unknown))
const weather = reactive<WeatherConfig>(weatherConfigSchema.parse(structuredClone(weatherSource) as unknown))
const saving = ref(false)
const loadingDeployed = ref(false)
const syncedAt = ref<string | null>(null)
const baselineFingerprints = reactive<Record<string, string>>({})
const submittedFingerprints = reactive<Record<string, string>>({})
const error = ref<string | null>(null)
const result = ref<PullRequestResult | null>(null)
const cityQuery = ref('')
const cityResults = ref<WeatherCity[]>([])
const citySearching = ref(false)
const citySearchError = ref<string | null>(null)
const moduleUnsaved = ref(false)

const currentTab = computed(() => tabs.find(tab => tab.kind === selected.value) ?? tabs[0]!)
useSeoMeta({ title: '站点设置', robots: 'noindex, nofollow' })

watch(selected, () => {
	error.value = null
	result.value = null
})

function newConfigId(prefix: string) {
	return `${prefix}-${crypto.randomUUID().slice(0, 8).toLowerCase()}`
}

function addArticleAd() {
	const ad: ArticleHeaderAd = {
		id: newConfigId('article-ad'),
		enabled: false,
		label: '广告',
		title: '',
		description: '',
		image: '',
		href: '',
	}
	article.value.headerAds.push(ad)
}

function addCategory() {
	categories.value.push({ name: '新分类', icon: 'tabler:folder', color: '#5f9ea0' })
}

function removeCategory(index: number) {
	if (categories.value.length > 1)
		categories.value.splice(index, 1)
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
	const target = index + direction
	if (target < 0 || target >= items.length)
		return
	const item = items[index]!
	items[index] = items[target]!
	items[target] = item
}

function addNavigationGroup() {
	navigation.value.push({
		id: newConfigId('nav-group'),
		title: '新分组',
		items: [],
	})
}

function addNavigationItem(groupIndex: number) {
	const item: NavigationItem = {
		id: newConfigId('nav-item'),
		icon: 'tabler:link',
		text: '新入口',
		url: '/',
	}
	navigation.value[groupIndex]?.items.push(item)
}

function addFooterIcon() {
	const item: FooterItem = {
		id: newConfigId('footer-icon'),
		icon: 'tabler:link',
		text: '新快捷入口',
		url: '/',
	}
	footer.value.iconNav.push(item)
}

function addFooterGroup() {
	footer.value.nav.push({
		id: newConfigId('footer-group'),
		title: '新分组',
		items: [],
	})
}

function addFooterLink(groupIndex: number) {
	const item: FooterItem = {
		id: newConfigId('footer-link'),
		icon: 'tabler:link',
		text: '新链接',
		url: '/',
	}
	footer.value.nav[groupIndex]?.items.push(item)
}

async function searchCities() {
	if (cityQuery.value.trim().length < 2) {
		citySearchError.value = '至少输入两个字，再开始搜索。'
		return
	}
	citySearching.value = true
	citySearchError.value = null
	cityResults.value = []
	try {
		const response = await useAdminApi<{ items: WeatherCity[] }>('/api/admin/weather/search', {
			query: { query: cityQuery.value },
		})
		cityResults.value = response.items
		if (!response.items.length)
			citySearchError.value = '没有找到匹配城市，换一个更完整的名称试试。'
	}
	catch (cause) {
		citySearchError.value = cause instanceof Error ? cause.message : '城市搜索失败'
	}
	finally {
		citySearching.value = false
	}
}

function chooseCity(city: WeatherCity) {
	weather.city = [city.name, city.admin1, city.country].filter(Boolean).join(' · ')
	weather.latitude = city.latitude
	weather.longitude = city.longitude
	weather.timezone = city.timezone
	weather.enabled = true
	cityResults.value = []
	cityQuery.value = ''
}

function currentContent() {
	if (selected.value === 'article')
		return articlePresentationConfigSchema.parse(article.value)
	if (selected.value === 'categories')
		return categoriesConfigSchema.parse(categories.value)
	if (selected.value === 'navigation')
		return navigationConfigSchema.parse(navigation.value)
	if (selected.value === 'footer')
		return footerConfigSchema.parse(footer.value)
	if (selected.value === 'weather')
		return weatherConfigSchema.parse(weather)
	throw new Error('模块配置请在“模块管理”中调整。')
}

function contentFor(kind: Exclude<SettingsKind, 'modules'>) {
	if (kind === 'article')
		return article.value
	if (kind === 'categories')
		return categoriesConfigSchema.parse(categories.value)
	if (kind === 'navigation')
		return navigationConfigSchema.parse(navigation.value)
	if (kind === 'footer')
		return footerConfigSchema.parse(footer.value)
	return weatherConfigSchema.parse(weather)
}

function fingerprint(value: unknown) {
	return JSON.stringify(value)
}

const editableKinds = ['article', 'categories', 'navigation', 'footer', 'weather'] as const
const currentFingerprint = computed(() => selected.value === 'modules' ? '' : fingerprint(contentFor(selected.value)))
const selectedChanged = computed(() => selected.value !== 'modules' && Boolean(baselineFingerprints[selected.value]) && baselineFingerprints[selected.value] !== currentFingerprint.value)
const hasUnsavedEditableSettings = computed(() => editableKinds.some((kind) => {
	const current = fingerprint(contentFor(kind))
	return Boolean(baselineFingerprints[kind])
		&& baselineFingerprints[kind] !== current
		&& submittedFingerprints[kind] !== current
}))
const hasUnsavedSettings = computed(() => hasUnsavedEditableSettings.value || moduleUnsaved.value)
const canSubmit = computed(() => selected.value !== 'modules' && (
	selectedChanged.value
	&& submittedFingerprints[selected.value] !== currentFingerprint.value
))

const createButtonLabel = computed(() => {
	if (!selectedChanged.value)
		return '没有改动'
	if (selected.value !== 'modules' && submittedFingerprints[selected.value] === currentFingerprint.value)
		return '这版已提交'
	return ({ article: '保存文章展示并预览', categories: '保存分类并预览', navigation: '保存导航并预览', footer: '保存页脚并预览', weather: '保存天气并预览', modules: '由模块工作台保存' })[selected.value]
})
const taskStatus = computed(() => {
	if (loadingDeployed.value)
		return '正在读取线上配置…'
	if (saving.value)
		return '正在生成预览…'
	if (hasUnsavedSettings.value)
		return '存在未保存的站点设置'
	if (syncedAt.value)
		return `已读取线上配置 · ${syncedAt.value}`
	return '正在使用页面内置配置'
})
const taskTone = computed(() => error.value ? 'danger' : hasUnsavedSettings.value ? 'warning' : 'positive')

useAdminUnsavedChanges(hasUnsavedSettings)

async function loadDeployedConfigs() {
	loadingDeployed.value = true
	error.value = null
	result.value = null
	try {
		const [articleConfig, categoryConfig, navigationConfig, footerConfig, weatherConfig] = await Promise.all([
			useAdminApi<ConfigResult>('/api/admin/publishing/configs/article'),
			useAdminApi<ConfigResult>('/api/admin/publishing/configs/categories'),
			useAdminApi<ConfigResult>('/api/admin/publishing/configs/navigation'),
			useAdminApi<ConfigResult>('/api/admin/publishing/configs/footer'),
			useAdminApi<ConfigResult>('/api/admin/publishing/configs/weather'),
		])
		article.value = articlePresentationConfigSchema.parse(articleConfig.content)
		categories.value = categoriesConfigSchema.parse(categoryConfig.content)
		navigation.value = navigationConfigSchema.parse(navigationConfig.content)
		footer.value = footerConfigSchema.parse(footerConfig.content)
		Object.assign(weather, weatherConfigSchema.parse(weatherConfig.content))
		for (const kind of ['article', 'categories', 'navigation', 'footer', 'weather'] as const)
			baselineFingerprints[kind] = fingerprint(contentFor(kind))
		Object.keys(submittedFingerprints).forEach(key => delete submittedFingerprints[key])
		syncedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '线上配置读取失败，当前保留页面内置配置。'
	}
	finally {
		loadingDeployed.value = false
	}
}

function reloadDeployedConfigs() {
	if (hasUnsavedEditableSettings.value) {
		// eslint-disable-next-line no-alert -- replacing local edits requires explicit synchronous confirmation
		const confirmed = window.confirm('当前站点设置还有未保存的改动，重新读取会覆盖这些改动。确定继续吗？')
		if (!confirmed)
			return
	}
	void loadDeployedConfigs()
}

async function createPullRequest() {
	if (!canSubmit.value || selected.value === 'modules')
		return
	saving.value = true
	error.value = null
	result.value = null
	try {
		const payload = buildConfigPullRequest(
			selected.value,
			currentContent(),
			`config-${selected.value}-${crypto.randomUUID()}`,
		)
		result.value = await useAdminApi('/api/admin/publishing/pull-requests', {
			method: 'POST',
			body: payload,
		})
		submittedFingerprints[selected.value] = currentFingerprint.value
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '配置 Pull Request 创建失败'
	}
	finally {
		saving.value = false
	}
}

onMounted(loadDeployedConfigs)
</script>

<template>
<section>
	<AdminTaskHeader
		eyebrow="公开站点"
		title="站点设置"
		description="用可视化表单管理分类、文章广告、导航、首页模块、天气和页脚。保存后先生成预览，不会直接影响线上。"
		:status="taskStatus"
		:status-tone="taskTone"
	>
		<template #actions>
			<button v-if="selected !== 'modules'" class="admin-button" type="button" :disabled="loadingDeployed" @click="reloadDeployedConfigs">
				<Icon name="tabler:refresh" />{{ loadingDeployed ? '读取中…' : '重新读取线上配置' }}
			</button>
			<button v-if="selected !== 'modules'" class="admin-button admin-button-primary" type="button" :disabled="saving || loadingDeployed || !canSubmit" @click="createPullRequest">
				<Icon name="tabler:eye-check" />{{ saving ? '正在生成…' : createButtonLabel }}
			</button>
		</template>
	</AdminTaskHeader>

	<p v-if="error" class="admin-error" role="alert">
		{{ error }}
	</p>
	<div v-if="result" class="admin-success admin-pr-result">
		<div>
			<strong>预览任务已创建</strong>
			<span>自动检查通过后，可在发布与审核中查看预览并确认上线。</span>
		</div>
		<NuxtLink class="admin-button" to="/admin/reviews">
			前往发布与审核
		</NuxtLink>
	</div>
	<AdminAdvancedDetails v-if="result" title="发布技术详情">
		<div class="admin-settings-technical-grid">
			<div><span>Pull Request</span><code>#{{ result.pullRequestNumber }}</code></div>
			<div><span>配置路径</span><code>{{ result.resourcePath }}</code></div>
			<div><span>分支</span><code>{{ result.branch }}</code></div>
		</div>
		<a class="admin-button" :href="result.pullRequestUrl" target="_blank" rel="noopener">在 GitHub 查看</a>
	</AdminAdvancedDetails>

	<AdminSectionTabs v-model="selected" :tabs="tabs" label="站点设置分区" />

	<div class="admin-settings-layout admin-settings-layout-single">
		<section class="admin-panel admin-settings-editor" :class="{ 'is-module-workbench': selected === 'modules' }">
			<header v-if="selected !== 'modules'" class="admin-panel-header">
				<div>
					<h2>{{ currentTab.label }}</h2>
					<p>{{ currentTab.description }}</p>
				</div>
			</header>

			<div v-if="selected === 'article'" class="admin-visual-config admin-article-ads-editor">
				<div class="admin-config-intro">
					<div><Icon name="tabler:ad" /><span><strong>文章头部横幅</strong><small>展示在文章标题和摘要之间；关闭或配置不完整时前台不占位。</small></span></div>
					<button class="admin-button" type="button" :disabled="article.headerAds.length >= 8" @click="addArticleAd">
						<Icon name="tabler:plus" />添加广告
					</button>
				</div>
				<p v-if="!article.headerAds.length" class="admin-muted-copy admin-article-ads-empty">
					当前没有文章广告。前台不会保留空白区域。
				</p>
				<section v-for="(ad, adIndex) in article.headerAds" :key="ad.id" class="admin-config-group admin-article-ad-card">
					<header>
						<label class="admin-switch-row admin-article-ad-toggle">
							<input v-model="ad.enabled" type="checkbox">
							<span><strong>启用这条广告</strong><small>{{ ad.enabled ? '将进入前台轮播' : '仅保留配置，不公开展示' }}</small></span>
						</label>
						<div class="admin-config-order">
							<button class="admin-icon-button" type="button" aria-label="上移广告" :disabled="adIndex === 0" @click="move(article.headerAds, adIndex, -1)">
								<Icon name="tabler:arrow-up" />
							</button>
							<button class="admin-icon-button" type="button" aria-label="下移广告" :disabled="adIndex === article.headerAds.length - 1" @click="move(article.headerAds, adIndex, 1)">
								<Icon name="tabler:arrow-down" />
							</button>
							<button class="admin-icon-button" type="button" aria-label="删除广告" @click="article.headerAds.splice(adIndex, 1)">
								<Icon name="tabler:trash" />
							</button>
						</div>
					</header>
					<div class="admin-article-ad-grid">
						<label class="admin-field"><span>广告标题</span><input v-model="ad.title" type="text" maxlength="120" placeholder="例如：本月推荐服务"></label>
						<label class="admin-field"><span>广告链接</span><input v-model="ad.href" type="text" maxlength="2000" placeholder="https://example.com 或 /about"></label>
						<label class="admin-field"><span>角标文字</span><input v-model="ad.label" type="text" maxlength="24" placeholder="广告"></label>
						<label class="admin-field"><span>横幅图片</span><input v-model="ad.image" type="text" maxlength="2000" placeholder="图片 URL，可留空"></label>
						<label class="admin-field admin-article-ad-description"><span>广告说明</span><textarea v-model="ad.description" rows="3" maxlength="320" placeholder="简短说明推荐内容" /></label>
					</div>
					<div class="admin-article-ad-preview" :class="{ 'has-image': ad.image }">
						<img v-if="ad.image" :src="ad.image" alt="" loading="lazy">
						<div><small>{{ ad.label || '广告' }}</small><strong>{{ ad.title || '广告标题预览' }}</strong><span>{{ ad.description || '填写说明后会在这里显示。' }}</span></div>
						<Icon name="tabler:arrow-up-right" />
					</div>
				</section>
			</div>

			<div v-else-if="selected === 'categories'" class="admin-category-editor">
				<div v-for="(category, index) in categories" :key="`${category.name}-${index}`" class="admin-category-row">
					<label class="admin-field"><span>名称</span><input v-model="category.name" type="text"></label>
					<label class="admin-field"><span>图标</span><input v-model="category.icon" type="text"></label>
					<label class="admin-field"><span>颜色</span><input v-model="category.color" type="text"></label>
					<button class="admin-icon-button" type="button" aria-label="删除分类" :disabled="categories.length <= 1" @click="removeCategory(index)">
						<Icon name="tabler:trash" />
					</button>
				</div>
				<button class="admin-button" type="button" @click="addCategory">
					<Icon name="tabler:plus" />
					添加分类
				</button>
			</div>

			<div v-else-if="selected === 'navigation'" class="admin-visual-config">
				<div class="admin-config-intro">
					<div><Icon name="tabler:route" /><span><strong>导航菜单</strong><small>按访客浏览网站时的顺序排列。</small></span></div>
					<button class="admin-button" type="button" @click="addNavigationGroup">
						<Icon name="tabler:plus" />添加分组
					</button>
				</div>
				<section v-for="(group, groupIndex) in navigation" :key="group.id" class="admin-config-group">
					<header>
						<label class="admin-field"><span>分组标题</span><input v-model="group.title" type="text" placeholder="主导航可留空"></label>
						<div class="admin-config-order">
							<button class="admin-icon-button" type="button" aria-label="上移导航分组" :disabled="groupIndex === 0" @click="move(navigation, groupIndex, -1)">
								<Icon name="tabler:arrow-up" />
							</button>
							<button class="admin-icon-button" type="button" aria-label="下移导航分组" :disabled="groupIndex === navigation.length - 1" @click="move(navigation, groupIndex, 1)">
								<Icon name="tabler:arrow-down" />
							</button>
							<button class="admin-icon-button" type="button" aria-label="删除导航分组" :disabled="navigation.length <= 1" @click="navigation.splice(groupIndex, 1)">
								<Icon name="tabler:trash" />
							</button>
						</div>
					</header>
					<div class="admin-config-items">
						<article v-for="(item, itemIndex) in group.items" :key="item.id" class="admin-config-item">
							<div class="admin-config-item-icon">
								<Icon :name="item.icon" />
							</div>
							<label class="admin-field"><span>显示文字</span><input v-model="item.text" type="text"></label>
							<label class="admin-field"><span>链接地址</span><input v-model="item.url" type="text"></label>
							<label class="admin-field"><span>图标</span><input v-model="item.icon" type="text"></label>
							<div class="admin-config-order">
								<button class="admin-icon-button" type="button" aria-label="上移导航项" :disabled="itemIndex === 0" @click="move(group.items, itemIndex, -1)">
									<Icon name="tabler:arrow-up" />
								</button>
								<button class="admin-icon-button" type="button" aria-label="下移导航项" :disabled="itemIndex === group.items.length - 1" @click="move(group.items, itemIndex, 1)">
									<Icon name="tabler:arrow-down" />
								</button>
								<button class="admin-icon-button" type="button" aria-label="删除导航项" @click="group.items.splice(itemIndex, 1)">
									<Icon name="tabler:trash" />
								</button>
							</div>
						</article>
					</div>
					<button class="admin-button" type="button" @click="addNavigationItem(groupIndex)">
						<Icon name="tabler:plus" />添加导航项
					</button>
				</section>
			</div>

			<div v-else-if="selected === 'footer'" class="admin-visual-config">
				<div class="admin-config-intro">
					<div><Icon name="tabler:layout-bottombar" /><span><strong>页脚内容</strong><small>维护访客能找到的联系方式和站点入口。</small></span></div>
				</div>
				<div class="admin-config-switches">
					<label class="admin-switch-row"><input v-model="footer.showPersonalGitHub" type="checkbox"><span><strong>显示个人 GitHub</strong><small>保留个人主页快捷入口</small></span></label>
					<label class="admin-switch-row"><input v-model="footer.showThemeSource" type="checkbox"><span><strong>显示主题来源</strong><small>在信息分组展示主题仓库</small></span></label>
					<label class="admin-switch-row"><input v-model="footer.showSiteSource" type="checkbox"><span><strong>显示本站源码</strong><small>在信息分组展示博客仓库</small></span></label>
				</div>

				<section class="admin-config-group">
					<header><div><strong>侧栏快捷入口</strong><small>显示在主题切换按钮下方。</small></div></header>
					<div class="admin-config-items">
						<article v-for="(item, itemIndex) in footer.iconNav" :key="item.id" class="admin-config-item">
							<div class="admin-config-item-icon">
								<Icon :name="item.icon" />
							</div>
							<label class="admin-field"><span>显示文字</span><input v-model="item.text" type="text"></label>
							<label class="admin-field"><span>链接地址</span><input v-model="item.url" type="text"></label>
							<label class="admin-field"><span>图标</span><input v-model="item.icon" type="text"></label>
							<div class="admin-config-order">
								<button class="admin-icon-button" type="button" aria-label="上移快捷入口" :disabled="itemIndex === 0" @click="move(footer.iconNav, itemIndex, -1)">
									<Icon name="tabler:arrow-up" />
								</button>
								<button class="admin-icon-button" type="button" aria-label="下移快捷入口" :disabled="itemIndex === footer.iconNav.length - 1" @click="move(footer.iconNav, itemIndex, 1)">
									<Icon name="tabler:arrow-down" />
								</button>
								<button class="admin-icon-button" type="button" aria-label="删除快捷入口" @click="footer.iconNav.splice(itemIndex, 1)">
									<Icon name="tabler:trash" />
								</button>
							</div>
						</article>
					</div>
					<button class="admin-button" type="button" @click="addFooterIcon">
						<Icon name="tabler:plus" />添加快捷入口
					</button>
				</section>

				<div class="admin-config-intro admin-config-intro-compact">
					<div><span><strong>页脚分组</strong><small>每个分组可以放订阅、社交或其他链接。</small></span></div>
					<button class="admin-button" type="button" @click="addFooterGroup">
						<Icon name="tabler:plus" />添加分组
					</button>
				</div>
				<section v-for="(group, groupIndex) in footer.nav" :key="group.id" class="admin-config-group">
					<header>
						<label class="admin-field"><span>分组标题</span><input v-model="group.title" type="text"></label>
						<div class="admin-config-order">
							<button class="admin-icon-button" type="button" aria-label="上移页脚分组" :disabled="groupIndex === 0" @click="move(footer.nav, groupIndex, -1)">
								<Icon name="tabler:arrow-up" />
							</button>
							<button class="admin-icon-button" type="button" aria-label="下移页脚分组" :disabled="groupIndex === footer.nav.length - 1" @click="move(footer.nav, groupIndex, 1)">
								<Icon name="tabler:arrow-down" />
							</button>
							<button class="admin-icon-button" type="button" aria-label="删除页脚分组" @click="footer.nav.splice(groupIndex, 1)">
								<Icon name="tabler:trash" />
							</button>
						</div>
					</header>
					<div class="admin-config-items">
						<article v-for="(item, itemIndex) in group.items" :key="item.id" class="admin-config-item">
							<div class="admin-config-item-icon">
								<Icon :name="item.icon" />
							</div>
							<label class="admin-field"><span>显示文字</span><input v-model="item.text" type="text"></label>
							<label class="admin-field"><span>链接地址</span><input v-model="item.url" type="text"></label>
							<label class="admin-field"><span>图标</span><input v-model="item.icon" type="text"></label>
							<div class="admin-config-order">
								<button class="admin-icon-button" type="button" aria-label="上移页脚链接" :disabled="itemIndex === 0" @click="move(group.items, itemIndex, -1)">
									<Icon name="tabler:arrow-up" />
								</button>
								<button class="admin-icon-button" type="button" aria-label="下移页脚链接" :disabled="itemIndex === group.items.length - 1" @click="move(group.items, itemIndex, 1)">
									<Icon name="tabler:arrow-down" />
								</button>
								<button class="admin-icon-button" type="button" aria-label="删除页脚链接" @click="group.items.splice(itemIndex, 1)">
									<Icon name="tabler:trash" />
								</button>
							</div>
						</article>
					</div>
					<button class="admin-button" type="button" @click="addFooterLink(groupIndex)">
						<Icon name="tabler:plus" />添加页脚链接
					</button>
				</section>
			</div>

			<div v-else-if="selected === 'weather'" class="admin-weather-editor">
				<label class="admin-weather-toggle">
					<input v-model="weather.enabled" type="checkbox">
					<div><strong>启用城市天气</strong><span>公开博客只展示这个固定城市，不读取访客定位。</span></div>
				</label>

				<form class="admin-weather-search" @submit.prevent="searchCities">
					<label class="admin-field admin-field-grow">
						<span>搜索城市</span>
						<input v-model="cityQuery" type="search" placeholder="例如：杭州、Seattle" minlength="2" maxlength="100">
					</label>
					<button class="admin-button" type="submit" :disabled="citySearching">
						<Icon name="tabler:map-search" />
						{{ citySearching ? '搜索中…' : '搜索' }}
					</button>
				</form>
				<p v-if="citySearchError" class="admin-error">
					{{ citySearchError }}
				</p>
				<div v-if="cityResults.length" class="admin-weather-results">
					<button v-for="city in cityResults" :key="city.id" type="button" @click="chooseCity(city)">
						<strong>{{ city.name }}</strong>
						<span>{{ [city.admin1, city.country].filter(Boolean).join(' · ') }}</span>
						<small>{{ city.latitude.toFixed(4) }}, {{ city.longitude.toFixed(4) }} · {{ city.timezone }}</small>
					</button>
				</div>

				<div class="admin-weather-selected">
					<div><span>当前城市</span><strong>{{ weather.city || '尚未选择' }}</strong></div>
					<div><span>经纬度</span><strong>{{ weather.latitude ?? '—' }}, {{ weather.longitude ?? '—' }}</strong></div>
					<div><span>时区</span><strong>{{ weather.timezone }}</strong></div>
					<div><span>数据源</span><strong>Open-Meteo</strong></div>
				</div>
			</div>

			<AdminModuleWorkbench
				v-show="selected === 'modules'"
				:aria-hidden="selected !== 'modules'"
				:inert="selected !== 'modules'"
				embedded
				:active="selected === 'modules'"
				@dirty-change="moduleUnsaved = $event"
			/>
		</section>
	</div>
</section>
</template>

<style scoped lang="scss">
.admin-settings-nav-item {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: start;
	gap: 0.65rem;
}

.admin-settings-nav-item > .iconify {
	margin-top: 0.1rem;
	font-size: 1.05rem;
}

.admin-settings-nav-item small {
	display: block;
	margin-top: 0.28rem;
	font-size: 0.65rem;
	font-weight: 400;
	line-height: 1.5;
}

.admin-visual-config,
.admin-config-items,
.admin-weather-editor {
	display: grid;
	gap: 1rem;
}

.admin-config-intro,
.admin-config-group > header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.admin-config-intro > div,
.admin-config-group > header > div:first-child {
	display: flex;
	align-items: center;
	gap: 0.65rem;
}

.admin-config-intro strong,
.admin-config-intro small,
.admin-config-group header strong,
.admin-config-group header small {
	display: block;
}

.admin-config-intro small,
.admin-config-group header small {
	margin-top: 0.2rem;
	font-size: 0.7rem;
	color: var(--admin-muted);
}

.admin-config-intro-compact {
	margin-top: 0.5rem;
}

.admin-config-group {
	display: grid;
	gap: 0.85rem;
	padding: 1rem;
	border: 1px solid var(--admin-border);
	border-radius: 1rem;
	background: var(--admin-surface-soft);
}

.admin-config-group > header > .admin-field {
	flex: 1;
	margin: 0;
}

.admin-article-ads-empty {
	padding: 2.5rem 1rem;
	border: 1px dashed var(--admin-border);
	border-radius: 1rem;
	text-align: center;
}

.admin-article-ad-toggle {
	margin: 0;
}

.admin-article-ad-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.admin-article-ad-grid .admin-field {
	margin: 0;
}

.admin-article-ad-description {
	grid-column: 1 / -1;
}

.admin-article-ad-preview {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: stretch;
	position: relative;
	overflow: hidden;
	min-height: 8rem;
	border: 1px solid color-mix(in srgb, var(--admin-accent) 32%, var(--admin-border));
	border-radius: 1rem;
	background:
		radial-gradient(circle at 88% 12%, var(--admin-accent-soft), transparent 42%),
		var(--admin-surface);
}

.admin-article-ad-preview.has-image {
	grid-template-columns: minmax(0, 1fr) minmax(10rem, 34%);
}

.admin-article-ad-preview > div {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: center;
	gap: 0.4rem;
	min-width: 0;
	padding: 1.1rem 3.2rem 1.1rem 1.2rem;
}

.admin-article-ad-preview small {
	padding: 0.15rem 0.45rem;
	border-radius: 999px;
	background: var(--admin-accent-soft);
	font-size: 0.62rem;
	font-weight: 700;
	color: var(--admin-accent-strong);
}

.admin-article-ad-preview strong,
.admin-article-ad-preview span {
	display: block;
}

.admin-article-ad-preview strong {
	font-family: "Noto Serif SC", serif;
	font-size: 1.05rem;
}

.admin-article-ad-preview span {
	font-size: 0.75rem;
	line-height: 1.6;
	color: var(--admin-muted);
}

.admin-article-ad-preview img {
	grid-column: 2;
	grid-row: 1;
	width: 100%;
	height: 100%;
	min-height: 8rem;
	object-fit: cover;
}

.admin-article-ad-preview > .iconify {
	position: absolute;
	inset-inline-end: 1rem;
	top: 50%;
	font-size: 1.2rem;
	color: var(--admin-accent-strong);
	transform: translateY(-50%);
}

.admin-config-item {
	display: grid;
	grid-template-columns: auto minmax(7rem, 0.8fr) minmax(10rem, 1.4fr) minmax(8rem, 1fr) auto;
	align-items: end;
	gap: 0.65rem;
	padding: 0.8rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.85rem;
	background: var(--admin-surface);
}

.admin-config-item .admin-field {
	margin: 0;
}

.admin-config-item-icon {
	display: grid;
	place-items: center;
	width: 2.7rem;
	height: 2.7rem;
	border-radius: 0.75rem;
	background: var(--admin-accent-soft);
	font-size: 1.15rem;
	color: var(--admin-accent-strong);
}

.admin-config-order {
	display: flex;
	gap: 0.3rem;
}

.admin-config-order .admin-icon-button {
	width: 2.25rem;
	height: 2.25rem;
}

.admin-config-switches {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.65rem;
}

.admin-config-switches .admin-switch-row {
	margin: 0;
}

.admin-settings-guidance {
	display: grid;
	place-items: center;
	min-height: 28rem;
	text-align: center;
}

.admin-settings-guidance-icon {
	display: grid;
	place-items: center;
	width: 4rem;
	height: 4rem;
	border-radius: 1.2rem;
	background: var(--admin-accent-soft);
	font-size: 2rem;
	color: var(--admin-accent-strong);
}

.admin-settings-guidance h2 {
	margin: 1rem 0 0;
	font-family: "Noto Serif SC", serif;
}

.admin-settings-guidance p {
	max-width: 34rem;
	margin: 0.65rem 0 1.2rem;
	font-size: 0.82rem;
	line-height: 1.7;
	color: var(--admin-muted);
}

.admin-weather-toggle {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
	padding: 1rem;
	border-radius: 1rem;
	background: var(--admin-surface-soft);
}

.admin-weather-toggle div {
	display: grid;
	gap: 0.25rem;
}

.admin-weather-toggle span,
.admin-weather-results span,
.admin-weather-results small,
.admin-weather-selected span {
	font-size: 0.75rem;
	color: var(--admin-muted);
}

.admin-weather-search {
	display: flex;
	align-items: end;
	gap: 0.75rem;
}

.admin-weather-results,
.admin-weather-selected {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.6rem;
}

.admin-weather-results button {
	display: grid;
	gap: 0.2rem;
	padding: 0.8rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.8rem;
	background: var(--admin-surface);
	font: inherit;
	text-align: start;
	color: inherit;
	cursor: pointer;
}

.admin-weather-results button:hover,
.admin-weather-results button:focus-visible {
	border-color: var(--admin-accent);
}

.admin-weather-selected > div {
	display: grid;
	gap: 0.25rem;
	padding: 0.8rem;
	border-radius: 0.8rem;
	background: var(--admin-surface-soft);
}

@media (max-width: 1180px) {
	.admin-config-item {
		grid-template-columns: auto 1fr 1.4fr;
	}

	.admin-config-item > :nth-child(4) {
		grid-column: 2 / 3;
	}
}

@media (max-width: 760px) {
	.admin-config-intro,
	.admin-config-group > header,
	.admin-weather-search {
		flex-direction: column;
		align-items: stretch;
	}

	.admin-config-item,
	.admin-config-switches,
	.admin-weather-results,
	.admin-weather-selected,
	.admin-article-ad-grid,
	.admin-article-ad-preview.has-image {
		grid-template-columns: 1fr;
	}

	.admin-article-ad-description {
		grid-column: auto;
	}

	.admin-article-ad-preview img {
		grid-column: 1;
		grid-row: 1;
		max-height: 10rem;
	}

	.admin-article-ad-preview > div {
		grid-row: 2;
	}

	.admin-config-item-icon {
		display: none;
	}

	.admin-config-item > :nth-child(4) {
		grid-column: auto;
	}
}
</style>

<style scoped lang="scss">
.admin-config-sync-note {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	margin: -0.5rem 0 1rem;
	font-size: 0.72rem;
	color: var(--admin-muted);
}

.admin-settings-layout-single {
	grid-template-columns: 1fr;
}

.admin-settings-editor.is-module-workbench {
	min-height: auto;
	padding: 0;
	border: 0;
	box-shadow: none;
	background: transparent;
}

.admin-settings-technical-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.65rem;
	margin-bottom: 0.8rem;
}

.admin-settings-technical-grid > div {
	display: grid;
	gap: 0.2rem;
	min-width: 0;
	padding: 0.65rem;
	border-radius: 0.7rem;
	background: var(--admin-surface);
}

.admin-settings-technical-grid span {
	font-size: 0.62rem;
	color: var(--admin-muted);
}

.admin-settings-technical-grid code {
	overflow: hidden;
	font-size: 0.68rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

@media (max-width: 720px) {
	.admin-settings-technical-grid {
		grid-template-columns: 1fr;
	}
}
</style>
