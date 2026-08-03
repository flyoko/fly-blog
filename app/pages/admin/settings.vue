<script setup lang="ts">
import type { WeatherCity } from '#shared/admin/weather'
import type { AdminConfigKind } from '~/types/admin'
import footerSource from '~~/config/site/footer.json'
import modulesSource from '~~/config/site/modules.json'
import navigationSource from '~~/config/site/navigation.json'
import weatherSource from '~~/config/site/weather.json'
import categoriesSource from '~~/config/taxonomy/categories.json'
import {
	categoriesConfigSchema,
	footerConfigSchema,
	modulesConfigSchema,
	navigationConfigSchema,
	weatherConfigSchema,
} from '#shared/admin/site-config'
import { buildConfigPullRequest } from '~/types/admin'

interface PullRequestResult {
	pullRequestNumber: number
	pullRequestUrl: string
	branch: string
	resourcePath: string
}

const tabs: Array<{ kind: AdminConfigKind, label: string, description: string }> = [
	{ kind: 'categories', label: '分类', description: '文章分类名称、图标和颜色。' },
	{ kind: 'navigation', label: '导航', description: '公开博客左侧导航结构。' },
	{ kind: 'footer', label: '页脚', description: '社交、主题和源码入口开关。' },
	{ kind: 'modules', label: '模块', description: '公开模块的显示状态与顺序。' },
	{ kind: 'weather', label: '天气', description: '搜索并选择站长固定城市，不读取访客定位。' },
]

const selected = ref<AdminConfigKind>('categories')
const categories = ref(categoriesConfigSchema.parse(structuredClone(categoriesSource) as unknown))
const weather = reactive(weatherConfigSchema.parse(structuredClone(weatherSource) as unknown))
const rawConfigs = reactive<Record<string, string>>({
	navigation: JSON.stringify(navigationSource, null, 2),
	footer: JSON.stringify(footerSource, null, 2),
	modules: JSON.stringify(modulesSource, null, 2),
})
const saving = ref(false)
const error = ref<string | null>(null)
const result = ref<PullRequestResult | null>(null)
const cityQuery = ref('')
const cityResults = ref<WeatherCity[]>([])
const citySearching = ref(false)
const citySearchError = ref<string | null>(null)

useSeoMeta({ title: '站点设置', robots: 'noindex, nofollow' })

function addCategory() {
	categories.value.push({ name: '新分类', icon: 'tabler:folder', color: '#5f9ea0' })
}

function removeCategory(index: number) {
	categories.value.splice(index, 1)
}

async function searchCities() {
	citySearching.value = true
	citySearchError.value = null
	cityResults.value = []
	try {
		const result = await useAdminApi<{ items: WeatherCity[] }>('/api/admin/weather/search', {
			query: { query: cityQuery.value },
		})
		cityResults.value = result.items
		if (!result.items.length)
			citySearchError.value = '没有找到匹配城市，请尝试更完整的名称。'
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
	if (selected.value === 'categories')
		return categoriesConfigSchema.parse(categories.value)
	if (selected.value === 'weather')
		return weatherConfigSchema.parse(weather)
	const raw = rawConfigs[selected.value] as string | undefined
	if (typeof raw !== 'string')
		throw new Error('当前配置暂不可编辑')
	const parsed = JSON.parse(raw)
	if (selected.value === 'navigation')
		return navigationConfigSchema.parse(parsed)
	if (selected.value === 'footer')
		return footerConfigSchema.parse(parsed)
	if (selected.value === 'modules')
		return modulesConfigSchema.parse(parsed)
	throw new Error('当前配置暂不可编辑')
}

async function createPullRequest() {
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
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '配置 Pull Request 创建失败'
	}
	finally {
		saving.value = false
	}
}
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">高影响配置</span>
			<h1>站点设置</h1>
			<p>这些修改不会直接写入生产分支，而是创建 Pull Request 并等待预览和检查。</p>
		</div>
		<button class="admin-button admin-button-primary" type="button" :disabled="saving" @click="createPullRequest">
			<Icon name="tabler:git-pull-request" />
			{{ saving ? '正在创建…' : '创建配置 PR' }}
		</button>
	</header>

	<p v-if="error" class="admin-error">
		{{ error }}
	</p>
	<div v-if="result" class="admin-success admin-pr-result">
		<div>
			<strong>Pull Request #{{ result.pullRequestNumber }} 已创建</strong>
			<span>{{ result.resourcePath }} · {{ result.branch }}</span>
		</div>
		<a class="admin-button" :href="result.pullRequestUrl" target="_blank" rel="noopener">查看 PR</a>
	</div>

	<div class="admin-settings-layout">
		<nav class="admin-settings-nav" aria-label="设置分类">
			<button
				v-for="tab in tabs"
				:key="tab.kind"
				class="admin-settings-nav-item"
				:class="{ 'is-active': selected === tab.kind }"
				type="button"
				@click="selected = tab.kind"
			>
				<strong>{{ tab.label }}</strong>
				<span>{{ tab.description }}</span>
			</button>
		</nav>

		<section class="admin-panel admin-settings-editor">
			<header class="admin-panel-header">
				<div>
					<h2>{{ tabs.find(tab => tab.kind === selected)?.label }}</h2>
					<p>{{ tabs.find(tab => tab.kind === selected)?.description }}</p>
				</div>
			</header>

			<div v-if="selected === 'categories'" class="admin-category-editor">
				<div v-for="(category, index) in categories" :key="`${category.name}-${index}`" class="admin-category-row">
					<label class="admin-field"><span>名称</span><input v-model="category.name" type="text"></label>
					<label class="admin-field"><span>图标</span><input v-model="category.icon" type="text"></label>
					<label class="admin-field"><span>颜色</span><input v-model="category.color" type="text"></label>
					<button class="admin-icon-button" type="button" aria-label="删除分类" @click="removeCategory(index)">
						<Icon name="tabler:trash" />
					</button>
				</div>
				<button class="admin-button" type="button" @click="addCategory">
					<Icon name="tabler:plus" />
					添加分类
				</button>
			</div>

			<div v-else-if="selected === 'weather'" class="admin-weather-editor">
				<label class="admin-weather-toggle">
					<input v-model="weather.enabled" type="checkbox">
					<div><strong>启用城市天气</strong><span>公开博客只展示这个固定城市，不请求访客定位。</span></div>
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

			<label v-else class="admin-field admin-field-grow">
				<span>结构化 JSON</span>
				<textarea v-model="rawConfigs[selected]" class="admin-json-editor" spellcheck="false" />
			</label>
		</section>
	</div>
</section>
</template>

<style scoped lang="scss">
.admin-weather-editor {
	display: grid;
	gap: 1rem;
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

.admin-weather-results {
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
	text-align: start;
	color: inherit;
	cursor: pointer;
}

.admin-weather-results button:hover,
.admin-weather-results button:focus-visible {
	border-color: var(--admin-accent);
}

.admin-weather-selected {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.admin-weather-selected > div {
	display: grid;
	gap: 0.25rem;
	padding: 0.8rem;
	border-radius: 0.8rem;
	background: var(--admin-surface-soft);
}

@media (max-width: 720px) {
	.admin-weather-search {
		flex-direction: column;
		align-items: stretch;
	}

	.admin-weather-results,
	.admin-weather-selected {
		grid-template-columns: 1fr;
	}
}
</style>
