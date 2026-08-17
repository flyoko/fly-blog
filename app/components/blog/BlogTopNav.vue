<script setup lang="ts">
import { isModuleEnabled } from '#shared/admin/modules'

const appConfig = useAppConfig()
const layoutStore = useLayoutStore()
const searchStore = useSearchStore()
const searchEnabled = computed(() => isModuleEnabled(appConfig.featureModules, 'articles'))

const { text } = useTextSelection()
const debouncedSelection = refDebounced(text)
const isCondensed = ref(false)
const condenseScrollY = 72
const expandScrollY = 24
let scrollFrame = 0

function syncTopNavState() {
	scrollFrame = 0
	const scrollY = Math.max(0, window.scrollY)

	// Mac trackpads can hover around a single scroll threshold during inertial
	// scrolling. A small hysteresis band prevents the header scene and glass
	// material from mounting/unmounting several times in adjacent frames.
	if (isCondensed.value) {
		if (scrollY < expandScrollY)
			isCondensed.value = false
		return
	}

	if (scrollY > condenseScrollY)
		isCondensed.value = true
}

function scheduleTopNavState() {
	if (!scrollFrame)
		scrollFrame = window.requestAnimationFrame(syncTopNavState)
}

onMounted(() => {
	syncTopNavState()
	window.addEventListener('scroll', scheduleTopNavState, { passive: true })
})

onBeforeUnmount(() => {
	window.removeEventListener('scroll', scheduleTopNavState)
	if (scrollFrame)
		window.cancelAnimationFrame(scrollFrame)
})
</script>

<template>
<header class="blog-top-nav glass-floating" :class="{ 'is-condensed': isCondensed }" aria-label="桌面导航">
	<BlogHeader class="top-nav-brand top-nav-brand-expanded" to="/" :scene="!isCondensed" />

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
		// Keep layout containment but do not paint-contain the sticky compositor.
		// Paint containment + animated descendants is a common source of macOS
		// Chrome/Safari layer invalidation when a sticky bar changes material.
		contain: layout style;
		display: grid;
		grid-template-columns: clamp(13rem, 15vw, 14.5rem) minmax(0, 1fr) max-content;
		align-items: center;
		justify-self: center;
		gap: clamp(0.35rem, 0.65vw, 0.7rem);
		position: sticky;
		top: var(--desktop-shell-gutter, 0.75rem);
		width: var(--desktop-top-nav-width, min(96rem, calc(100vw - 3rem)));
		min-width: 0;
		min-height: var(--desktop-top-nav-height, 4rem);
		max-width: calc(100vw - 2rem);
		padding: 0.3rem 0.48rem;
		border: 1px solid color-mix(in srgb, var(--glass-material-border) 82%, transparent);
		border-radius: 999px;
		box-shadow:
			0 16px 44px color-mix(in srgb, var(--c-surface-shadow) 78%, transparent),
			inset 0 0 0 1px color-mix(in srgb, var(--glass-material-border) 46%, transparent),
			inset 0 1px 0 var(--c-surface-highlight);
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--glass-material-highlight) 76%, transparent), transparent 54%),
			radial-gradient(92% 160% at 10% -34%, var(--glass-material-tint), transparent 58%),
			color-mix(in srgb, var(--glass-material-fill) 96%, var(--c-bg-1) 4%);

		// The visual glass stays gradient-driven. Avoid live backdrop sampling on
		// a sticky surface above the continuously animated fixed atmosphere.
		backdrop-filter: none;
		color: var(--c-text-2);
		transition:
			border-color 0.26s ease,
			box-shadow 0.3s ease,
			background-color 0.26s ease;
		isolation: isolate;
		z-index: 30;
	}

	.blog-top-nav:not(.is-condensed) {
		border-color: transparent;
		box-shadow: none;
		background: color-mix(in srgb, var(--c-bg-1) 7%, transparent);
	}
}

