import { visit } from 'unist-util-visit'

export default function remarkMusic() {
	return (tree) => {
		visit(tree, 'code', (node, index, parent) => {
			if (node.lang !== 'music-abc' || !parent || index === undefined)
				return

			parent.children?.splice(index, 1, {
				type: 'musicScoreCodeBlock',
				children: [],
				data: {
					hName: 'music-score',
					hProperties: {
						abc: node.value,
					},
				},
			})
		})
	}
}
