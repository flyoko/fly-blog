export function getAdminDraftProtectionStorage(): Storage {
	if (!import.meta.client || typeof globalThis.localStorage === 'undefined')
		throw new Error('当前环境不支持本地草稿保护')
	return globalThis.localStorage
}
