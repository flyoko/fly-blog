<script setup lang="ts">
defineProps<{
	hasAside?: boolean
	musicEnabled?: boolean
}>()

const layoutStore = useLayoutStore()
const musicStore = useMusicStore()
const { avoidTargets } = storeToRefs(layoutStore)

const panelRef = useTemplateRef('blog-panel')
const { transform } = useAvoidTransform(panelRef, avoidTargets)
</script>

<template>
<div
	id="blog-panel"
	ref="blog-panel"
	:class="{ 'has-active': layoutStore.state !== 'none' }"
	:style="{ transform }"
>
	<button
		v-if="hasAside"
		class="toggle-aside widescreen-only"
		:class="{ active: layoutStore.state === 'aside' }"
		aria-label="切换侧边栏"
		@click="layoutStore.toggle('aside')"
	>
		<Icon class="rtl-flip" name="tabler:align-right" />
	</button>
	<button
		v-if="musicEnabled && musicStore.hasTracks"
		class="toggle-music mobile-only"
		:class="{ 'active': musicStore.mobileOpen, 'is-playing': musicStore.playing }"
		:aria-label="musicStore.mobileOpen ? '收起音乐播放器' : '打开音乐播放器'"
		:aria-expanded="musicStore.mobileOpen"
		@click="musicStore.toggleMobileOpen"
	>
		<Icon name="tabler:music" />
	</button>

	<Icon v-show="false" name="tabler:layout-sidebar-filled" />
	<button
		class="toggle-sidebar mobile-only"
		:class="{ active: layoutStore.state === 'sidebar' }"
		aria-label="切换菜单"
		@click="layoutStore.toggle('sidebar')"
	>
		<Icon class="rtl-flip" :name="layoutStore.state === 'sidebar' ? 'tabler:layout-sidebar-filled' : 'tabler:layout-sidebar'" />
	</button>
</div>
</template>

<style lang="scss" scoped>
#blog-panel {
	contain: paint;
	position: fixed;
	inset-inline-end: min(1rem, 5%);
	bottom: min(2rem, 5%);
	border-radius: 0.5rem;
	background-color: var(--c-bg-a50);
	backdrop-filter: blur(0.5rem);
	font-size: 1.4rem;
	transition: transform 0.1s;
	z-index: calc(var(--z-index-popover) + 3);

	@media (max-height: $breakpoint-phone) {
		display: flex;
	}

	&.has-active {
		box-shadow: var(--box-shadow-1), var(--box-shadow-3);
	}
}

button {
	display: block;
	position: relative;
	padding: 0.5rem;
	transition: all 0.2s;

	&:hover {
		background-color: var(--c-bg-a80);
		color: var(--c-primary);
	}

	&.active {
		background-color: var(--ld-bg-active);
		color: var(--c-primary);
	}
}

.toggle-music.is-playing::after {
	content: "";
	position: absolute;
	inset-inline-end: 0.45rem;
	top: 0.45rem;
	width: 0.42rem;
	height: 0.42rem;
	border: 1px solid var(--c-bg-1);
	border-radius: 50%;
	background: var(--c-primary);
}
</style>
