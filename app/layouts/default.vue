<script setup lang="ts">
const appConfig = useAppConfig()
const musicEnabled = computed(() => appConfig.featureModules.some(module => module.id === 'music' && module.enabled))
const routeAsideVisible = ref(false)
const hasAside = computed(() => routeAsideVisible.value)
</script>

<template>
<BlogAtmosphere />
<NuxtLoadingIndicator />
<NuxtRouteAnnouncer :style="{ position: 'absolute' }" />
<BlogSkipToContent />
<BlogTopNav />
<BlogSidebar />
<div id="content" :class="{ 'has-aside': hasAside }">
	<main id="main-content">
		<slot />
		<BlogFooter />
	</main>
	<BlogAside :has-content="hasAside">
		<ClientOnly>
			<BlogRouteAside @visibility-change="routeAsideVisible = $event" />
		</ClientOnly>
	</BlogAside>
</div>
<BlogPanel :has-aside="hasAside" :music-enabled="musicEnabled" />
<LazyMusicGlobalPlayer v-if="musicEnabled" />
<BikariyaModals />
<BlogSurfaceInteraction />
<BlogStoryboardInteraction />
</template>

<!-- eslint-disable-next-line vue/enforce-style-attribute -->
<style lang="scss">
#blog-root {
	display: flex;
	justify-content: center;
	gap: 1rem;
	position: relative;
	min-width: 0;
	background-color: var(--c-atmosphere-base);
	isolation: isolate;

	// 只把正文抬到氛围背景之上。抽屉、遮罩和固定控件保留各自的层级，
	// 避免通配选择器覆盖组件内更高的 z-index。
	> #content {
		position: relative;
		z-index: 1;
	}
}

#blog-sidebar, #blog-aside {
	flex: 0 0 280px; // 防止搜索框 grow
	position: sticky;
	top: 0;
	height: 100vh;
	height: 100dvh;
	min-width: 0; // 防止搜索框撑开页面
	scrollbar-width: thin;

	@media (max-width: $breakpoint-widescreen) {
		flex-shrink: 0.2;
	}
}

#content {
	display: flex;
	gap: 1rem;

	// 若设置的是 max-width，则内部 main 宽度为 fit-content，可能无法撑满
	// 此时即使设置 flex-grow，也会影响 #sidebar 无法正确 shrink
	width: $breakpoint-widescreen;
	min-width: 0; // 解决父级 flexbox 设置 justify-content: center 时溢出左侧消失的问题

	// 此处不建议给内容设置 padding
	> #main-content {
		flex-grow: 1; // 使较小宽度的内容占满

		// overflow: hidden; // 会使一部分元素吸顶失效

		// 使内容正确计算宽度而不横向溢出
		// 也可设置 width: 0 或者 contain: inline-size（兼容性不佳）
		min-width: 0;

		@media (max-width: $breakpoint-mobile) {
			width: 100%;
			padding-bottom: var(--mobile-content-clearance);
		}
	}
}

// 桌面使用顶部导航 + 正文/右栏双列；窄屏继续沿用原侧栏与抽屉交互。
@media not (max-width: $breakpoint-widescreen) {
	#blog-root {
		--desktop-shell-width: 88rem;
		--desktop-top-nav-width: min(96rem, calc(100vw - 3rem));
		--desktop-shell-gutter: 0.75rem;
		--desktop-content-gap: 0.4rem;
		--desktop-top-nav-height: 3.75rem;
		--desktop-sticky-top: calc(var(--desktop-shell-gutter) + var(--desktop-top-nav-height) + var(--desktop-content-gap));

		display: grid;
		grid-template-columns: minmax(0, var(--desktop-shell-width));
		place-content: start center;
		gap: var(--desktop-content-gap);
		padding: var(--desktop-shell-gutter) 1rem 0;
	}

	#content {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		gap: 0.85rem;
		width: 100%;
		max-width: var(--desktop-shell-width);

		&.has-aside {
			grid-template-columns: minmax(0, 1fr) clamp(19rem, 21vw, 20.5rem);
		}
	}

	#blog-aside {
		flex: none;
		top: var(--desktop-sticky-top);
		width: auto;
		height: calc(100dvh - var(--desktop-sticky-top) - 0.65rem);
	}
}
</style>
