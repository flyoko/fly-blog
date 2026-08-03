import type { ArticleDocument, ArticleSummary } from '#shared/admin/articles'
import { encodeArticleId } from '#shared/admin/articles'
import {
	buildArticleSaveRequest,
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
	const success = ref<string | null>(null)
	const rawComparisonOpen = ref(false)
	const initialized = ref(false)
	const draftRestored = ref(false)
	const drafts = useAdminDraft()
	let draftTimer: ReturnType<typeof setTimeout> | undefined

	const draftStatus = computed(() => {
		if (drafts.saving.value)
			return '正在保存本地草稿…'
		if (drafts.error.value)
			return drafts.error.value
		if (draftRestored.value)
			return '已恢复浏览器中的本地草稿'
		if (drafts.lastSavedAt.value)
			return `本地草稿已保存 ${new Date(drafts.lastSavedAt.value).toLocaleTimeString()}`
		return ''
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
		draftRestored.value = true
		drafts.lastSavedAt.value = saved.updatedAt
	}

	async function initialize() {
		loading.value = true
		error.value = null
		try {
			await Promise.all([loadArticles(), loadRemote()])
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

	async function save(mode: 'direct' | 'pull_request') {
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
			conflict.value = false
			success.value = mode === 'direct' ? '文章已提交发布' : '文章 Pull Request 已创建'
			if (options.isNew) {
				await router.replace(`/admin/articles/${encodeArticleId(document.value.path)}`)
			}
			else {
				await loadRemote()
			}
		}
		catch (cause) {
			if (cause instanceof AdminApiError && cause.code === 'CONFLICT')
				conflict.value = true
			error.value = cause instanceof Error ? cause.message : '文章保存失败'
		}
		finally {
			saving.value = false
		}
	}

	async function reloadRemote() {
		if (options.isNew) {
			document.value = options.initialDocument ?? document.value
			return
		}
		await drafts.remove(document.value.path, document.value.sha)
		await loadRemote()
		conflict.value = false
		draftRestored.value = false
	}

	function compareRaw() {
		rawComparisonOpen.value = true
	}

	function navigate(id: string) {
		router.push(`/admin/articles/${id}`)
	}

	watch(document, () => {
		if (!initialized.value)
			return
		if (draftTimer)
			clearTimeout(draftTimer)
		draftTimer = setTimeout(() => drafts.save(document.value), 800)
	}, { deep: true })

	onMounted(initialize)
	onBeforeUnmount(() => {
		if (draftTimer)
			clearTimeout(draftTimer)
	})

	return {
		document,
		remoteDocument,
		articles,
		loading,
		saving,
		conflict,
		error,
		success,
		rawComparisonOpen,
		draftStatus,
		initialize,
		save,
		reloadRemote,
		compareRaw,
		navigate,
	}
}
