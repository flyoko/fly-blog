<script setup lang="ts">
const { timeEstablished } = useAppConfig()

const blogLog = [
	{ label: timeEstablished, value: 'fly living 博客上线' },
]
</script>

<template>
<BlogWidget card title="更新日志">
	<ZDlGroup size="large" :items="blogLog" />
</BlogWidget>
</template>
