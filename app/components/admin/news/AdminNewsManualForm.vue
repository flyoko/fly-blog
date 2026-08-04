<script setup lang="ts">
interface ManualNewsForm {
	title: string
	summary: string
	url: string
	category: string
}

const props = defineProps<{
	adding: boolean
	error?: string | null
}>()
const emit = defineEmits<{ submit: [] }>()
const form = defineModel<ManualNewsForm>({ required: true })
const valid = computed(() => Boolean(form.value.title.trim() && form.value.url.trim()))
</script>

<template>
<section class="admin-panel admin-news-manual-form">
	<header class="admin-panel-header">
		<div>
			<h2>手动精选</h2>
			<p>标题和原文链接是必填项；保存后会生成站内摘要阅读页。</p>
		</div>
	</header>
	<p v-if="props.error" class="admin-error" role="alert">
		{{ props.error }}
	</p>
	<label class="admin-field"><span>标题</span><input v-model="form.title" maxlength="500" placeholder="这条内容讲了什么"></label>
	<label class="admin-field"><span>摘要</span><textarea v-model="form.summary" rows="6" maxlength="5000" placeholder="可选：用自己的语言概括重点" /></label>
	<div class="admin-news-manual-grid">
		<label class="admin-field"><span>原文链接</span><input v-model="form.url" type="url" placeholder="https://..."></label>
		<label class="admin-field"><span>分类</span><input v-model="form.category" maxlength="120"></label>
	</div>
	<button class="admin-button admin-button-primary" type="button" :disabled="adding || !valid" @click="emit('submit')">
		<Icon name="tabler:plus" />{{ adding ? '正在添加…' : '添加到内容列表' }}
	</button>
</section>
</template>

<style scoped lang="scss">
.admin-news-manual-form {
	display: grid;
	gap: 1rem;
	max-width: 56rem;
	padding: 1rem;
}

.admin-news-manual-grid {
	display: grid;
	grid-template-columns: minmax(0, 1.4fr) minmax(10rem, 0.6fr);
	gap: 0.75rem;
}

@media (max-width: 680px) {
	.admin-news-manual-grid {
		grid-template-columns: 1fr;
	}
}
</style>
