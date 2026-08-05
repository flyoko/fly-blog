<script setup lang="ts">
const emit = defineEmits<{ retry: [] }>()

function reload() {
	window.location.reload()
}
</script>

<template>
<section class="admin-route-fallback" role="alert">
	<span class="admin-route-fallback-icon"><Icon name="tabler:lifebuoy" aria-hidden="true" /></span>
	<div>
		<h1>这个页面暂时没有加载完整</h1>
		<p>已输入但尚未发布的内容仍保存在这台设备。可以先重试，仍未恢复时再刷新页面。</p>
		<div>
			<button class="admin-button admin-button-primary" type="button" @click="emit('retry')">
				<Icon name="tabler:refresh" aria-hidden="true" />重新尝试
			</button>
			<button class="admin-button" type="button" @click="reload">
				<Icon name="tabler:reload" aria-hidden="true" />刷新页面
			</button>
		</div>
	</div>
</section>
</template>
