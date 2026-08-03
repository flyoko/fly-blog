declare module '@xhacker/qmcwasm/QmcWasmBundle.js' {
	export interface QmcCrypto {
		HEAPU8: Uint8Array
		_malloc: (size: number) => number
		_free: (pointer: number) => void
		writeArrayToMemory: (data: Uint8Array, pointer: number) => void
		preDec: (pointer: number, size: number, extension: string) => number
		decBlob: (pointer: number, size: number, offset: number) => number
		getErr: () => string
		getSongId: () => string
	}

	export default function createQmcCrypto(): Promise<QmcCrypto>
}
