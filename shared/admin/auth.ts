export interface AdminUser {
	id: string
	login: string
	avatarUrl: string
}

export interface AdminSessionDto {
	authenticated: boolean
	user?: AdminUser
	expiresAt?: string
}
