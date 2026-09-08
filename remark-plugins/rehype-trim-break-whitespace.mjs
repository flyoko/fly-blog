function trimBreakWhitespace(node) {
	if (!node || !Array.isArray(node.children))
		return

	for (let index = 0; index < node.children.length; index++) {
		const child = node.children[index]
		trimBreakWhitespace(child)

		if (child.type !== 'element' || child.tagName !== 'br')
			continue

		const next = node.children[index + 1]
		if (next?.type !== 'text' || typeof next.value !== 'string')
			continue

		const normalized = next.value.replace(/^\r?\n/u, '')
		if (normalized) {
			next.value = normalized
			continue
		}

		node.children.splice(index + 1, 1)
	}
}

// Markdown 的软换行/硬换行会生成 <br>，HAST 同时保留一个紧邻的换行文本节点。
// 文章正文为了保留连续普通空格使用 break-spaces；若不移除该冗余换行，
// 浏览器会把 <br> 与文本换行各渲染一次，视觉上就多出一整行空白。
export default function rehypeTrimBreakWhitespace() {
	return tree => trimBreakWhitespace(tree)
}
