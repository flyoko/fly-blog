import type { ReadTimeResults } from 'reading-time'
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { defineCollection } from '@nuxt/content'
import { defineSitemapSchema } from '@nuxtjs/sitemap/content'
import { z } from 'zod'
import blogConfig from './blog.config'
import { isDraftFrontmatter } from './shared/content/drafts'

const contentRoot = resolve('./content')

function collectDraftContentFiles(directory = contentRoot): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const absolutePath = resolve(directory, entry.name)
		if (entry.isDirectory())
			return collectDraftContentFiles(absolutePath)
		if (!entry.isFile() || !entry.name.endsWith('.md'))
			return []
		if (!isDraftFrontmatter(readFileSync(absolutePath, 'utf8')))
			return []
		return [relative(contentRoot, absolutePath).split(sep).join('/')]
	})
}

// 静态站点会公开 Content 数据库，因此草稿必须在入库前排除，而不只是查询时隐藏。
const draftContentFiles = collectDraftContentFiles()

type ArticleType = keyof typeof blogConfig.article.types
// 文章类型已在 blog.config 中定义，此处使用 any 类型绕过 zod 类型验证
const articleTypes = Object.keys(blogConfig.article.types) as any

export interface ArticleSchema {
	title?: string
	description?: string
	summary?: string
	avatar?: string
	updatedAt?: string
	author?: string
	date?: string
	updated?: string
	published?: string
	categories?: string[]
	tags?: string[]
	type?: ArticleType

	image?: string
	recommend?: number
	references?: { title?: string, link?: string }[]
	/** TODO */
	draft?: boolean
	permalink?: string

	readingTime?: ReadTimeResults
}

const articleSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	summary: z.string().optional(),
	avatar: z.string().url().optional(),
	updatedAt: z.string().optional(),
	author: z.string().optional(),
	date: z.string().optional(),
	updated: z.string().optional(),
	published: z.string().optional(),
	categories: z.array(z.string()).default([blogConfig.defaultCategory]),
	tags: z.array(z.string()).default([]),
	type: z.enum(articleTypes).optional().default(articleTypes[0]),

	image: z.string().optional(),
	recommend: z.number().optional(),
	references: z.array(z.object({
		title: z.string().optional(),
		link: z.string().optional(),
	})).optional(),
	draft: z.boolean().default(false),
	permalink: z.string().optional(),

	readingTime: z.object({
		text: z.string(),
		minutes: z.number(),
		time: z.number(),
		words: z.number(),
	}),
}) satisfies z.ZodType<ArticleSchema>

export const collections = {
	content: defineCollection({
		source: {
			include: '**',
			exclude: draftContentFiles,
		},
		type: 'page',
		schema: articleSchema.extend({
			sitemap: defineSitemapSchema({
				name: 'content',
				onUrl: (url, entry) => {
					const lastmod = (entry.updated || entry.published || entry.date) as string | undefined
					if (lastmod)
						url.lastmod = new Date(lastmod).toLocaleDateString('sv')
				},
				z,
			}),
		}),
	}),
}
