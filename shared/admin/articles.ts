import { z } from 'zod'

const articleRepositoryPathSchema = z.string()
	.min(1)
	.refine(path => path.startsWith('content/posts/'), 'Article path must be inside content/posts')
	.refine(path => path.endsWith('.md'), 'Article path must use the .md extension')
	.refine(path => !path.includes('\0'), 'Article path must not contain NUL bytes')
	.refine(path => !path.includes('\\'), 'Article path must use forward slashes')
	.refine(path => !path.split('/').includes('..'), 'Article path must not traverse directories')
	.refine(path => !path.includes('//'), 'Article path must not contain empty segments')

export const articleFrontmatterSchema = z.object({
	title: z.string().min(1).optional(),
	description: z.string().optional(),
	author: z.string().optional(),
	date: z.string().optional(),
	updated: z.string().optional(),
	published: z.string().optional(),
	categories: z.array(z.string().min(1)).optional(),
	tags: z.array(z.string().min(1)).optional(),
	type: z.string().min(1).optional(),
	image: z.string().optional(),
	recommend: z.number().optional(),
	references: z.array(z.object({
		title: z.string().optional(),
		link: z.string().optional(),
	})).optional(),
	draft: z.boolean().optional(),
	permalink: z.string().optional(),
}).passthrough()

export const articleDocumentSchema = z.object({
	path: articleRepositoryPathSchema,
	sha: z.string().min(1).nullable(),
	body: z.string(),
	frontmatter: articleFrontmatterSchema,
})

export const articleSaveRequestSchema = z.object({
	document: articleDocumentSchema,
	expectedSha: z.string().min(1).nullable().optional(),
	mode: z.enum(['direct', 'pull_request']),
	idempotencyKey: z.string().min(8).max(128),
})

export interface ArticleSummary {
	id: string
	path: string
	sha: string
	title: string
	description?: string
	date?: string
	updated?: string
	categories: string[]
	tags: string[]
	draft: boolean
}

export type ArticleDocument = z.infer<typeof articleDocumentSchema>

export function createNewArticlePath(input: { now?: Date, uniqueId?: string } = {}): string {
	const now = input.now ?? new Date()
	if (Number.isNaN(now.getTime()))
		throw new Error('Invalid article creation time')
	const pad = (value: number) => value.toString().padStart(2, '0')
	const timestamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		'-',
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
	].join('')
	const uniqueId = (input.uniqueId ?? crypto.randomUUID())
		.toLowerCase()
		.replace(/[^a-z0-9]/gu, '')
		.slice(0, 8)
	if (uniqueId.length < 6)
		throw new Error('Article unique id is too short')
	return articleRepositoryPathSchema.parse(`content/posts/${now.getFullYear()}/article-${timestamp}-${uniqueId}.md`)
}

function bytesToBinary(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes)
		binary += String.fromCharCode(byte)
	return binary
}

export function encodeArticleId(path: string): string {
	const validPath = articleRepositoryPathSchema.parse(path)
	return btoa(bytesToBinary(new TextEncoder().encode(validPath)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/u, '')
}

export function decodeArticleId(id: string): string {
	if (!/^[\w-]+$/u.test(id))
		throw new Error('Invalid article id')

	const base64 = id.replaceAll('-', '+').replaceAll('_', '/')
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
	const binary = atob(padded)
	const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
	return articleRepositoryPathSchema.parse(new TextDecoder().decode(bytes))
}
