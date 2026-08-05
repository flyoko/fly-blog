<script setup lang="ts">
import { orderBy } from 'es-toolkit/array'
import { isModuleEnabled } from '#shared/admin/modules'
import { isArticleHeaderAdDisplayable } from '~/utils/article-ads'

const appConfig = useAppConfig()
const articlesEnabled = isModuleEnabled(appConfig.featureModules, 'articles')
const homeAds = computed(() => appConfig.article.headerAds.filter(isArticleHeaderAdDisplayable))
useSeoMeta({
	description: appConfig.description,
	ogImage: appConfig.author.avatar,
})

const { data: listRaw } = await useAsyncData('posts:index', async () => articlesEnabled ? await getArticleIndexOptions() : [], { default: () => [] })
const { listSorted, isAscending, sortOrder, setAscending, setSortOrder } = useArticleSort(listRaw, { bindDirectionQuery: 'asc', bindOrderQuery: 'sort' })
const { category, categories, listCategorized, setCategory } = useCategory(listSorted, { bindQuery: 'category' })
const { page, totalPages, listPaged, setPage } = usePagination(listCategorized, { bindQuery: 'page' })

watch(category, () => {
	page.value = 1
})

useSeoMeta({ title: () => (page.value > 1 ? `第${page.value}页` : '') })

const listRecommended = computed(() => orderBy(
	listRaw.value.filter(item => item.recommend !== null),
	['recommend', 'date'],
	['desc'],
))

const { data: previewCount } = useAsyncData(
	'previews:count',
	() => queryCollection('content').where('stem', 'LIKE', 'previews/%').count(),
)
</script>

<template>
<div class="home-page">
	<h1 class="visually-hidden">
		{{ appConfig.title }}
	</h1>
	<BlogHeader class="mobile-only" to="/" />

	<UtilHydrateSafe v-if="articlesEnabled">
		<HomeAdCarousel v-if="homeAds.length" :ads="homeAds" />
		<PostSlide v-else-if="listRecommended.length && page === 1 && !category" :list="listRecommended" />

		<div class="post-list">
			<PostOrderToggle
				:is-ascending="isAscending"
				:sort-order="sortOrder"
				:category="category"
				:categories
				enable-ascending
				@update:is-ascending="setAscending"
				@update:sort-order="setSortOrder"
				@update:category="setCategory"
			>
				<ZSecret>
					<UtilLink v-if="previewCount" to="/preview" class="preview-entrance">
						<Icon name="tabler:shield-lock" />
						查看预览文章
					</UtilLink>
				</ZSecret>
			</PostOrderToggle>

			<TransitionGroup tag="div" class="proper-height" name="float-in">
				<PostArticle
					v-for="article, index in listPaged"
					:key="article.path"
					v-bind="article"
					:to="article.path"
					:use-updated="sortOrder === 'updated'"
					:style="getFixedDelay(index * 0.05)"
				/>
			</TransitionGroup>

			<ZPagination :model-value="page" sticky avoid :total-pages="totalPages" @update:model-value="setPage" />
		</div>
	</UtilHydrateSafe>
	<ZError
		v-else
		icon="line-md:document-delete-twotone"
		title="文章模块已停用"
	>
		<p>可从导航访问其他已启用的公开模块。</p>
	</ZError>
</div>
</template>

<style lang="scss" scoped>
.post-list {
	margin: 1rem;

	@media (max-width: $breakpoint-mobile) {
		margin: var(--mobile-page-gutter);
	}
}

.float-in-leave-to {
	position: absolute;
}
</style>
