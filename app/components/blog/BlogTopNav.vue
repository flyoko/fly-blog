<script setup lang="ts">
import { isModuleEnabled } from '#shared/admin/modules'

const appConfig = useAppConfig()
const layoutStore = useLayoutStore()
const searchStore = useSearchStore()
const searchEnabled = computed(() => isModuleEnabled(appConfig.featureModules, 'articles'))

const { text } = useTextSelection()
const debouncedSelection = refDebounced(text)
</script>

<template>
<header class="blog-top-nav" aria-label="桌面导航">
	<BlogHeader class="top-nav-brand" to="/" />

	<nav class="top-nav-links" aria-label="主导航">
		<template v-for="(group, groupIndex) in appConfig.nav" :key="groupIndex">
			<UtilLink
				v-for="(item, itemIndex) in group.items"
				:key="`${groupIndex}-${itemIndex}`"
				:to="item.url"
				class="top-nav-item"
			>
				<Icon :name="item.icon" />
				<span>{{ item.text }}</span>
				<Icon v-if="isExtLink(item.url)" class="external-tip" name="tabler:arrow-up-right" />
			</UtilLink>
		</template>
	</nav>

	<div class="top-nav-actions">
		<button
			v-if="searchEnabled"
			class="top-nav-search"
			type="button"
			aria-label="搜索站内内容"
			@click="layoutStore.toggle('search')"
		>
			<Icon name="tabler:search" />
			<span>{{ debouncedSelection || searchStore.word || '搜索' }}</span>
			<kbd>⌘K</kbd>
		</button>
		<div class="top-nav-external" aria-label="快捷入口">
			<ZIconNavList :list="appConfig.footer.iconNav" />
		</div>
		<BlogThemeToggle class="top-nav-theme" />
	</div>
</header>
</template>

<style lang="scss" scoped>
.blog-top-nav {
	display: none;
}

@media not (max-width: $breakpoint-widescreen) {
	.blog-top-nav {
		display: grid;
		grid-template-columns: clamp(15rem, 18vw, 17rem) minmax(0, 1fr) max-content;
		align-items: center;
		gap: clamp(0.45rem, 0.8vw, 0.85rem);
		position: sticky;
		top: clamp(0.75rem, 1.4vw, 1.25rem);
		width: 100%;
		min-width: 0;
		min-height: 5.45rem;
		padding: 0.42rem 0.5rem;
		border: 1px solid var(--c-surface-border);
		border-radius: 1.1rem;
		box-shadow:
			0 14px 42px var(--c-surface-shadow),
			inset 0 1px 0 var(--c-surface-highlight);
		background:
			linear-gradient(145deg, var(--c-surface-highlight), transparent 38%),
			color-mix(in srgb, var(--c-bg-1) 90%, transparent);
		backdrop-filter: blur(14px) saturate(112%);
		color: var(--c-text-2);
		z-index: 2;
	}
}

.top-nav-brand {
	gap: 0.6rem;
	overflow: hidden;
	width: 100%;
	min-width: 0;
	min-height: 4.6rem;
	margin: 0;
	padding: 0.55rem 4.9rem 0.55rem 0.65rem;
	border-radius: 0.9rem;
	box-shadow:
		0 8px 24px var(--c-surface-shadow),
		inset 0 1px 0 var(--c-surface-highlight);
	line-height: 1.2;

	:deep(.emoji-tail) {
		display: none;
	}

	:deep(.blog-logo-shell) {
		height: 3rem;
	}

	:deep(.blog-logo-shell.circle) {
		width: 3rem;
	}

	:deep(.blog-text) {
		min-width: 0;
	}

	:deep(.header-title) {
		overflow: hidden;
		font-size: 1.15rem;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	:deep(.header-subtitle) {
		display: -webkit-box;
		overflow: hidden;
		max-width: 8.5rem;
		margin-top: 0.18rem;
		font-size: 0.68rem;
		-webkit-line-clamp: 2;
		line-height: 1.35;
		-webkit-box-orient: vertical;
	}

	:deep(.is-header .scene-character) {
		right: -0.45rem;
		bottom: -0.8rem;
		width: 5.15rem;
	}

	:deep(.is-header .scene-rocket) {
		top: 8%;
		right: 31%;
	}
}

.top-nav-links {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: clamp(0.1rem, 0.35vw, 0.4rem);
	min-width: 0;
}

.top-nav-item {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	min-width: 0;
	padding: 0.5rem clamp(0.4rem, 0.6vw, 0.7rem);
	border: 1px solid transparent;
	border-radius: 0.65rem;
	font-size: 0.8rem;
	white-space: nowrap;
	color: var(--c-text-2);
	transition: background-color 0.2s, border-color 0.2s, color 0.2s, transform 0.2s;

	&:hover {
		border-color: var(--c-surface-line);
		background-color: var(--c-surface-fill);
		color: var(--c-text);
		transform: translateY(-1px);
	}

	&.router-link-active {
		border-color: var(--c-surface-line);
		box-shadow: inset 0 -2px 0 var(--c-primary);
		background-color: var(--c-primary-soft);
		color: var(--c-text);
	}

	> .iconify {
		flex: 0 0 auto;
		font-size: 1.05rem;
	}

	> .external-tip {
		opacity: 0.5;
		font-size: 0.8rem;
	}
}

.top-nav-actions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 0.35rem;
	min-width: 0;
}

