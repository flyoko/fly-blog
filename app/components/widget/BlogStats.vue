<script setup lang="ts">
import { Temporal } from 'temporal-polyfill'

const appConfig = useAppConfig()
const runtimeConfig = useRuntimeConfig()

// 响应头不正确时，stats.value 可能会是字符串，首次属性访问可能为 undefined
const { data: stats } = useFetch('/api/stats')

const buildTime = toZonedTemporal(runtimeConfig.public.buildTime).toPlainDateTime()
const displayReference = shallowRef<Temporal.PlainDateTime>(buildTime)

onMounted(() => {
	displayReference.value = Temporal.Now.plainDateTimeISO()
})

const uptime = computed(() => timeElapse(appConfig.timeEstablished, 2, displayReference.value))
const buildAge = computed(() => {
	const elapsed = timeElapse(buildTime, 2, displayReference.value)
	return elapsed === '刚刚' ? elapsed : `${elapsed}前`
})

const yearlyTip = computed(() => Object
	.entries(stats.value?.annual || {})
	.reverse()
	.map(([year, item]) => `${year}年：${item.posts}篇，${formatNumber(item.words)}字`)
	.join('\n') || '数据获取失败',
)

const blogStats = [{
	label: '运营时长',
	value: uptime,
	tip: `博客于${appConfig.timeEstablished}上线`,
}, {
	label: '上次更新',
	value: buildAge,
	tip: `构建于${runtimeConfig.public.buildTime}`,
}, {
	label: '总字数',
	value: computed(() => formatNumber(stats.value?.total?.words) || '--'),
	tip: yearlyTip,
}]
</script>

<template>
<BlogWidget card title="博客统计">
	<ZDlGroup :items="blogStats" size="small" />
</BlogWidget>
</template>
