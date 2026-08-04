const canonicalPublicOrigin = 'https://flyovo.cc.cd'
const pagesBackupHostname = 'fly-living.pages.dev'

export function resolvePublicApiUrl(pathname: `/api/${string}`, hostname: string): string {
	return hostname === pagesBackupHostname
		? `${canonicalPublicOrigin}${pathname}`
		: pathname
}
