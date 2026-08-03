import { describe, expect, it } from 'vitest'
import { createArticlePath, parseArticle, serializeArticle } from '../src/features/articles/article-codec'

describe('article codec', () => {
	it('round-trips unknown frontmatter and normalizes category/tag defaults', () => {
		const source = `---
title: Hello
date: 2026-08-03
custom:
  nested: keep
---
# Body
`
		const article = parseArticle({ path: 'content/posts/2026/hello.md', sha: 'abc', content: source })
		expect(article.frontmatter).toMatchObject({
			title: 'Hello',
			date: '2026-08-03',
			categories: [],
			tags: [],
			custom: { nested: 'keep' },
		})
		const reparsed = parseArticle({
			path: article.path,
			sha: article.sha!,
			content: serializeArticle(article),
		})
		expect(reparsed).toEqual(article)
	})

	it('supports an empty body and stable serialization', () => {
		const article = parseArticle({
			path: 'content/posts/2026/empty.md',
			sha: 'abc',
			content: '---\ntitle: Empty\ntags: []\ncategories: []\n---\n',
		})
		expect(article.body).toBe('')
		expect(serializeArticle(article)).toBe(serializeArticle(article))
	})

	it('rejects invalid yaml and repository paths', () => {
		expect(() => parseArticle({
			path: '../secret.md',
			sha: 'abc',
			content: '---\ntitle: No\n---\n',
		})).toThrow()
		expect(() => parseArticle({
			path: 'content/posts/2026/bad.md',
			sha: 'abc',
			content: '---\ntitle: [broken\n---\n',
		})).toThrow()
	})

	it('creates only normalized post paths', () => {
		expect(createArticlePath({ year: 2026, slug: 'hello-world' }))
			.toBe('content/posts/2026/hello-world.md')
		expect(() => createArticlePath({ year: 2026, slug: '../hello' })).toThrow()
		expect(() => createArticlePath({ year: 1999, slug: 'hello' })).toThrow()
	})
})
