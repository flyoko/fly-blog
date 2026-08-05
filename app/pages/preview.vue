<script setup lang="ts">
const appConfig = useAppConfig()
useSeoMeta({
	title: '预览',
	description: `${appConfig.title}的文章预览。`,
})
const { data: listRaw } = await useAsyncData('previews:index', () => getArticleIndexOptions('previews/%'), { default: () => [] })
const { listSorted, isAscending, sortOrder, setAscending, setSortOrder } = useArticleSort(listRaw)
const { category, categories, listCategorized, setCategory } = useCategory(listSorted)
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" />
</div>

<div class="preview">
	<div class="preview-header">
		<h1>
			<UtilLink class="mobile-only" to="/" title="返回首页">
				<Icon name="tabler:chevron-left" />
			</UtilLink>预览
		</h1>
		<PostOrderToggle
			:is-ascending="isAscending"
			:sort-order="sortOrder"
			:category="category"
			:categories
			@update:is-ascending="setAscending"
			@update:sort-order="setSortOrder"
			@update:category="setCategory"
		/>
	</div>
	<p>勇敢的人探索世界。这里是一些还未发布的文章。</p>

	<div v-if="!listCategorized.length" class="preview-empty card">
		<Icon name="tabler:file-pencil" aria-hidden="true" />
		<div>
			<strong>暂时没有待预览文章</strong>
			<span>新草稿保存后，会在这里集中出现。</span>
		</div>
		<NuxtLink to="/admin/articles/new">
			开始写作
		</NuxtLink>
	</div>

	<menu v-else class="proper-height">
		<PostArticle
			v-for="article in listCategorized"
			:key="article.path"
			v-bind="article"
			:to="article.path"
			:use-updated="sortOrder === 'updated'"
		/>
	</menu>
</div>
</template>

<style lang="scss" scoped>
.preview {
	margin: 1rem;
}

.preview-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;

	h1 {
		mask-image: linear-gradient(#FFF, transparent);
	}
}

.preview-empty {
	display: grid;
	grid-template-columns: auto 1fr auto;
	align-items: center;
	gap: 0.9rem;
	min-height: 11rem;
	margin-top: 1.25rem;
	padding: 1.25rem;

	> .iconify {
		font-size: 2rem;
		color: var(--c-primary);
	}

	div {
		display: grid;
		gap: 0.25rem;
	}

	strong {
		color: var(--c-text-1);
	}

	span {
		font-size: 0.82rem;
		color: var(--c-text-2);
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target);
		padding: 0.65rem 0.85rem;
		border-radius: 999px;
		background: var(--c-primary);
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--c-bg-1);
	}
}

@media (max-width: $breakpoint-phone) {
	.preview {
		margin: 0.75rem;
	}

	.preview-header {
		flex-direction: column;
		align-items: flex-start;
	}

	.preview-empty {
		grid-template-columns: auto 1fr;
		min-height: 10rem;

		a {
			grid-column: 1 / -1;
			justify-content: center;
		}
	}
}
</style>
