<script setup lang="ts">
const route = useRoute()
const adminStore = useAdminStore()
const signingIn = ref(false)

useSeoMeta({
	title: '登录创作工作台',
	robots: 'noindex, nofollow',
})

function login() {
	signingIn.value = true
	const returnTo = typeof route.query.returnTo === 'string' && route.query.returnTo.startsWith('/admin')
		? route.query.returnTo
		: '/admin'
	window.location.assign(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
}
</script>

<template>
<section class="admin-login">
	<div class="admin-login-card">
		<div class="admin-login-visual">
			<span class="admin-hero-eyebrow">fly living</span>
			<h2>把技术、生活与此刻，安静地写下来。</h2>
			<p>文章、瞬间、AI 阅闻与音乐，将在同一个个人创作空间里被整理、发布和回顾。</p>
		</div>
		<div class="admin-login-form">
			<span class="admin-badge">仅限站长</span>
			<h1>管理你的创作空间</h1>
			<p>使用已授权的 GitHub 账号进入后台。登录状态只保存在安全会话中。</p>
			<p v-if="adminStore.error" class="admin-error">
				{{ adminStore.error }}
			</p>
			<button class="admin-button admin-login-button" type="button" :disabled="signingIn" @click="login">
				<Icon name="tabler:brand-github" />
				{{ signingIn ? '正在前往 GitHub…' : '使用 GitHub 登录' }}
			</button>
			<div class="admin-login-note">
				<Icon name="tabler:shield-lock" aria-hidden="true" />
				<span>系统只接受已配置的 GitHub 账号，不会在浏览器中保存访问令牌。</span>
			</div>
		</div>
	</div>
</section>
</template>
