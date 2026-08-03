import type { FeedGroup } from '../app/types/feed'
// 友链检测 CLI 需要使用显式导入和相对路径
import { myFeed } from '../blog.config'

export default [
	{
		name: 'fly living',
		desc: '记录技术、学习与生活',
		entries: [myFeed],
	},
] satisfies FeedGroup[]
