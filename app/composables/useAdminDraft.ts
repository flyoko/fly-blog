import type { ArticleDocument } from '#shared/admin/articles'
import { toRaw } from 'vue'
import { articleSaveRequestSchema } from '#shared/admin/articles'

const draftDatabaseName = 'fly-living-admin'
const draftStoreName = 'article-drafts'
const draftDatabaseVersion = 1

export interface AdminArticleDraft {
	key: string
	document: ArticleDocument
	updatedAt: string
}

export interface ArticleMetadataInput {
	title: string
	description?: string
	categories: string[]
	tags: string[]
	draft: boolean
	image?: string
	date?: string
	updated?: string
}

export function adminDraftKey(path: string, sha: string | null | undefined) {
	return `${path}::${sha || 'new'}`
}

export function insertMarkdownImage(
	body: string,
	selectionStart: number,
	selectionEnd: number,
	alt: string,
	url: string,
) {
	const safeAlt = alt.replaceAll(']', '\\]')
	const markdown = `![${safeAlt}](${url})`
	return {
		body: `${body.slice(0, selectionStart)}${markdown}${body.slice(selectionEnd)}`,
		cursor: selectionStart + markdown.length,
	}
}

export function updateArticleFrontmatter(document: ArticleDocument, input: ArticleMetadataInput): ArticleDocument {
	return {
		...document,
		frontmatter: {
			...document.frontmatter,
			title: input.title,
			description: input.description || undefined,
			categories: [...input.categories],
			tags: [...input.tags],
			draft: input.draft,
			image: input.image || undefined,
			date: input.date || document.frontmatter.date,
			updated: input.updated || document.frontmatter.updated,
		},
	}
}

export function buildArticleSaveRequest(
	document: ArticleDocument,
	mode: 'direct' | 'pull_request',
	idempotencyKey: string,
) {
	return articleSaveRequestSchema.parse({
		document,
		expectedSha: document.sha,
		mode,
		idempotencyKey,
	})
}

export function cloneArticleDocument(document: ArticleDocument): ArticleDocument {
	return structuredClone(toRaw(document))
}

function openDraftDatabase(): Promise<IDBDatabase> {
	if (!import.meta.client || !('indexedDB' in globalThis))
		return Promise.reject(new Error('当前浏览器不支持本地草稿'))
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(draftDatabaseName, draftDatabaseVersion)
		request.onerror = () => reject(request.error ?? new Error('草稿数据库打开失败'))
		request.onupgradeneeded = () => {
			const database = request.result
			if (!database.objectStoreNames.contains(draftStoreName))
				database.createObjectStore(draftStoreName, { keyPath: 'key' })
		}
		request.onsuccess = () => resolve(request.result)
	})
}

async function withDraftStore<T>(
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
	const database = await openDraftDatabase()
	try {
		return await new Promise((resolve, reject) => {
			const transaction = database.transaction(draftStoreName, mode)
			const request = operation(transaction.objectStore(draftStoreName))
			request.onerror = () => reject(request.error ?? new Error('本地草稿操作失败'))
			request.onsuccess = () => resolve(request.result as T)
			transaction.onabort = () => reject(transaction.error ?? new Error('本地草稿事务失败'))
		})
	}
	finally {
		database.close()
	}
}

export function useAdminDraft() {
	const saving = ref(false)
	const error = ref<string | null>(null)
	const lastSavedAt = ref<string | null>(null)

	async function load(path: string, sha: string | null | undefined): Promise<AdminArticleDraft | null> {
		try {
			return await withDraftStore('readonly', store => store.get(adminDraftKey(path, sha))) as AdminArticleDraft | null
		}
		catch (cause) {
			error.value = cause instanceof Error ? cause.message : '本地草稿读取失败'
			return null
		}
	}

	async function save(document: ArticleDocument) {
		saving.value = true
		error.value = null
		try {
			const draft: AdminArticleDraft = {
				key: adminDraftKey(document.path, document.sha),
				document: cloneArticleDocument(document),
				updatedAt: new Date().toISOString(),
			}
			await withDraftStore<IDBValidKey>('readwrite', store => store.put(draft))
			lastSavedAt.value = draft.updatedAt
		}
		catch (cause) {
			error.value = cause instanceof Error ? cause.message : '本地草稿保存失败'
			throw cause
		}
		finally {
			saving.value = false
		}
	}

	async function remove(path: string, sha: string | null | undefined) {
		try {
			await withDraftStore<undefined>('readwrite', store => store.delete(adminDraftKey(path, sha)))
			lastSavedAt.value = null
		}
		catch (cause) {
			error.value = cause instanceof Error ? cause.message : '本地草稿清理失败'
		}
	}

	return { saving, error, lastSavedAt, load, save, remove }
}
