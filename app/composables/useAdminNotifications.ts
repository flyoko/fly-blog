import type { AdminNoticeInput, AdminNoticeTone } from '#shared/admin/feedback'
import { toAdminUserMessage } from '#shared/admin/feedback'

export interface AdminNotice extends AdminNoticeInput {
	id: string
	createdAt: number
}

const defaultDurations: Record<AdminNoticeTone, number> = {
	info: 4200,
	success: 3600,
	warning: 6200,
	danger: 7600,
}

export function useAdminNotifications() {
	const notices = useState<AdminNotice[]>('admin-notifications', () => [])

	function remove(id: string) {
		notices.value = notices.value.filter(notice => notice.id !== id)
	}

	function show(input: AdminNoticeInput) {
		const duplicate = notices.value.find(notice => notice.tone === input.tone && notice.title === input.title && notice.message === input.message)
		if (duplicate)
			return duplicate.id

		const id = crypto.randomUUID()
		const notice: AdminNotice = {
			...input,
			id,
			createdAt: Date.now(),
		}
		notices.value = [...notices.value.slice(-3), notice]
		if (import.meta.client) {
			const duration = input.duration ?? defaultDurations[input.tone]
			if (duration > 0)
				window.setTimeout(remove, duration, id)
		}
		return id
	}

	function error(cause: unknown, fallback?: string, title = '操作没有完成') {
		return show({
			tone: 'danger',
			title,
			message: toAdminUserMessage(cause, fallback),
		})
	}

	return {
		notices,
		remove,
		show,
		error,
		info: (title: string, message?: string) => show({ tone: 'info', title, message }),
		success: (title: string, message?: string) => show({ tone: 'success', title, message }),
		warning: (title: string, message?: string) => show({ tone: 'warning', title, message }),
	}
}
