import type { ArticleDocument } from '../../../../../shared/admin/articles'
import matter from 'gray-matter'
import { parse, stringify } from 'yaml'
import { articleDocumentSchema } from '../../../../../shared/admin/articles'
import { ApiError } from '../../lib/api-error'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

const yamlEngine = {
	parse: (value: string) => parse(value),
	stringify: (value: object) => stringify(value, {
		lineWidth: 0,
		sortMapEntries: true,
	}).trimEnd(),
}

export function parseArticle(input: { path: string, sha: string, content: string }): ArticleDocument {
	let parsed
	try {
		parsed = matter(input.content, {
			engines: { yaml: yamlEngine },
			language: 'yaml',
		})
	}
	catch {
		throw new ApiError('VALIDATION_FAILED', 400, 'Article frontmatter is not valid YAML')
	}
	if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data))
		throw new ApiError('VALIDATION_FAILED', 400, 'Article frontmatter must be an object')
	try {
		return articleDocumentSchema.parse({
			path: input.path,
			sha: input.sha,
			body: parsed.content.replace(/^\r?\n/u, ''),
			frontmatter: {
				...parsed.data,
				categories: Array.isArray(parsed.data.categories) ? parsed.data.categories : [],
				tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
			},
		})
	}
	catch (error) {
		throw new ApiError('VALIDATION_FAILED', 400, 'Article document is invalid', error)
	}
}

export function serializeArticle(document: ArticleDocument): string {
	const valid = articleDocumentSchema.parse(document)
	const frontmatter = yamlEngine.stringify(valid.frontmatter)
	return `---\n${frontmatter}\n---\n${valid.body}`
}

export function createArticlePath(input: { year: number, slug: string }): string {
	if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100)
		throw new ApiError('VALIDATION_FAILED', 400, 'Article year is invalid')
	if (!slugPattern.test(input.slug))
		throw new ApiError('VALIDATION_FAILED', 400, 'Article slug is invalid')
	return `content/posts/${input.year}/${input.slug}.md`
}
