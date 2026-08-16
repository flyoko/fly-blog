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
<BlogMask
	:show="layoutStore.state === 'sidebar'"
	class="sidebar-mask mobile-only"
	@click="layoutStore.close()"
/>

<!-- 不能用 Transition 实现弹出收起动画，因为半宽屏状态始终显示 -->
<aside id="blog-sidebar" :class="{ show: layoutStore.state === 'sidebar' }">
	<BlogNavBrand class="sidebar-header" to="/" />

	<nav class="sidebar-nav scrollcheck-y" aria-label="主导航">
		<button v-if="searchEnabled" class="search-btn sidebar-nav-item gradient-card" type="button" aria-label="搜索站内内容" @click="layoutStore.toggle('search')">
			<Icon name="tabler:search" />
			<span class="nav-text">{{ debouncedSelection || searchStore.word || '搜索' }}</span>
			<Key class="keycut" code="K" cmd prevent @press="layoutStore.toggle('search')" />
		</button>

		<template v-for="(group, groupIndex) in appConfig.nav" :key="groupIndex">
			<h3 v-if="group.title">
				{{ group.title }}
			</h3>

			<menu>
				<li v-for="(item, itemIndex) in group.items" :key="itemIndex">
					<UtilLink :to="item.url" class="sidebar-nav-item">
						<Icon :name="item.icon" />
						<span class="nav-text">{{ item.text }}</span>
						<Icon v-if="isExtLink(item.url)" class="external-tip" name="tabler:arrow-up-right" />
					</UtilLink>
				</li>
			</menu>
		</template>
	</nav>

	<footer class="sidebar-footer">
		<BlogThemeToggle />
		<ZIconNavList :list="appConfig.footer.iconNav" />
	</footer>
</aside>
</template>

<style lang="scss" scoped>
#blog-sidebar {
	display: flex;
	flex-direction: column;
	color: var(--c-text-2);

	&:hover {
		color: currentcolor;
	}

	@media not (max-width: $breakpoint-widescreen) {
		display: none;
	}

	@media (max-width: $breakpoint-mobile) {
		position: fixed;
		visibility: hidden;
		inset-inline-start: 0;
		width: min(20rem, calc(100vw - 3rem));
		height: 100dvh;
		max-width: calc(100vw - 3rem);
		padding-bottom: var(--mobile-safe-bottom);
		box-shadow: inset -1px 0 0 var(--c-surface-line);
		background:
			linear-gradient(145deg, color-mix(in srgb, var(--c-surface-highlight) 38%, transparent), transparent 42%),
			color-mix(in srgb, var(--c-bg-1) 97%, var(--c-flow-blue) 3%);
		backdrop-filter: none;
		color: currentcolor;
		transform: var(--transform-start-far);
		transition:
			transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
			visibility 0s linear 0.24s;
		pointer-events: none;
		z-index: calc(var(--z-index-popover) + 5);

		&.show {
			visibility: visible;
			box-shadow: 18px 0 48px var(--c-surface-shadow), inset -1px 0 0 var(--c-surface-line);
			transform: none;
			transition-delay: 0s;
			pointer-events: auto;
		}
	}
}

.sidebar-header {
	margin: 0.7rem 0.75rem 0.25rem;
	padding: 0.62rem 0.7rem;
	border: 1px solid var(--c-surface-line);
	border-radius: 0.9rem;
	box-shadow: inset 0 1px 0 var(--c-surface-highlight);
	background:
		linear-gradient(145deg, color-mix(in srgb, var(--c-surface-highlight) 42%, transparent), transparent 46%),
		color-mix(in srgb, var(--c-surface-fill) 94%, transparent);
}

.sidebar-mask {
	z-index: calc(var(--z-index-popover) + 4);
}

.sidebar-nav {
	flex-grow: 1;
	padding: 0 5%;
	font-size: 0.9em;

	h3 {
		margin: 2em 0 1em 1em;
		font: inherit;
		color: var(--c-text-2);
	}

	li {
		margin: 0.5em 0;
	}
}

.sidebar-nav-item {
	display: flex;
	align-items: center;
	gap: 0.65em;
	padding: 0.58em 0.85em;
	border: 1px solid transparent;
	border-radius: 0.625rem;
	transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s, color 0.2s, transform 0.2s;

	&:hover {
		border-color: var(--c-surface-line);
		box-shadow: inset 0 1px 0 var(--c-surface-highlight);
		background-color: var(--c-surface-fill);
		color: var(--c-text);
		transform: translateX(1px);
	}

	&.router-link-active {
		border-color: var(--c-surface-line);
		border-inline-start-color: var(--c-primary);
		box-shadow: inset 0 1px 0 var(--c-surface-highlight);
		background-color: var(--c-primary-soft);
		color: var(--c-text);
	}

	> .iconify {
		font-size: 1.35em;
	}

	> .nav-text {
		flex-grow: 1;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	> .external-tip {
		opacity: 0.5;
		font-size: 1em;
	}
}

.search-btn {
	margin: 1rem 0;
	border-color: var(--c-surface-line);
	box-shadow: inset 0 1px 0 var(--c-surface-highlight);
	background-color: var(--c-surface-fill);
	color: var(--c-text-2);
	cursor: text;
	user-select: none;

	&:hover {
		border-color: var(--c-surface-border);
		background-color: var(--c-surface-fill);
		color: var(--c-text);
		transform: none;
	}
}

.sidebar-footer {
	--gap: clamp(0.5rem, 3vh, 1rem);

	display: grid;
	gap: var(--gap);
	padding: var(--gap);
	font-size: 0.8em;
	text-align: center;
	color: var(--c-text-2);
}

@media (prefers-reduced-transparency: reduce) {
	#blog-sidebar {
		background-color: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	#blog-sidebar,
	.sidebar-nav-item {
		transition: none;
	}
}
</style>
