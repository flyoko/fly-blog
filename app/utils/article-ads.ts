import type { ArticlePresentationConfig } from '#shared/admin/site-config'

export type ArticleHeaderAd = ArticlePresentationConfig['headerAds'][number]

export function isArticleHeaderAdDisplayable(ad: ArticleHeaderAd): boolean {
	if (!ad.enabled || !ad.title.trim() || !ad.image.trim())
		return false
	return ad.action === 'wechat'
		? Boolean(ad.wechatQr.trim())
		: Boolean(ad.href.trim())
}
