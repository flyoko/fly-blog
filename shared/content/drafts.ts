const draftFlagPattern = /^draft\s*:\s*(?:true|'true'|"true")\s*(?:#.*)?$/iu

/** 只把 frontmatter 中显式标记为 true 的文档视为草稿。 */
export function isDraftFrontmatter(source: string) {
	const lines = source.replace(/^\uFEFF/u, '').split(/\r?\n/u)
	if (lines[0]?.trim() !== '---')
		return false

	const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
	if (closingIndex < 0)
		return false

	return lines.slice(1, closingIndex).some(line => draftFlagPattern.test(line))
}
