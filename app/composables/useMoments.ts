import type { MomentDto, MomentListDto } from '#shared/admin/moments'

export function useMomentsApi() {
	async function list(params: { page?: number, pageSize?: number, tag?: string, year?: number } = {}) {
		return $fetch<{ ok: true, data: MomentListDto }>('/api/moments', { query: params }).then(result => result.data)
	}

	async function get(id: string) {
		return $fetch<{ ok: true, data: MomentDto }>(`/api/moments/${encodeURIComponent(id)}`).then(result => result.data)
	}

	async function like(id: string, liked: boolean) {
		return $fetch<{ ok: true, data: { liked: boolean, likeCount: number } }>(`/api/moments/${encodeURIComponent(id)}/likes`, {
			method: liked ? 'DELETE' : 'POST',
			credentials: 'include',
		}).then(result => result.data)
	}

	return { list, get, like }
}
