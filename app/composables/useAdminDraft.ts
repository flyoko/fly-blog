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

export type MarkdownEdit
	= | { type: 'wrap', before: string, after: string, placeholder: string }
		| { type: 'line-prefix', prefix: string, placeholder: string }
		| { type: 'block', before: string, after: string, placeholder: string }
		| { type: 'insert', value: string }

export interface MarkdownEditResult {
	body: string
	selectionStart: number
	selectionEnd: number
}

export interface MarkdownHistorySnapshot {
	body: string
	selectionStart: number
	selectionEnd: number
}

export interface MarkdownHistoryState {
	entries: MarkdownHistorySnapshot[]
	index: number
	lastGroup: string | null
	lastRecordedAt: number
}

export interface MarkdownHistoryRecordOptions {
	group?: string | null
	timestamp?: number
	mergeWindowMs?: number
	limit?: number
}

function normalizeSelection(body: string, selectionStart: number, selectionEnd: number) {
	const start = Math.max(0, Math.min(selectionStart, body.length))
	const end = Math.max(start, Math.min(selectionEnd, body.length))
	return { start, end }
}

function replaceMarkdownSelection(
	body: string,
	start: number,
	end: number,
	replacement: string,
	selectionStart: number,
	selectionEnd: number,
): MarkdownEditResult {
	return {
		body: `${body.slice(0, start)}${replacement}${body.slice(end)}`,
		selectionStart,
		selectionEnd,
	}
}

export function applyMarkdownEdit(
	body: string,
	selectionStart: number,
	selectionEnd: number,
	edit: MarkdownEdit,
): MarkdownEditResult {
	const { start, end } = normalizeSelection(body, selectionStart, selectionEnd)
	const selected = body.slice(start, end)

	if (edit.type === 'insert') {
		const cursor = start + edit.value.length
		return replaceMarkdownSelection(body, start, end, edit.value, cursor, cursor)
	}

	const content = selected || edit.placeholder

	if (edit.type === 'line-prefix') {
		const replacement = content
			.split('\n')
			.map(line => `${edit.prefix}${line}`)
			.join('\n')
		const resultStart = selected ? start : start + edit.prefix.length
		const resultEnd = selected ? start + replacement.length : resultStart + content.length
		return replaceMarkdownSelection(body, start, end, replacement, resultStart, resultEnd)
	}

	if (edit.type === 'wrap') {
		const replacement = `${edit.before}${content}${edit.after}`
		const resultStart = start + edit.before.length
		return replaceMarkdownSelection(body, start, end, replacement, resultStart, resultStart + content.length)
	}

	const left = body.slice(0, start)
	const right = body.slice(end)
	const leading = left && !left.endsWith('\n\n')
		? (left.endsWith('\n') ? '\n' : '\n\n')
		: ''
	const trailing = right && !right.startsWith('\n\n')
		? (right.startsWith('\n') ? '\n' : '\n\n')
		: ''
	const replacement = `${leading}${edit.before}${content}${edit.after}${trailing}`
	const resultStart = start + leading.length + edit.before.length
	return replaceMarkdownSelection(body, start, end, replacement, resultStart, resultStart + content.length)
}

export function createMarkdownHistory(
	body: string,
	selectionStart = body.length,
	selectionEnd = selectionStart,
): MarkdownHistoryState {
	const selection = normalizeSelection(body, selectionStart, selectionEnd)
	return {
		entries: [{ body, selectionStart: selection.start, selectionEnd: selection.end }],
		index: 0,
		lastGroup: null,
		lastRecordedAt: 0,
	}
}

export function updateMarkdownHistorySelection(
	history: MarkdownHistoryState,
	selectionStart: number,
	selectionEnd = selectionStart,
): MarkdownHistoryState {
	const current = history.entries[history.index]
	if (!current)
		return history
	const selection = normalizeSelection(current.body, selectionStart, selectionEnd)
	const entries = history.entries.slice()
	entries[history.index] = {
		...current,
		selectionStart: selection.start,
		selectionEnd: selection.end,
	}
	return { ...history, entries }
}

export function recordMarkdownHistory(
	history: MarkdownHistoryState,
	snapshot: MarkdownHistorySnapshot,
	options: MarkdownHistoryRecordOptions = {},
): MarkdownHistoryState {
	const timestamp = options.timestamp ?? Date.now()
	const mergeWindowMs = options.mergeWindowMs ?? 800
	const limit = options.limit ?? 200
	const group = options.group ?? null
	const selection = normalizeSelection(snapshot.body, snapshot.selectionStart, snapshot.selectionEnd)
	const normalizedSnapshot = {
		body: snapshot.body,
		selectionStart: selection.start,
		selectionEnd: selection.end,
	}
	const current = history.entries[history.index]

	if (current?.body === normalizedSnapshot.body) {
		return {
			...updateMarkdownHistorySelection(history, normalizedSnapshot.selectionStart, normalizedSnapshot.selectionEnd),
			lastGroup: group,
			lastRecordedAt: timestamp,
		}
	}

	const entries = history.entries.slice(0, history.index + 1)
	const canMerge = Boolean(
		group
		&& group === history.lastGroup
		&& timestamp - history.lastRecordedAt <= mergeWindowMs
		&& history.index === history.entries.length - 1,
	)

	if (canMerge && entries.length > 1)
		entries[entries.length - 1] = normalizedSnapshot
	else
		entries.push(normalizedSnapshot)

	const boundedEntries = entries.length > limit ? entries.slice(entries.length - limit) : entries
	return {
		entries: boundedEntries,
		index: boundedEntries.length - 1,
		lastGroup: group,
		lastRecordedAt: timestamp,
	}
}

export function stepMarkdownHistory(
	history: MarkdownHistoryState,
	direction: -1 | 1,
): { history: MarkdownHistoryState, snapshot: MarkdownHistorySnapshot } | null {
	const index = history.index + direction
	if (index < 0 || index >= history.entries.length)
		return null
	const nextHistory = {
		...history,
		index,
		lastGroup: null,
		lastRecordedAt: 0,
	}
	return {
		history: nextHistory,
		snapshot: nextHistory.entries[index]!,
	}
}

export function insertMacWindowBlock(
	body: string,
	selectionStart: number,
	selectionEnd: number,
): MarkdownEditResult {
	return applyMarkdownEdit(body, selectionStart, selectionEnd, {
		type: 'block',
		before: '::mac-window\n',
		after: '\n::',
		placeholder: '在这里填写窗口内容',
	})
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