.top-nav-search {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	height: 2.25rem;
	max-width: 8.5rem;
	padding: 0 0.65rem;
	border: 1px solid var(--c-surface-line);
	border-radius: 0.7rem;
	background-color: var(--c-surface-fill);
	font-size: 0.76rem;
	color: var(--c-text-2);
	transition: border-color 0.2s, color 0.2s;
	cursor: pointer;

	&:hover {
		border-color: var(--c-surface-border);
		color: var(--c-text);
	}

	> span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	> kbd {
		flex: 0 0 auto;
		padding: 0.08rem 0.3rem;
		border: 1px solid var(--c-surface-line);
		border-radius: 0.35rem;
		background-color: var(--c-bg-2);
		font-size: 0.68rem;
		color: var(--c-text-3);
	}
}

.top-nav-external {
	display: flex;
	align-items: center;
	padding-inline-start: 0.22rem;
	border-inline-start: 1px solid var(--c-surface-line);

	:deep(.icon-nav-list) {
		gap: 0.05rem;
	}

	:deep(a) {
		padding: 0.4rem;
		border-radius: 0.65rem;
		color: var(--c-text-2);
	}
}

.top-nav-theme {
	margin: 0;
	padding: 1px;
	border-color: var(--c-surface-line);
	border-radius: 0.8rem;
	background-color: var(--c-surface-fill);

	:deep(button) {
		padding: 0.32rem 0.42rem;
	}
}

@media (max-width: 1320px) {
	.top-nav-item {
		gap: 0.25rem;
		padding-inline: 0.38rem;
		font-size: 0.74rem;

		> .iconify:not(.external-tip) {
			display: none;
		}
	}

	.top-nav-search {
		max-width: 6.25rem;
	}

	.top-nav-external :deep(a) {
		padding: 0.34rem;
	}

	.top-nav-theme :deep(button) {
		padding-inline: 0.34rem;
	}
}

@media (max-width: 1240px) {
	.top-nav-brand {
		min-height: 4.1rem;
		padding: 0.45rem 3.8rem 0.45rem 0.5rem;

		:deep(.blog-logo-shell) {
			height: 2.6rem;
		}

		:deep(.blog-logo-shell.circle) {
			width: 2.6rem;
		}

		:deep(.header-title) {
			font-size: 1rem;
		}

		:deep(.header-subtitle) {
			max-width: 7rem;
			font-size: 0.62rem;
		}

		:deep(.is-header .scene-character) {
			width: 4.45rem;
		}
	}
}

@media (max-width: 1160px) {
	.blog-top-nav {
		grid-template-columns: 13rem minmax(0, 1fr) max-content;
		gap: 0.35rem;
		padding-inline: 0.4rem;
	}

	.top-nav-links {
		gap: 0.05rem;
	}

	.top-nav-item {
		padding-inline: 0.3rem;
		font-size: 0.7rem;
	}

	.top-nav-search {
		justify-content: center;
		width: 2.25rem;
		padding: 0;

		> span,
		> kbd {
			display: none;
		}
	}

	.top-nav-external {
		padding-inline-start: 0.12rem;
	}

	.top-nav-external :deep(a) {
		padding: 0.28rem;
	}

	.top-nav-theme :deep(button) {
		padding-inline: 0.28rem;
	}
}

@media (prefers-reduced-transparency: reduce) {
	.blog-top-nav {
		background-color: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.top-nav-item {
		transition: none;
	}
}
</style>
