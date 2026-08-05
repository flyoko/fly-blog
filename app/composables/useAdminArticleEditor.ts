import type { ArticleDiagnostic } from '#shared/admin/article-validation'
import type { ArticleDocument, ArticleSummary } from '#shared/admin/articles'
import { validateArticleMarkdown } from '#shared/admin/article-validation'
import { encodeArticleId } from '#shared/admin/articles'
import {
	buildArticleSaveRequest,
	cloneArticleDocument,
	useAdminDraft,
} from '~/composables/useAdminDraft'

export interface AdminArticleEditorOptions {
	isNew: boolean
	articleId?: string
	initialDocument?: ArticleDocument
}

function newIdempotencyKey(prefix: string) {
	return `${prefix}-${crypto.randomUUID()}`
}

function documentFingerprint(document: ArticleDocument) {
	return JSON.stringify(document)
}

export function useAdminArticleEditor(options: AdminArticleEditorOptions) {
	const router = useRouter()
	const document = ref<ArticleDocument>(options.initialDocument ?? {
		path: `content/posts/${new Date().getFullYear()}/untitled.md`,
		sha: null,
		body: '',
		frontmatter: {
			title: '',
			description: '',
			categories: [],
			tags: [],
			draft: true,
			date: new Date().toISOString().slice(0, 10),
		},
	})
	const remoteDocument = ref<ArticleDocument | null>(null)
	const articles = ref<ArticleSummary[]>([])
	const loading = ref(true)
	const saving = ref(false)
	const conflict = ref(false)
	const error = ref<string | null>(null)
	const diagnostics = ref<ArticleDiagnostic[]>([])
	const success = ref<string | null>(null)
	const rawComparisonOpen = ref(false)
	const initialized = ref(false)
	const draftRestored = ref(false)
	const initialFingerprint = documentFingerprint(document.value)
	const remoteFingerprint = ref(initialFingerprint)
	const localDraftFingerprint = ref(initialFingerprint)
	const drafts = useAdminDraft()
	let draftTimer: ReturnType<typeof setTimeout> | undefined
	let draftSavePromise: Promise<void> | undefined

	const hasUnsavedChanges = computed(() => documentFingerprint(document.value) !== localDraftFingerprint.value)
	watch(() => document.value.body, () => {
		if (diagnostics.value.length)
			diagnostics.value = []
	})
	const matchesRemote = computed(() => documentFingerprint(document.value) === remoteFingerprint.value)
	const draftStatus = computed(() => {
		if (drafts.saving.value)
			return '正在把改动保存到这台设备…'
		if (drafts.error.value)
			return drafts.error.value
		if (hasUnsavedChanges.value)
			return '有改动，稍后会自动保存在这台设备'
		if (draftRestored.value)
			return '已恢复上次没有发布的本地内容'
		if (drafts.lastSavedAt.value)
			return `已在这台设备保存 · ${new Date(drafts.lastSavedAt.value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
		return matchesRemote.value ? '内容已与远端版本一致' : '改动已保存在这台设备，尚未发布'
	})

	async function loadArticles() {
		const result = await useAdminApi<{ items: ArticleSummary[] }>('/api/admin/articles', {
			query: { page: 1, pageSize: 20 },
		})
		articles.value = result.items
	}

	async function loadRemote() {
		if (options.isNew || !options.articleId)
			return
		const value = await useAdminApi<ArticleDocument>(`/api/admin/articles/${options.articleId}`)
		remoteDocument.value = structuredClone(value)
		document.value = value
	}

	async function restoreDraft() {
		const saved = await drafts.load(document.value.path, document.value.sha)
		if (!saved)
			return
		document.value = saved.document
		localDraftFingerprint.value = documentFingerprint(document.value)
		draftRestored.value = true
		drafts.lastSavedAt.value = saved.updatedAt
	}

	async function initialize() {
		loading.value = true
		error.value = null
		diagnostics.value = []
		try {
			await Promise.all([loadArticles(), loadRemote()])
			const loadedFingerprint = documentFingerprint(document.value)
			remoteFingerprint.value = loadedFingerprint
			localDraftFingerprint.value = loadedFingerprint
			await restoreDraft()
			initialized.value = true
		}
		catch (cause) {
			error.value = cause instanceof Error ? cause.message : '文章编辑器加载失败'
		}
		finally {
			loading.value = false
		}
	}

	async function persistLocalDraft() {
		if (!initialized.value)
			return
		if (draftSavePromise)
			await draftSavePromise
		if (!hasUnsavedChanges.value)
			return
		const snapshot = cloneArticleDocument(document.value)
		const snapshotFingerprint = documentFingerprint(snapshot)
		const operation = drafts.save(snapshot)
		draftSavePromise = operation
		try {
			await operation
			localDraftFingerprint.value = snapshotFingerprint
		}
		finally {
			if (draftSavePromise === operation)
				draftSavePromise = undefined
		}
	}

	async function flushPendingDraft() {
		if (!initialized.value)
			return
		if (draftTimer) {
			clearTimeout(draftTimer)
			draftTimer = undefined
		}
		if (draftSavePromise)
			await draftSavePromise
		await persistLocalDraft()
	}

	async function save(mode: 'direct' | 'pull_request') {
		if (!document.value.frontmatter.title?.trim() || !document.value.body.trim()) {
			error.value = '先写好标题和正文，再保存或提交审核。'
			return
		}
		diagnostics.value = validateArticleMarkdown(document.value.body)
		if (diagnostics.value.length) {
			error.value = '文章正文存在格式问题，请先修正。'
			return
		}
		saving.value = true
		error.value = null
		success.value = null
		try {
			const request = buildArticleSaveRequest(
				document.value,
				mode,
				newIdempotencyKey(options.isNew ? 'article-create' : 'article-update'),
			)
			await useAdminApi(options.isNew
				? '/api/admin/articles'
				: `/api/admin/articles/${options.articleId}`, {
				method: options.isNew ? 'POST' : 'PUT',
				body: request,
			})
			await drafts.remove(document.value.path, document.value.sha)
			const savedFingerprint = documentFingerprint(document.value)
			remoteFingerprint.value = savedFingerprint
			localDraftFingerprint.value = savedFingerprint
			draftRestored.value = false
			conflict.value = false
			if (mode === 'pull_request')
				success.value = '已提交审核，检查与预览完成后可在“发布与审核”中合并。'
			else if (document.value.frontmatter.draft)
				success.value = '草稿已保存到内容仓库，前台仍不会展示。'
			else
				success.value = '文章已发布。'
			if (options.isNew) {
				await router.replace(`/admin/articles/${encodeArticleId(document.value.path)}`)
			}
			else {
				await loadRemote()
				const loadedFingerprint = documentFingerprint(document.value)
				remoteFingerprint.value = loadedFingerprint
				localDraftFingerprint.value = loadedFingerprint
			}
		}
		catch (cause) {
			if (cause instanceof AdminApiError && cause.code === 'CONFLICT')
				conflict.value = true
			error.value = cause instanceof Error ? cause.message : '文章保存失败'
			diagnostics.value = (cause as { details?: { diagnostics?: ArticleDiagnostic[] } })?.details?.diagnostics ?? []
		}
		finally {
			saving.value = false
		}
	}

	async function reloadRemote() {
		if (options.isNew) {
			document.value = options.initialDocument ?? document.value
			const resetFingerprint = documentFingerprint(document.value)
			remoteFingerprint.value = resetFingerprint
			localDraftFingerprint.value = resetFingerprint
			return
		}
		await drafts.remove(document.value.path, document.value.sha)
		await loadRemote()
		const loadedFingerprint = documentFingerprint(document.value)
		remoteFingerprint.value = loadedFingerprint
		localDraftFingerprint.value = loadedFingerprint
		conflict.value = false
		draftRestored.value = false
	}

	function compareRaw() {
		rawComparisonOpen.value = true
	}

	async function navigate(id: string) {
		await flushPendingDraft()
		await router.push(`/admin/articles/${id}`)
	}

	watch(document, () => {
		if (!initialized.value)
			return
		draftRestored.value = false
		if (draftTimer)
			clearTimeout(draftTimer)
		draftTimer = setTimeout(() => {
			draftTimer = undefined
			void persistLocalDraft().catch(() => {})
		}, 800)
	}, { deep: true })

	onBeforeRouteLeave(async () => {
		await flushPendingDraft()
		return true
	})

	onMounted(initialize)
	onBeforeUnmount(() => {
		if (draftTimer)
			clearTimeout(draftTimer)
		void flushPendingDraft()
	})

	return {
		document,
		remoteDocument,
		articles,
		loading,
		saving,
		conflict,
		error,
		diagnostics,
		success,
		rawComparisonOpen,
		draftStatus,
		hasUnsavedChanges,
		initialize,
		flushPendingDraft,
		save,
		reloadRemote,
		compareRaw,
		navigate,
	}
}
