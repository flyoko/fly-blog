export interface ArticlePreviewPage {
	path: string
	file?: string
	children?: ArticlePreviewPage[]
}

function isAdminRoute(path: string) {
	return path === '/admin' || path.startsWith('/admin/')
}

function isAdminPageFile(file?: string) {
	if (!file)
		return false
	const normalized = file.replaceAll('\\', '/')
	return /\/pages\/admin(?:\.vue|\/)/u.test(normalized)
}

export function filterArticlePreviewPages<T extends ArticlePreviewPage>(pages: readonly T[]): T[] {
	return pages.flatMap((page) => {
		if (isAdminRoute(page.path) || isAdminPageFile(page.file))
			return []

		if (!page.children?.length)
			return [page]

		return [{
			...page,
			children: filterArticlePreviewPages(page.children),
		} as T]
	})
}
