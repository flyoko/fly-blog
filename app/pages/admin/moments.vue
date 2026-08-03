<script setup lang="ts">
import type { MediaObjectDto } from '#shared/admin/media'
import type { MomentDto, MomentStatus } from '#shared/admin/moments'

const items = ref<MomentDto[]>([])
const media = ref<MediaObjectDto[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')
const selectedId = ref<string | null>(null)
const statusFilter = ref<'' | MomentStatus>('')
const query = ref('')
const form = reactive({
	content: '',
	status: 'draft' as MomentStatus,
	tags: '',
	city: '',
	mediaIds: [] as string[],
	musicTitle: '',
	musicArtist: '',
	musicUrl: '',
})
const selected = computed(
	() => items.value.find(item => item.id === selectedId.value) ?? null,
)

interface MomentBackupStatus {
	state: {
		last_success_at?: string | null
		last_backup_path?: string | null
		last_error?: string | null
	} | null
	runs: Array<{
		id: string
		kind: string
		status: string
		source_ref?: string | null
		target_ref?: string | null
		item_count: number
		error_message?: string | null
		created_at: string
	}>
}

const backup = ref<MomentBackupStatus | null>(null)
const backupPath = ref('')
const backupPreview = ref<{
	momentCount: number
	mediaCount: number
	missingMediaIds: string[]
	canRestore: boolean
	checksum: string
} | null>(null)
const backupWorking = ref(false)
const restoreConfirmation = ref('')

useSeoMeta({ title: '瞬间管理', robots: 'noindex, nofollow' })

function resetForm() {
	selectedId.value = null
	Object.assign(form, {
		content: '',
		status: 'draft',
		tags: '',
		city: '',
		mediaIds: [],
		musicTitle: '',
		musicArtist: '',
		musicUrl: '',
	})
}

function edit(moment: MomentDto) {
	selectedId.value = moment.id
	Object.assign(form, {
		content: moment.content,
		status: moment.status,
		tags: moment.tags.join(', '),
		city: moment.city || '',
		mediaIds: moment.media.map(item => item.id),
		musicTitle: moment.music?.title || '',
		musicArtist: moment.music?.artist || '',
		musicUrl: moment.music?.url || '',
	})
}

function payload() {
	return {
		content: form.content,
		status: form.status,
		tags: form.tags
			.split(/[,，]/u)
			.map(item => item.trim())
			.filter(Boolean),
		city: form.city.trim() || null,
		mediaIds: form.mediaIds,
		music:
			form.musicTitle.trim() && form.musicUrl.trim()
				? {
						id: `manual-${crypto.randomUUID()}`,
						title: form.musicTitle.trim(),
						artist: form.musicArtist.trim() || undefined,
						url: form.musicUrl.trim(),
					}
				: null,
	}
}

async function load() {
	loading.value = true
	error.value = ''
	try {
		const [moments, mediaResult] = await Promise.all([
			useAdminApi<{ items: MomentDto[], total: number }>('/api/admin/moments', {
				query: {
					page: 1,
					pageSize: 50,
					status: statusFilter.value || undefined,
					query: query.value || undefined,
				},
			}),
			useAdminApi<{ items: MediaObjectDto[] }>('/api/admin/media', {
				query: { page: 1, pageSize: 40, status: 'active', type: 'image' },
			}),
		])
		items.value = moments.items
		media.value = mediaResult.items.filter(
			item => item.purpose === 'moment' || item.purpose === 'article',
		)
		if (selectedId.value) {
			const latest = items.value.find(item => item.id === selectedId.value)
			if (latest)
				edit(latest)
		}
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '瞬间列表加载失败'
	}
	finally {
		loading.value = false
	}
}

async function save() {
	if (!form.content.trim()) {
		error.value = '请输入瞬间内容'
		return
	}
	saving.value = true
	error.value = ''
	success.value = ''
	try {
		if (selected.value) {
			await useAdminApi(`/api/admin/moments/${selected.value.id}`, {
				method: 'PUT',
				body: {
					moment: payload(),
					expectedVersion: selected.value.version,
					idempotencyKey: `moment-update-${crypto.randomUUID()}`,
				},
			})
		}
		else {
			await useAdminApi('/api/admin/moments', {
				method: 'POST',
				body: {
					moment: payload(),
					idempotencyKey: `moment-create-${crypto.randomUUID()}`,
				},
			})
		}
		success.value = '瞬间已保存。'
		await load()
		if (!selected.value)
			resetForm()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '瞬间保存失败'
	}
	finally {
		saving.value = false
	}
}

async function transition(kind: 'publish' | 'withdraw' | 'restore') {
	if (!selected.value)
		return
	saving.value = true
	error.value = ''
	success.value = ''
	try {
		await useAdminApi(`/api/admin/moments/${selected.value.id}/${kind}`, {
			method: 'POST',
			body: {
				expectedVersion: selected.value.version,
				idempotencyKey: `moment-${kind}-${crypto.randomUUID()}`,
			},
		})
		success.value
			= kind === 'publish'
				? '瞬间已公开。'
				: kind === 'withdraw'
					? '瞬间已撤回。'
					: '瞬间已恢复为草稿。'
		await load()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '状态更新失败'
	}
	finally {
		saving.value = false
	}
}

async function loadBackup() {
	try {
		backup.value = await useAdminApi<MomentBackupStatus>(
			'/api/admin/moment-backups',
		)
		if (!backupPath.value && backup.value.state?.last_backup_path)
			backupPath.value = backup.value.state.last_backup_path
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '备份状态加载失败'
	}
}

async function runBackup() {
	backupWorking.value = true
	error.value = ''
	success.value = ''
	try {
		const result = await useAdminApi<{ changed: boolean, path: string | null }>(
			'/api/admin/moment-backups/run',
			{ method: 'POST' },
		)
		success.value = result.changed
			? `快照已提交：${result.path}`
			: '瞬间数据没有变化，未创建重复 Commit。'
		await loadBackup()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '备份执行失败'
	}
	finally {
		backupWorking.value = false
	}
}

async function previewBackup() {
	if (!backupPath.value)
		return
	backupWorking.value = true
	error.value = ''
	try {
		backupPreview.value = await useAdminApi(
			'/api/admin/moment-backups/preview',
			{ method: 'POST', body: { path: backupPath.value } },
		)
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '备份预检失败'
	}
	finally {
		backupWorking.value = false
	}
}

async function restoreBackup() {
	if (
		!backupPreview.value?.canRestore
		|| restoreConfirmation.value !== 'RESTORE'
	) {
		error.value = '请输入 RESTORE 确认恢复。'
		return
	}
	backupWorking.value = true
	error.value = ''
	try {
		await useAdminApi('/api/admin/moment-backups/restore', {
			method: 'POST',
			body: { path: backupPath.value, confirmation: 'RESTORE' },
		})
		success.value = '瞬间快照已恢复。'
		backupPreview.value = null
		restoreConfirmation.value = ''
		await Promise.all([load(), loadBackup()])
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '备份恢复失败'
	}
	finally {
		backupWorking.value = false
	}
}

let timer: ReturnType<typeof setTimeout> | undefined
watch([statusFilter, query], () => {
	if (timer)
		clearTimeout(timer)
	timer = setTimeout(load, 250)
})
onMounted(() => Promise.all([load(), loadBackup()]))
onBeforeUnmount(() => timer && clearTimeout(timer))
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">D1 · MOMENTS</span>
			<h1>瞬间</h1>
			<p>发布短内容、图片、地点和正在听的声音。</p>
		</div>
		<button
			class="admin-button admin-button-primary"
			type="button"
			@click="resetForm"
		>
			<Icon name="tabler:plus" />新建瞬间
		</button>
	</header>
	<p v-if="error" class="admin-error">
		{{ error }}
	</p>
	<p v-if="success" class="admin-success">
		{{ success }}
	</p>
	<div class="admin-moment-layout">
		<aside class="admin-panel admin-moment-list-panel">
			<div class="admin-toolbar admin-toolbar-wrap">
				<label class="admin-search-field admin-search-field-wide"><Icon name="tabler:search" /><input
					v-model="query"
					type="search"
					placeholder="搜索瞬间"
				></label>
				<label class="admin-select-field"><span>状态</span><select v-model="statusFilter">
					<option value="">全部</option>
					<option value="draft">草稿</option>
					<option value="published">已发布</option>
					<option value="withdrawn">已撤回</option>
				</select></label>
			</div>
			<div v-if="loading" class="admin-action-list">
				<div
					v-for="i in 5"
					:key="i"
					class="admin-skeleton admin-list-skeleton"
				/>
			</div>
			<div v-else-if="items.length" class="admin-content-list">
				<button
					v-for="item in items"
					:key="item.id"
					class="admin-moment-list-item"
					:class="{ 'is-active': item.id === selectedId }"
					type="button"
					@click="edit(item)"
				>
					<strong>{{ item.content }}</strong><span>{{ item.status }} · v{{ item.version }} ·
						{{ item.likeCount }} 赞</span>
				</button>
			</div>
			<AdminEmptyState
				v-else
				icon="tabler:sparkles-off"
				title="还没有瞬间"
				description="从右侧编辑器创建第一条瞬间。"
			/>
		</aside>
		<section class="admin-panel admin-moment-editor">
			<header class="admin-panel-header">
				<div>
					<h2>{{ selected ? "编辑瞬间" : "新建瞬间" }}</h2>
					<p>
						{{
							selected ? `版本 ${selected.version}` : "保存为草稿或直接发布"
						}}
					</p>
				</div>
			</header>
			<label class="admin-field"><span>内容</span><textarea
				v-model="form.content"
				rows="8"
				maxlength="10000"
				placeholder="此刻在想什么？"
			/>
			</label>
			<div class="admin-form-grid">
				<label class="admin-field"><span>状态</span><select v-model="form.status">
					<option value="draft">草稿</option>
					<option value="published">已发布</option>
					<option value="withdrawn">已撤回</option>
				</select></label>
				<label class="admin-field"><span>城市</span><input
					v-model="form.city"
					maxlength="80"
					placeholder="仅城市级，例如 Shanghai"
				></label>
			</div>
			<label class="admin-field"><span>标签（逗号分隔）</span><input v-model="form.tags" placeholder="生活, 随笔"></label>
			<div class="admin-form-grid">
				<label class="admin-field"><span>音乐标题</span><input v-model="form.musicTitle" placeholder="可选"></label>
				<label class="admin-field"><span>音乐作者</span><input v-model="form.musicArtist" placeholder="可选"></label>
			</div>
			<label class="admin-field"><span>音乐公开链接</span><input v-model="form.musicUrl" type="url" placeholder="https://..."></label>
			<fieldset class="admin-field admin-moment-media">
				<legend>媒体（最多 9 张）</legend>
				<p v-if="!media.length" class="admin-muted-copy">
					媒体库中还没有可用图片。
				</p>
				<label v-for="item in media" :key="item.id"><input
					v-model="form.mediaIds"
					type="checkbox"
					:value="item.id"
					:disabled="
						!form.mediaIds.includes(item.id) && form.mediaIds.length >= 9
					"
				><img :src="item.url" :alt="item.originalName" loading="lazy" decoding="async"><span>{{
					item.originalName
				}}</span></label>
			</fieldset>
			<footer class="admin-moment-actions">
				<button
					class="admin-button admin-button-primary"
					type="button"
					:disabled="saving"
					@click="save"
				>
					<Icon name="tabler:device-floppy" />{{
						saving ? "保存中…" : "保存"
					}}
				</button>
				<button
					v-if="selected && selected.status !== 'published'"
					class="admin-button"
					type="button"
					:disabled="saving"
					@click="transition('publish')"
				>
					发布
				</button>
				<button
					v-if="selected?.status === 'published'"
					class="admin-button admin-button-danger"
					type="button"
					:disabled="saving"
					@click="transition('withdraw')"
				>
					撤回
				</button>
				<button
					v-if="selected?.status === 'withdrawn'"
					class="admin-button"
					type="button"
					:disabled="saving"
					@click="transition('restore')"
				>
					恢复草稿
				</button>
			</footer>
		</section>
	</div>

	<section class="admin-panel admin-moment-backup">
		<header class="admin-panel-header">
			<div>
				<h2>Git 快照与恢复</h2>
				<p>
					每日定时备份；无变化不提交。恢复前必须先通过结构、校验和与媒体预检。
				</p>
			</div>
			<button
				class="admin-button"
				type="button"
				:disabled="backupWorking"
				@click="runBackup"
			>
				<Icon name="tabler:database-export" />立即备份
			</button>
		</header>
		<div class="admin-backup-summary">
			<div>
				<span>最近成功</span><strong>{{ backup?.state?.last_success_at || "尚未备份" }}</strong>
			</div>
			<div>
				<span>快照路径</span><strong>{{ backup?.state?.last_backup_path || "—" }}</strong>
			</div>
			<div>
				<span>最近错误</span><strong>{{ backup?.state?.last_error || "无" }}</strong>
			</div>
		</div>
		<div class="admin-backup-controls">
			<label class="admin-field"><span>快照仓库路径</span><input
				v-model.trim="backupPath"
				placeholder="backups/moments/YYYY/MM/YYYY-MM-DD.json"
			></label>
			<button
				class="admin-button"
				type="button"
				:disabled="backupWorking || !backupPath"
				@click="previewBackup"
			>
				恢复预检
			</button>
			<button
				class="admin-button admin-button-danger"
				type="button"
				:disabled="backupWorking || !backupPreview?.canRestore"
				@click="restoreBackup"
			>
				确认恢复
			</button>
		</div>
		<p v-if="backupPreview" class="admin-backup-preview">
			{{ backupPreview.momentCount }} 条瞬间 ·
			{{ backupPreview.mediaCount }} 个媒体引用 ·
			{{ backupPreview.missingMediaIds.length }} 个缺失对象 · 校验和
			{{ backupPreview.checksum.slice(0, 12) }}…
		</p>
		<div v-if="backup?.runs.length" class="admin-content-list">
			<div
				v-for="run in backup.runs.slice(0, 6)"
				:key="run.id"
				class="admin-backup-run"
			>
				<strong>{{ run.kind }} · {{ run.status }}</strong><span>{{ run.item_count }} 条 · {{ run.created_at }}</span><small v-if="run.error_message">{{ run.error_message }}</small>
			</div>
		</div>
	</section>
</section>
</template>

<style scoped lang="scss">
.admin-moment-layout {
	display: grid;
	grid-template-columns: minmax(18rem, 0.8fr) minmax(0, 1.4fr);
	gap: 1rem;
}

.admin-moment-list-panel,
.admin-moment-editor {
	padding: 1rem;
}

.admin-moment-list-item {
	display: grid;
	gap: 0.4rem;
	width: 100%;
	padding: 0.85rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.8rem;
	background: var(--admin-surface);
	text-align: left;
}

.admin-moment-list-item.is-active {
	border-color: var(--admin-accent);
	background: var(--admin-accent-soft);
}

.admin-moment-list-item strong {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.admin-moment-list-item span {
	font-size: 0.68rem;
	color: var(--admin-muted);
}

.admin-form-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.8rem;
}

.admin-field select {
	min-height: 2.7rem;
	padding: 0 0.7rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.7rem;
	background: var(--admin-surface);
	color: var(--admin-text);
}

.admin-moment-media {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
	gap: 0.6rem;
	margin-top: 1rem;
}

.admin-moment-media legend {
	grid-column: 1 / -1;
	margin-bottom: 0.4rem;
	font-size: 0.72rem;
	color: var(--admin-muted);
}

.admin-moment-media label {
	display: grid;
	gap: 0.3rem;
	position: relative;
	padding: 0.35rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.7rem;
}

.admin-moment-media img {
	width: 100%;
	aspect-ratio: 1;
	border-radius: 0.45rem;
	object-fit: cover;
}

.admin-moment-media input {
	position: absolute;
	top: 0.6rem;
	left: 0.6rem;
}

.admin-moment-media span {
	overflow: hidden;
	font-size: 0.62rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.admin-moment-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.6rem;
	margin-top: 1rem;
}

.admin-moment-backup {
	margin-top: 1rem;
	padding: 1rem;
}

.admin-backup-summary {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.7rem;
}

.admin-backup-summary > div,
.admin-backup-run {
	display: grid;
	gap: 0.25rem;
	padding: 0.75rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.7rem;
}

.admin-backup-summary span,
.admin-backup-run span,
.admin-backup-run small {
	font-size: 0.68rem;
	color: var(--admin-muted);
}

.admin-backup-controls {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.35fr) auto auto;
	align-items: end;
	gap: 0.6rem;
	margin-top: 1rem;
}

.admin-backup-preview {
	margin: 0.8rem 0;
	font-size: 0.75rem;
	color: var(--admin-muted);
}

@media (max-width: 760px) {
	.admin-backup-summary,
	.admin-backup-controls {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 900px) {
	.admin-moment-layout {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 560px) {
	.admin-form-grid {
		grid-template-columns: 1fr;
	}
}
</style>