@media (min-width: 1501px) {
	.blog-top-nav:not(.is-condensed) {
		grid-template-columns: 17.5rem minmax(0, 1fr) max-content;
	}
}

.top-nav-brand {
	overflow: hidden;
	width: 100%;
	min-width: 0;
}

// Expanded desktop state deliberately reuses the original BlogHeader component.
// This restores the avatar ring, typography, scan line, orbital scene and the
// same card material that existed before the lightweight NavBrand migration.
.top-nav-brand.top-nav-brand-expanded {
	gap: 0.48rem;
	min-height: 3.45rem;
	margin: 0;
	padding: 0.36rem 4.7rem 0.36rem 0.52rem;
	border-radius: 1rem;
	line-height: 1.2;

	:deep(.emoji-tail) {
		display: none;
	}

	:deep(.blog-logo-shell) {
		height: 2.48rem;
	}

	:deep(.blog-logo-shell.circle) {
		width: 2.48rem;
	}

	:deep(.blog-text) {
		min-width: 0;
	}

	:deep(.header-title) {
		overflow: hidden;
		font-size: 1.08rem;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	:deep(.header-subtitle) {
		display: -webkit-box;
		overflow: hidden;
		max-width: 8rem;
		margin-top: 0.06rem;
		font-size: 0.62rem;
		-webkit-line-clamp: 2;
		line-height: 1.28;
		-webkit-box-orient: vertical;
	}

	:deep(.is-header .scene-character) {
		right: -0.38rem;
		bottom: -0.74rem;
		width: 4.65rem;
	}

	:deep(.is-header .scene-rocket) {
		top: 7%;
		right: 31%;
	}
}

.blog-top-nav.is-condensed .top-nav-brand.top-nav-brand-expanded {
	gap: 0.38rem;
	min-height: 2.5rem;
	padding: 0.2rem 0.42rem;
	border-color: transparent;
	border-radius: 999px;
	box-shadow: none;
	background: transparent;

	:deep(.blog-logo-shell),
	:deep(.blog-logo-shell.circle) {
		width: 2rem;
		height: 2rem;
	}

	:deep(.header-title) {
		font-size: 0.9rem;
	}

	:deep(.header-subtitle) {
		display: none;
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
	padding: 0.42rem clamp(0.38rem, 0.54vw, 0.62rem);
	border: 1px solid transparent;
	border-radius: 999px;
	font-size: 0.75rem;
	white-space: nowrap;
	color: var(--c-text-2);
	transition: background-color 0.18s, border-color 0.18s, color 0.18s;

	&:hover {
		border-color: var(--c-surface-line);
		background-color: color-mix(in srgb, var(--c-surface-fill) 76%, transparent);
		color: var(--c-text);
	}

	&.router-link-active {
		border-color: var(--c-surface-line);
		box-shadow: inset 0 1px 0 var(--c-surface-highlight);
		background-color: color-mix(in srgb, var(--c-primary-soft) 80%, var(--c-surface-fill));
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
	border-radius: 999px;
	background-color: color-mix(in srgb, var(--c-surface-fill) 76%, transparent);
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
		border-radius: 999px;
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
	border-radius: 999px;
	background-color: color-mix(in srgb, var(--c-surface-fill) 76%, transparent);

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
	.top-nav-brand.top-nav-brand-expanded {
		min-height: 3.15rem;
		padding: 0.3rem 3.7rem 0.3rem 0.42rem;

		:deep(.blog-logo-shell) {
			height: 2.15rem;
		}

		:deep(.blog-logo-shell.circle) {
			width: 2.15rem;
		}

		:deep(.header-title) {
			font-size: 0.92rem;
		}

		:deep(.header-subtitle) {
			max-width: 6.5rem;
			font-size: 0.56rem;
		}

		:deep(.is-header .scene-character) {
			width: 3.8rem;
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
		background: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.blog-top-nav,
	.top-nav-item {
		transition: none;
	}
}
</style>
