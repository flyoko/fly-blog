export function fromHast(node) {
	return {
		props: node.properties,
		type: 'minimark',
		value: node.children.map(hastToMinimarkNode).filter(value => value !== undefined),
	}
}

function hastToMinimarkNode(input) {
	if (input.type === 'comment' || input.type === 'doctype')
		return undefined
	if (input.type === 'text' || input.type === 'raw')
		return input.value

	if (input.tagName === 'code' && input.properties?.className && input.properties.className.length === 0)
		delete input.properties.className

	return [
		input.tagName,
		input.properties || {},
		...(input.children || []).map(hastToMinimarkNode).filter(value => value !== undefined),
	]
}

export default function rehypeMetaSlots() {
	return (tree, file) => {
		file.data.slots ??= {}

		for (let index = 0; index < tree.children.length; index++) {
			const node = tree.children[index]
			if (node.type !== 'element' || !node.tagName.startsWith('meta-'))
				continue

			const metaName = node.tagName.slice('meta-'.length)
			file.data.slots[metaName] = fromHast(node)
			tree.children.splice(index, 1)
			index--
		}
	}
}
