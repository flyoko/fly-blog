<script setup lang="ts">
definePageMeta({
	middleware: [
		() => {
			const appConfig = useAppConfig()
			for (const module of appConfig.featureModules) {
				if (module.id === 'weather' || module.id === 'music')
					module.enabled = true
			}
		},
	],
})
</script>

<template>
<section class="e2e-modules">
	<h1>天气与随心听浏览器验收</h1>
	<p>此页面仅在端到端测试构建中存在。</p>
</section>
</template>

<style lang="scss" scoped>
.e2e-modules {
	margin: 1rem;
}
</style>
