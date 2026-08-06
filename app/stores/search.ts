import { skipHydrate } from 'pinia'
import { LazyPopoverSearch } from '#components'

export const useSearchStore = defineStore('search', () => {
	// 搜索框应和侧边栏状态联动
	const layoutStore = useLayoutStore()
	const modalStore = useModalStore()

	const word = ref('')
	const debouncedWord = skipHydrate(refDebounced(word))

	const {
		open: _open,
		close: _close,
		status: modalStatus,
	} = modalStore.use(() => h(LazyPopoverSearch, {
		onClose: () => {
			_close()
			layoutStore.close()
		},
	}), {
		unique: true,
		duration: 200,
	})

	// 从外部调用时应该操作 layoutStore
	watch(() => layoutStore.state, (state) => {
		if (state !== 'search') {
			if (modalStatus.value === 'open')
				void _close()
			return
		}

		word.value = window.getSelection()?.toString().trim() || word.value
		_open()
	})

	return {
		word,
		debouncedWord,
	}
})
