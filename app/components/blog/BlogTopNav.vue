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
		grid-template-columns: clamp(12.75rem, 15vw, 14.25rem) minmax(0, 1fr) max-content;
		align-items: center;
		gap: clamp(0.35rem, 0.65vw, 0.65rem);
		position: sticky;
		top: var(--desktop-shell-gutter, 0.65rem);
		width: 100%;
		min-width: 0;
		min-height: var(--desktop-top-nav-height, 4rem);
		padding: 0.32rem 0.38rem;
		border: 1px solid var(--c-surface-border);
		border-radius: 0.9rem;
		box-shadow:
			0 10px 30px var(--c-surface-shadow),
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
	gap: 0.45rem;
	overflow: hidden;
	width: 100%;
	min-width: 0;
	min-height: 3.2rem;
	margin: 0;
	padding: 0.34rem 3.95rem 0.34rem 0.48rem;
	border-radius: 0.72rem;
	box-shadow:
		0 6px 18px var(--c-surface-shadow),
		inset 0 1px 0 var(--c-surface-highlight);
	line-height: 1.2;

	:deep(.emoji-tail) {
		display: none;
	}

	:deep(.blog-logo-shell) {
		height: 2.25rem;
	}

	:deep(.blog-logo-shell.circle) {
		width: 2.25rem;
	}

	:deep(.blog-text) {
		min-width: 0;
	}

	:deep(.header-title) {
		overflow: hidden;
		font-size: 1rem;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	:deep(.header-subtitle) {
		display: -webkit-box;
		overflow: hidden;
		max-width: 7.4rem;
		margin-top: 0.08rem;
		font-size: 0.62rem;
		-webkit-line-clamp: 2;
		line-height: 1.35;
		-webkit-box-orient: vertical;
	}

	:deep(.is-header .scene-character) {
		right: -0.32rem;
		bottom: -0.66rem;
		width: 4.15rem;
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
	gap: clamp(0.05rem, 0.25vw, 0.25rem);
	min-width: 0;
}

.top-nav-item {
	display: inline-flex;
	align-items: center;
	gap: 0.28rem;
	min-width: 0;
	padding: 0.4rem clamp(0.34rem, 0.5vw, 0.54rem);
	border: 1px solid transparent;
	border-radius: 0.55rem;
	font-size: 0.75rem;
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
		font-size: 0.95rem;
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
	gap: 0.28rem;
	min-width: 0;
}

.top-nav-search {
	display: flex;
	align-items: center;
	gap: 0.34rem;
	height: 2rem;
	max-width: 7.25rem;
	padding: 0 0.52rem;
	border: 1px solid var(--c-surface-line);
	border-radius: 0.58rem;
	background-color: var(--c-surface-fill);
	font-size: 0.72rem;
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
		padding: 0.05rem 0.24rem;
		border: 1px solid var(--c-surface-line);
		border-radius: 0.28rem;
		background-color: var(--c-bg-2);
		font-size: 0.68rem;
		color: var(--c-text-3);
	}
}

.top-nav-external {
	display: flex;
	align-items: center;
	padding-inline-start: 0.18rem;
	border-inline-start: 1px solid var(--c-surface-line);

	:deep(.icon-nav-list) {
		align-items: center;
		gap: 0.05rem;
	}

	:deep(li) {
		display: flex;
		align-items: center;
	}

	:deep(a) {
		display: grid;
		place-items: center;
		padding: 0.32rem;
		border-radius: 0.55rem;
		line-height: 1;
		color: var(--c-text-2);
	}

	:deep(.iconify) {
		font-size: 0.95rem;
	}
}

.top-nav-theme {
	margin: 0;
	padding: 1px;
	border-color: var(--c-surface-line);
	border-radius: 0.68rem;
	background-color: var(--c-surface-fill);

	:deep(button) {
		padding: 0.24rem 0.32rem;
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
		min-height: 3rem;
		padding: 0.3rem 3.45rem 0.3rem 0.42rem;

		:deep(.blog-logo-shell) {
			height: 2.1rem;
		}

		:deep(.blog-logo-shell.circle) {
			width: 2.1rem;
		}

		:deep(.header-title) {
			font-size: 0.9rem;
		}

		:deep(.header-subtitle) {
			max-width: 6.4rem;
			font-size: 0.56rem;
		}

		:deep(.is-header .scene-character) {
			width: 3.7rem;
		}
	}
}

@media (max-width: 1160px) {
	.blog-top-nav {
		grid-template-columns: 11.75rem minmax(0, 1fr) max-content;
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
		width: 2rem;
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
