export type PublicCacheNamespace = 'finance' | 'market'

interface PublicCacheVersionRow {
	version: number
}

export function preparePublicCacheVersionBump(
	db: D1Database,
	namespace: PublicCacheNamespace,
	updatedAt = new Date().toISOString(),
): D1PreparedStatement {
	return db.prepare(`
		INSERT INTO public_cache_versions (namespace, version, updated_at)
		VALUES (?, 1, ?)
		ON CONFLICT(namespace) DO UPDATE SET
			version = public_cache_versions.version + 1,
			updated_at = excluded.updated_at
	`).bind(namespace, updatedAt)
}

export async function bumpPublicCacheVersion(
	db: D1Database,
	namespace: PublicCacheNamespace,
	updatedAt = new Date().toISOString(),
): Promise<void> {
	await preparePublicCacheVersionBump(db, namespace, updatedAt).run()
}

export async function readPublicCacheVersion(
	db: D1Database,
	namespace: PublicCacheNamespace,
): Promise<string> {
	const row = await db.prepare(`
		SELECT version
		FROM public_cache_versions
		WHERE namespace = ?
	`).bind(namespace).first<PublicCacheVersionRow>()
	return `${namespace}:${row?.version || 0}`
}
