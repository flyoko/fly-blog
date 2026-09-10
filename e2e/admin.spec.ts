import type { Locator, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import {
	articleId,
	mockAdminApi,
	mockAuthenticatedAdmin,
} from './fixtures/admin-api'

const sampleQmcEkey = 'WkZKNldETndOVnJqRUpaQjFvNlFqa1FWMlpiSFN3LzJFYjAwcTErNHo5U1ZXWT0='

function writeUtf16Le(buffer: Buffer, offset: number, value: string, maxBytes: number) {
	for (let index = 0; index < value.length && index * 2 < maxBytes; index++)
		buffer.writeUInt16LE(value.charCodeAt(index), offset + index * 2)
}

function musicExBuffer(mediaFileName = 'F0M0000HJUZs40wWgK.mflac') {
	const audioBytes = 64
	const tagBytes = 0xC0
	const buffer = Buffer.alloc(audioBytes + tagBytes)
	buffer.fill(0x39, 0, audioBytes)
	buffer.writeUInt32LE(705944328, audioBytes)
	writeUtf16Le(buffer, audioBytes + 0x0C, '000HJUZs40wWgK', 60)
	writeUtf16Le(buffer, audioBytes + 0x48, mediaFileName, 100)
	buffer.writeUInt32LE(tagBytes, buffer.length - 16)
	buffer.writeUInt32LE(1, buffer.length - 12)
	buffer.write('musicex\0', buffer.length - 8, 'binary')
	return buffer
}

function encodeVarint(value: number) {
	const bytes: number[] = []
	let remaining = value
	do {
		let byte = remaining & 0x7F
		remaining = Math.floor(remaining / 128)
		if (remaining)
			byte |= 0x80
		bytes.push(byte)
	} while (remaining)
	return Buffer.from(bytes)
}

function encodeMmkvString(value: string) {
	const bytes = Buffer.from(value, 'utf8')
	return Buffer.concat([encodeVarint(bytes.length), bytes])
}

function qmcMmkvBuffer(name: string, ekey: string) {
	const value = encodeMmkvString(ekey)
	const body = Buffer.concat([
		Buffer.from([0]),
		encodeMmkvString(`/qqmusic/${name}`),
		encodeVarint(value.length),
		value,
	])
	const header = Buffer.alloc(4)
	header.writeUInt32LE(body.length)
	return Buffer.concat([header, body])
}

async function tabTo(page: Page, target: Locator, maxTabs = 60) {
	// Nuxt 页面切换完成后，异步数据可能仍在用骨架屏替换最终控件。
	// 先等待目标进入最终可见状态，避免在焦点顺序尚未稳定时消耗 Tab。
	await expect(target).toBeVisible()
	for (let index = 0; index < maxTabs; index++) {
		await page.keyboard.press('Tab')
		try {
			await expect(target).toBeFocused({ timeout: 100 })
			return
		}
		catch {
			// Keep using keyboard navigation until the target receives focus.
		}
	}
	throw new Error(`Unable to focus target after ${maxTabs} Tab presses`)
}

test.describe('admin desktop workflows', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'Desktop workflow coverage runs in the desktop project.')
	})

	test('admin core workflow publishes an article directly', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await expect(page.getByRole('heading', { name: /(早上好|下午好|晚上好|夜深了)，flyoko/u })).toBeVisible()
		await page.getByRole('link', { name: '文章', exact: true }).click()
		await page.getByRole('link', { name: '新建文章', exact: true }).click()
		await page.getByLabel('标题').fill('Cycle 1 test article')
		await page.getByLabel('Markdown 正文').fill('# Test\n\nPublished through the admin.')
		await page.getByRole('button', { name: '保存草稿' }).click()

		await expect.poll(() => capture.articleWrites.length).toBe(1)
		expect(capture.articleWrites[0]).toMatchObject({ mode: 'direct' })
		await expect(page).toHaveURL(/\/admin\/articles\//u)
	})

	test('finance content management hides and restores flash items', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/ai-news')
		await expect(page.getByRole('heading', { name: 'AI 阅闻' })).toBeVisible()
		await page.getByRole('tab', { name: /财经内容/u }).click()
		await expect(page.getByRole('heading', { name: '财经内容' })).toBeVisible()
		const macroItem = page.locator('.admin-finance-item').filter({ hasText: '美联储官员表示通胀仍需关注' })
		await macroItem.getByRole('button', { name: '隐藏' }).click()
		await expect(macroItem.getByText('已隐藏')).toBeVisible()
		expect(capture.financeWrites).toContainEqual({ action: 'hide', id: 'wallstreetcn-7x24:1001' })
		await page.getByLabel('展示状态').selectOption('hidden')
		await expect(page.locator('.admin-finance-item')).toHaveCount(1)
		await macroItem.getByRole('button', { name: '恢复公开' }).click()
		expect(capture.financeWrites).toContainEqual({ action: 'restore', id: 'wallstreetcn-7x24:1001' })
		await expect(page.getByText('隐藏 0')).toBeVisible()
	})

	test('article editor inserts repeatable macOS blocks and stays aligned at target widths', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')

		const editor = page.getByLabel('Markdown 正文')
		await editor.fill('窗口外开头\n\n选中窗口内容\n\n窗口外结尾')
		await editor.evaluate((element) => {
			const textarea = element as HTMLTextAreaElement
			const start = textarea.value.indexOf('选中窗口内容')
			textarea.focus()
			textarea.setSelectionRange(start, start + '选中窗口内容'.length)
		})
		await page.getByRole('button', { name: '插入 macOS 窗口' }).click()

		await expect(editor).toHaveValue(/::mac-window\n选中窗口内容\n::/u)
		await editor.fill(`${await editor.inputValue()}\n\n::mac-window\n第二个窗口\n::`)
		const previewWindows = page.locator('.admin-preview-content .article-window')
		await expect(previewWindows).toHaveCount(2)
		await expect(page.locator('.admin-preview-content')).toContainText('窗口外开头')
		await expect(page.locator('.admin-preview-content')).toContainText('窗口外结尾')
		const glassStyle = await previewWindows.first().evaluate((element) => {
			const style = getComputedStyle(element)
			return {
				backdropFilter: style.backdropFilter,
				backgroundImage: style.backgroundImage,
				borderColor: style.borderColor,
			}
		})
		expect(glassStyle.backdropFilter).not.toBe('none')
		expect(glassStyle.backgroundImage).toContain('gradient')
		expect(glassStyle.borderColor).not.toBe('rgba(0, 0, 0, 0)')

		await page.evaluate(() => document.documentElement.classList.add('dark'))
		const darkGlassStyle = await previewWindows.first().evaluate((element) => {
			const style = getComputedStyle(element)
			return { backdropFilter: style.backdropFilter, color: style.color, backgroundImage: style.backgroundImage }
		})
		expect(darkGlassStyle.backdropFilter).not.toBe('none')
		expect(darkGlassStyle.backgroundImage).toContain('gradient')
		expect(darkGlassStyle.color).not.toBe('rgb(23, 61, 64)')
		await page.evaluate(() => document.documentElement.classList.remove('dark'))

		for (const viewport of [
			{ width: 1440, height: 900 },
			{ width: 1024, height: 800 },
			{ width: 390, height: 844 },
		]) {
			await page.setViewportSize(viewport)
			const dimensions = await page.evaluate(() => {
				const content = document.querySelector<HTMLElement>('#admin-main-content')
				const rect = content?.getBoundingClientRect()
				return {
					clientWidth: document.documentElement.clientWidth,
					contentLeft: rect?.left ?? -1,
					contentRight: rect?.right ?? Number.POSITIVE_INFINITY,
					scrollWidth: document.documentElement.scrollWidth,
				}
			})
			expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
			expect(dimensions.contentLeft).toBeGreaterThanOrEqual(0)
			expect(dimensions.contentRight).toBeLessThanOrEqual(dimensions.clientWidth + 1)
		}
	})

	test('clicking preview content focuses the matching Markdown source position', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')
		const editor = page.getByLabel('Markdown 正文')
		const body = [
			'## 预览定位标题',
			'',
			'正文 **粗体定位目标** 继续',
			'',
			'- 第一项',
			'- 第二项定位目标',
			'',
			'> 引用定位目标',
			'',
			'| 列1 | 列2 |',
			'| --- | --- |',
			'| 表格定位目标 | B |',
			'',
			'```ts',
			'const previewTarget = 42',
			'```',
			'',
			'::copy-block',
			'复制块定位目标',
			'::',
			'',
			'::mac-window',
			'窗口定位目标',
			'::',
		].join('\n')
		await editor.fill(body)
		await expect(page.getByText('点击内容可定位正文')).toBeVisible()
		await expect(page.locator('.admin-preview-content h2')).toHaveText('预览定位标题')

		const assertPreviewJump = async (locator: Locator, text: string) => {
			await locator.click()
			await expect(editor).toBeFocused()
			const selection = await editor.evaluate((element) => {
				const textarea = element as HTMLTextAreaElement
				return { start: textarea.selectionStart, end: textarea.selectionEnd }
			})
			expect(selection).toEqual({ start: body.indexOf(text), end: body.indexOf(text) })
		}

		await assertPreviewJump(page.locator('.admin-preview-content strong'), '粗体定位目标')
		await assertPreviewJump(page.locator('.admin-preview-content li').filter({ hasText: '第二项定位目标' }), '第二项定位目标')
		await assertPreviewJump(page.locator('.admin-preview-content blockquote'), '引用定位目标')
		await assertPreviewJump(page.locator('.admin-preview-content td').filter({ hasText: '表格定位目标' }), '表格定位目标')
		await assertPreviewJump(page.locator('.admin-preview-content .z-codeblock pre'), 'const previewTarget = 42')
		await assertPreviewJump(page.locator('.admin-preview-content .article-copy-block-body').getByText('复制块定位目标'), '复制块定位目标')
		await assertPreviewJump(page.locator('.admin-preview-content .article-window-body').getByText('窗口定位目标'), '窗口定位目标')

		await page.setViewportSize({ width: 390, height: 844 })
		await page.getByRole('button', { name: '预览', exact: true }).click()
		await page.locator('.admin-preview-content h2').click()
		await expect(page.getByRole('button', { name: '写作', exact: true })).toHaveAttribute('aria-pressed', 'true')
		await expect(editor).toBeFocused()
	})

	test('article editor preserves repeated spaces, renders pasted formulas, and fills the writing pane', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')
		const editor = page.getByLabel('Markdown 正文')

		await editor.fill('空格A   空格B')
		const prose = page.locator('.admin-preview-content p').filter({ hasText: '空格A' })
		await expect(prose).toBeVisible()
		const spacing = await prose.evaluate(element => ({
			text: element.textContent,
			whiteSpace: getComputedStyle(element).whiteSpace,
		}))
		expect(spacing.text).toContain('空格A   空格B')
		expect(spacing.whiteSpace).toBe('break-spaces')

		await page.getByRole('button', { name: '文字颜色' }).click()
		const layout = await editor.evaluate((element) => {
			const textarea = element as HTMLTextAreaElement
			const label = textarea.closest('label')!
			const title = label.querySelector(':scope > span')!
			const pane = label.closest('.admin-editor-pane')!
			const editorRect = textarea.getBoundingClientRect()
			const titleRect = title.getBoundingClientRect()
			const paneRect = pane.getBoundingClientRect()
			return {
				gapAfterTitle: editorRect.top - titleRect.bottom,
				bottomGap: paneRect.bottom - editorRect.bottom,
				height: editorRect.height,
			}
		})
		expect(layout.gapAfterTitle).toBeLessThan(24)
		expect(layout.bottomGap).toBeLessThan(32)
		expect(layout.height).toBeGreaterThan(280)

		const formulaHtml = String.raw`
			<p>公式：<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">cos(A,B)=A·B//A//B//</span></span></p>
			<div class="katex-display"><span class="katex"><span class="katex-mathml"><math display="block"><semantics><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">E = mc²</span></span></div>
		`
		await editor.fill('')
		await editor.focus()
		await editor.evaluate((element, html) => {
			const data = new DataTransfer()
			data.setData('text/html', html)
			data.setData('text/plain', 'formula')
			element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
		}, formulaHtml)

		await expect(editor).toHaveValue(String.raw`公式：$\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}$

$$
E=mc^2
$$`)
		await expect(page.locator('.admin-preview-content .katex')).toHaveCount(2)
		await expect(page.locator('.admin-preview-content')).not.toContainText('A·B//A//B//')
		await expect(page.locator('.admin-preview-content .katex-mathml').first()).toHaveCSS('position', 'absolute')
		await expect(page.locator('.admin-preview-content .katex-mathml').first()).toHaveCSS('height', '1px')

		await editor.fill('')
		const plainFormulaPrevented = await editor.evaluate((element) => {
			const data = new DataTransfer()
			data.setData('text/plain', String.raw`\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}`)
			const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
			element.dispatchEvent(event)
			return event.defaultPrevented
		})
		expect(plainFormulaPrevented).toBe(true)
		await expect(editor).toHaveValue(String.raw`$$
\cos(A,B)=\frac{A \cdot B}{\|A\|\|B\|}
$$`)
		await expect(page.locator('.admin-preview-content .katex-display')).toBeVisible()
	})

	test('article editor renders single returns and supports undo across macOS formatting', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')
		const editor = page.getByLabel('Markdown 正文')

		await editor.click()
		await page.keyboard.type('第一行')
		await page.keyboard.press('Enter')
		await page.keyboard.type('第二行')
		await expect(page.locator('.admin-preview-content br')).toHaveCount(1)
		await editor.press('Control+z')
		await expect(editor).toHaveValue('第一行\n')
		await editor.press('Control+Shift+z')
		await expect(editor).toHaveValue('第一行\n第二行')

		await editor.fill('::mac-window\n窗口粗体\n::')
		await editor.evaluate((element) => {
			const textarea = element as HTMLTextAreaElement
			const start = textarea.value.indexOf('窗口粗体')
			textarea.focus()
			textarea.setSelectionRange(start, start + '窗口粗体'.length)
		})
		await page.getByRole('button', { name: '粗体' }).click()
		const strong = page.locator('.admin-preview-content .article-window strong')
		await expect(strong).toHaveText('窗口粗体')
		await expect(strong).toHaveCSS('font-weight', /^(700|750|800)$/u)
		await editor.press('Control+z')
		await expect(editor).toHaveValue('::mac-window\n窗口粗体\n::')
	})

	test('existing public article is reported as already published instead of failing a duplicate publish', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto(`/admin/articles/${articleId}`)

		await expect(page.getByText('已公开', { exact: true })).toBeVisible()
		await expect(page.getByRole('button', { name: '已发布' })).toBeDisabled()
		await page.keyboard.press('Control+s')
		await expect(page.getByText('文章已经公开，当前内容与线上版本一致。', { exact: true })).toBeVisible()
		expect(capture.articleWrites).toHaveLength(0)

		await page.getByLabel('Markdown 正文').fill('# Existing article\n\n新增内容')
		await expect(page.getByText('公开文章有未发布改动', { exact: true })).toBeVisible()
		await expect(page.getByRole('button', { name: '发布更新' })).toBeEnabled()
	})

	test('live preview remounts stateful code blocks when markdown changes', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')
		const editor = page.getByLabel('Markdown 正文')
		const codeBlock = page.locator('.admin-preview-content pre').first()

		await editor.fill('```text\nSHA256(file)\n```')
		await expect(codeBlock).toContainText('SHA256(file)')

		await editor.fill('```text\nSHA256(file)\n或者:\ncontentHash\n```')
		await expect(codeBlock).toContainText('或者:')
		await expect(codeBlock).toContainText('contentHash')
		await expect(codeBlock.locator('.line')).toHaveCount(3)
	})

	test('homepage WeChat ads validate inline and submit contact details', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/settings')
		await page.getByRole('tab', { name: /首页广告/u }).click()
		await page.getByRole('button', { name: '添加广告' }).click()
		await page.getByLabel('广告标题').fill('微信联系 fly')
		await page.getByLabel('横幅图片').fill('/media/banner.webp')
		await page.getByLabel('广告动作').selectOption('wechat')
		await page.getByLabel('启用这条广告').check()

		await page.getByRole('button', { name: '保存首页广告并预览' }).click()
		await expect(page.getByText('启用微信广告前请填写微信二维码。')).toBeVisible()
		await expect(page.getByLabel('微信二维码')).toBeFocused()
		expect(capture.configWrites).toHaveLength(0)

		await page.getByLabel('微信二维码').fill('/media/wechat-qr.webp')
		await page.getByLabel('微信号').fill('fly-contact')
		await page.getByLabel('联系提示').fill('请备注博客广告')
		await page.getByRole('button', { name: '保存首页广告并预览' }).click()
		await expect.poll(() => capture.configWrites.length).toBe(1)
		expect(capture.configWrites[0]).toMatchObject({
			kind: 'article',
			content: {
				headerAds: [expect.objectContaining({
					action: 'wechat',
					enabled: true,
					title: '微信联系 fly',
					image: '/media/banner.webp',
					wechatQr: '/media/wechat-qr.webp',
					wechatId: 'fly-contact',
					wechatNote: '请备注博客广告',
				})],
			},
		})
	})

	test('configuration changes create a controlled pull request', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/settings')
		await expect(page.getByText(/已读取线上配置/u)).toBeVisible()
		await page.getByRole('button', { name: '添加分类' }).click()
		await page.getByLabel('名称').last().fill('浏览器测试')
		await page.getByRole('button', { name: '保存分类并预览' }).click()
		await expect(page.locator('.admin-pr-result').filter({ hasText: '预览任务已创建' })).toBeVisible()
		await expect.poll(() => capture.configWrites.length).toBe(1)
		expect(capture.configWrites[0]).toMatchObject({ kind: 'categories' })
		expect(capture.configWrites[0]).not.toHaveProperty('repositoryPath')
	})

	test('media upload keeps successes when another file fails', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { mediaPartialFailure: true })
		await page.goto('/admin/media')
		await page.locator('input[type="file"]').setInputFiles([
			{ name: 'valid.webp', mimeType: 'image/webp', buffer: Buffer.from('RIFFmockWEBP') },
			{ name: 'invalid.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('not-media') },
		])
		await expect(page.getByText('已成功上传 1 个文件。')).toBeVisible()
		await expect(page.getByText('部分文件上传失败')).toBeVisible()
		await expect(page.getByText(/invalid\.exe/u)).toBeVisible()
	})

	test('music upload keeps QMCv2 input local and uploads only standard audio', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/media')
		await page.getByRole('button', { name: '音乐文件' }).click()
		const input = page.locator('input[type="file"][multiple]')

		await input.setInputFiles({
			name: 'plain.mp3',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0]),
		})
		await expect.poll(() => capture.mediaUploads).toBe(1)
		expect(capture.mediaUploadBodies[0]).toContain('plain.mp3')
		await expect(page.getByText('已成功上传 1 个文件。')).toBeVisible()

		await input.setInputFiles({
			name: 'synthetic.mgg',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from('synthetic-invalid-input'),
		})
		await expect(page.getByText('解密结果不是可识别的标准音频，未上传该文件。')).toBeVisible({ timeout: 15_000 })
		expect(capture.mediaUploads).toBe(1)
		expect(capture.mediaUploadBodies.join('\n')).not.toContain('synthetic.mgg')
		await expect(page.getByText(/本人拥有、已获授权或可合法公开播放/u)).toBeVisible()

		await input.setInputFiles([
			{
				name: 'unsupported.ncm',
				mimeType: 'application/octet-stream',
				buffer: Buffer.from('unsupported'),
			},
			{
				name: 'plain.ogg',
				mimeType: 'application/octet-stream',
				buffer: Buffer.from('OggS\u0000standard'),
			},
		])
		await expect.poll(() => capture.mediaUploads).toBe(2)
		expect(capture.mediaUploadBodies.at(-1)).toContain('plain.ogg')
		expect(capture.mediaUploadBodies.at(-1)).not.toContain('unsupported.ncm')
		await expect(page.getByText('部分文件上传失败')).toBeVisible()
		await expect(page.getByText(/unsupported\.ncm/u)).toBeVisible()
	})

	test('music upload converts QMC in a Worker before upload', async ({ page }) => {
		await page.addInitScript(() => {
			class SuccessfulQmcWorker {
				onmessage: ((event: MessageEvent) => void) | null = null
				onerror: ((event: ErrorEvent) => void) | null = null

				postMessage(message: { id: string }) {
					window.setTimeout(() => {
						this.onmessage?.(new MessageEvent('message', {
							data: { type: 'stage', id: message.id, stage: 'decrypting' },
						}))
					}, 50)
					window.setTimeout(() => {
						this.onmessage?.(new MessageEvent('message', {
							data: { type: 'progress', id: message.id, processedBytes: 1, totalBytes: 2 },
						}))
					}, 100)
					window.setTimeout(() => {
						const bytes = new TextEncoder().encode('OggS\u0000converted')
						this.onmessage?.(new MessageEvent('message', {
							data: { type: 'success', id: message.id, buffer: bytes.buffer, songId: null, usedMediaKey: false },
						}))
					}, 2_000)
				}

				terminate() {}
			}
			Object.defineProperty(window, 'Worker', {
				configurable: true,
				writable: true,
				value: SuccessfulQmcWorker,
			})
		})
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/media')
		await page.getByRole('button', { name: '音乐文件' }).click()
		await page.locator('input[type="file"][multiple]').setInputFiles({
			name: 'convertible.mgg',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from('encrypted-input'),
		})
		await expect(page.getByText('正在本地解密', { exact: true })).toBeVisible()
		await expect(page.locator('.admin-music-import-progress progress')).toHaveAttribute('value', '50')
		await expect.poll(() => capture.mediaUploads).toBe(1)
		expect(capture.mediaUploadBodies[0]).toContain('convertible.ogg')
		expect(capture.mediaUploadBodies[0]).not.toContain('convertible.mgg')
		await expect(page.getByText('convertible.mgg → convertible.ogg')).toBeVisible()
	})

	test('MusicEx import reads a raw MMKV key file in memory and never uploads it or the media key', async ({ page }) => {
		await page.addInitScript(() => {
			class SuccessfulMusicExWorker {
				onmessage: ((event: MessageEvent) => void) | null = null
				onerror: ((event: ErrorEvent) => void) | null = null

				postMessage(message: { id: string, mediaKeys?: Array<[string, string]> }) {
					const mediaKey = message.mediaKeys?.find(([name]) => name === 'F0M0000HJUZs40wWgK.mflac')?.[1] ?? null
					Object.assign(window, { __musicExMediaKey: mediaKey })
					window.setTimeout(() => {
						this.onmessage?.(new MessageEvent('message', {
							data: { type: 'stage', id: message.id, stage: 'decrypting' },
						}))
						const bytes = new TextEncoder().encode('fLaCconverted')
						this.onmessage?.(new MessageEvent('message', {
							data: { type: 'success', id: message.id, buffer: bytes.buffer, songId: null, usedMediaKey: true },
						}))
					}, 100)
				}

				terminate() {}
			}
			Object.defineProperty(window, 'Worker', {
				configurable: true,
				writable: true,
				value: SuccessfulMusicExWorker,
			})
		})
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/media')
		await page.getByRole('button', { name: '音乐文件' }).click()
		await page.getByText('MusicEx 加密文件兼容（高级）', { exact: true }).click()
		await page.getByRole('button', { name: '导入兼容密钥数据库' }).click()
		await page.locator('input[type="file"]:not([multiple])').setInputFiles({
			name: 'MMKVStreamEncryptId',
			mimeType: 'application/octet-stream',
			buffer: qmcMmkvBuffer('F0M0000HJUZs40wWgK.mflac', sampleQmcEkey),
		})
		await expect(page.getByRole('status').filter({ hasText: '已加载 1 条本机媒体密钥，仅保留在当前浏览器标签页内存。' })).toBeVisible()

		await page.locator('input[type="file"][multiple]').setInputFiles({
			name: 'musicex.mflac',
			mimeType: 'application/octet-stream',
			buffer: musicExBuffer(),
		})
		await expect.poll(() => capture.mediaUploads).toBe(1)
		expect(capture.mediaUploadBodies[0]).toContain('musicex.flac')
		expect(capture.mediaUploadBodies[0]).not.toContain('MMKVStreamEncryptId')
		expect(capture.mediaUploadBodies[0]).not.toContain(sampleQmcEkey)
		expect(await page.evaluate(() => (window as typeof window & { __musicExMediaKey?: string }).__musicExMediaKey)).toBe(sampleQmcEkey)

		await page.getByRole('button', { name: '移除本机密钥' }).click()
		await expect(page.getByRole('status').filter({ hasText: '已从当前浏览器标签页内存移除本机密钥。' })).toBeVisible()
		await expect(page.getByRole('button', { name: '移除本机密钥' })).toHaveCount(0)
	})

	test('cancelling QMC conversion stops the batch before upload', async ({ page }) => {
		await page.addInitScript(() => {
			class PendingQmcWorker {
				onmessage: ((event: MessageEvent) => void) | null = null
				onerror: ((event: ErrorEvent) => void) | null = null

				postMessage() {}
				terminate() {}
			}
			Object.defineProperty(window, 'Worker', {
				configurable: true,
				writable: true,
				value: PendingQmcWorker,
			})
		})
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/media')
		await page.getByRole('button', { name: '音乐文件' }).click()
		await page.locator('input[type="file"][multiple]').setInputFiles({
			name: 'pending.mgg',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from('pending-input'),
		})
		await page.getByRole('button', { name: '取消本次处理' }).click()
		await expect(page.getByText('已取消本次音乐文件处理。')).toBeVisible()
		expect(capture.mediaUploads).toBe(0)
	})

	test('media lifecycle supports trash, restore, and guarded permanent deletion', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/media')

		await page.getByRole('button', { name: '移入回收站' }).click()
		const trashDialog = page.getByRole('dialog', { name: '移入回收站' })
		await expect(trashDialog).toBeVisible()
		await trashDialog.getByRole('button', { name: '移入回收站' }).click()
		await expect.poll(() => capture.mediaActions).toContainEqual({
			method: 'DELETE',
			path: '/api/admin/media/media-1',
		})

		await page.getByRole('button', { name: '回收站', exact: true }).click()
		await page.getByRole('button', { name: '恢复媒体' }).click()
		await expect.poll(() => capture.mediaActions).toContainEqual({
			method: 'POST',
			path: '/api/admin/media/media-1/restore',
		})

		await page.getByRole('button', { name: '永久删除' }).click()
		const deleteDialog = page.getByRole('dialog', { name: '永久删除媒体' })
		await deleteDialog.getByPlaceholder('DELETE').fill('DELETE')
		await deleteDialog.getByRole('button', { name: '永久删除' }).click()
		await expect.poll(() => capture.mediaActions).toContainEqual({
			method: 'DELETE',
			path: '/api/admin/media/media-1/permanent',
		})
	})

	test('moment withdrawal and backup restore require a fresh path-bound preview', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/moments')

		await page.getByRole('button', { name: /A deterministic Cycle 2 moment/u }).click()
		await page.getByRole('button', { name: '撤回' }).click()
		await expect.poll(() => capture.momentWrites.length).toBe(1)
		expect(capture.momentWrites[0]).toMatchObject({ expectedVersion: 2 })
		await expect(page.getByText('瞬间已撤回。')).toBeVisible()

		await page.getByRole('button', { name: '备份与恢复' }).click()
		const pathInput = page.getByLabel('快照仓库路径')
		await page.getByRole('button', { name: '恢复预检' }).click()
		await expect(page.getByLabel('恢复确认')).toBeVisible()

		const replacementPath = 'backups/moments/2026/08/2026-08-04.json'
		await pathInput.fill(replacementPath)
		await expect(page.getByLabel('恢复确认')).not.toBeVisible()
		await expect(page.getByRole('button', { name: '确认恢复' })).toBeDisabled()

		await page.getByRole('button', { name: '恢复预检' }).click()
		await page.getByLabel('恢复确认').fill('RESTORE')
		await page.getByRole('button', { name: '确认恢复' }).click()
		await expect(page.getByText('瞬间快照已恢复。')).toBeVisible()
		await expect.poll(() => capture.momentBackupWrites).toContainEqual({
			path: '/api/admin/moment-backups/restore',
			body: { path: replacementPath, confirmation: 'RESTORE' },
		})
	})

	test('article conflict preserves the local draft and exposes recovery choices', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page, { articleConflict: true })
		await page.goto('/admin/articles')
		await page.getByRole('link', { name: /Cycle 1 article/u }).click()
		await expect(page).toHaveURL(`/admin/articles/${articleId}`)
		await page.getByLabel('Markdown 正文').fill('# Local conflicting edit')
		await page.getByRole('button', { name: '发布文章' }).click()
		await expect(page.getByText('远端文章已经变化', { exact: true })).toBeVisible()
		await expect(page.getByRole('button', { name: '重新加载远端' })).toBeVisible()
		await page.getByRole('button', { name: '比较原始 Markdown' }).click()
		const comparison = page.getByRole('dialog', { name: '原始 Markdown' })
		await expect(comparison).toContainText('# Local conflicting edit')
		await expect(comparison).toContainText('# Remote article changed')
		await comparison.getByRole('button', { name: '关闭' }).click()
		await page.getByRole('button', { name: '改用 PR 发布' }).click()
		await expect.poll(() => capture.articleWrites).toHaveLength(2)
		expect(capture.articleWrites[1]).toMatchObject({ mode: 'pull_request', expectedSha: 'article-sha-2', document: { sha: 'article-sha-2' } })
	})

	test('review detail exposes checks, preview, and guarded merge', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/reviews')
		await page.getByRole('button').filter({ hasText: 'categories.json' }).click()
		await expect(page.getByText('类型、测试和构建检查已通过。')).toBeVisible()
		await page.getByText('发布技术详情', { exact: true }).click()
		await expect(page.locator('.admin-review-file code').filter({ hasText: 'config/taxonomy/categories.json' })).toBeVisible()
		await expect(page.locator('.admin-release-technical-meta code').filter({ hasText: 'head-sha-1' }).first()).toBeVisible()
		await expect(page.locator('.admin-review-file pre')).toContainText('@@ -1 +1 @@')
		await expect(page.getByRole('link', { name: '打开完整预览' })).toHaveAttribute('href', 'https://preview.example')
		await page.getByRole('button', { name: '确认上线' }).click()
		const mergeDialog = page.getByRole('dialog')
		await expect(mergeDialog.getByRole('textbox')).toHaveCount(0)
		await mergeDialog.getByRole('button', { name: '确认上线' }).click()
		await expect(mergeDialog).not.toBeVisible()
	})

	test('visitor analytics dashboard supports insights, privacy reveal, filters, and CSV export', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/analytics')

		await expect(page.getByRole('heading', { name: '访问分析', exact: true })).toBeVisible()
		await expect.poll(() => capture.analyticsVisitorPageSizes[0]).toBe(10)
		const kpiGrid = page.locator('.admin-analytics-kpis')
		await expect(kpiGrid.getByText('248', { exact: true }).first()).toBeVisible()
		await expect(kpiGrid.getByText('91', { exact: true }).first()).toBeVisible()
		await expect(page.getByRole('img', { name: /访问趋势/u })).toBeVisible()
		await expect(page.getByText('欢迎来到 fly living')).toBeVisible()
		await expect(page.getByText('美国 · 加利福尼亚州 · 旧金山', { exact: true }).first()).toBeVisible()
		await expect(page.getByText('中国 · 浙江省 · 杭州市', { exact: true }).first()).toBeVisible()
		await expect(page.getByText('203.0.113.xxx')).toBeVisible()

		await page.getByRole('button', { name: '查看完整 IP' }).click()
		await expect(page.getByText('203.0.113.42')).toBeVisible()
		await expect.poll(() => capture.analyticsIpViews).toBe(1)
		await page.getByRole('button', { name: '隐藏完整 IP' }).click()
		await expect(page.getByText('203.0.113.42')).not.toBeVisible()

		await page.getByLabel('流量类型').selectOption('bot')
		await page.getByRole('button', { name: '筛选' }).click()
		const visitorsPanel = page.locator('.admin-analytics-visitors-panel')
		await expect(visitorsPanel.getByText('bot:google')).toBeVisible()
		const botRow = visitorsPanel.getByRole('row', { name: /bot:google/u })
		await expect(botRow.getByText('爬虫', { exact: true })).toBeVisible()

		const downloadPromise = page.waitForEvent('download')
		await page.getByRole('button', { name: '导出 CSV' }).click()
		const download = await downloadPromise
		expect(download.suggestedFilename()).toMatch(/^fly-living-analytics-/u)
		await expect.poll(() => capture.analyticsExports).toBe(1)
		await expect(page.getByText('原始 IP 保留 30 天')).toBeVisible()
	})

	test('analytics status failure stays isolated and retryable', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { analyticsStatusFailure: true })
		await page.goto('/admin/analytics')
		await expect(page.getByRole('heading', { name: '访问分析', exact: true })).toBeVisible()
		await expect(page.locator('.admin-analytics-kpis').getByText('248', { exact: true }).first()).toBeVisible()
		await expect(page.getByText('状态不可用', { exact: true })).toBeVisible()
		await expect(page.getByRole('button', { name: '重试状态' })).toBeVisible()
	})

	test('dark mode and reduced motion remain available', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await page.getByRole('button', { name: '切换明暗模式' }).click()
		await expect(page.locator('html')).toHaveClass(/dark/u)
		const transitionDuration = await page.locator('.admin-button').first().evaluate((element) => {
			return Number.parseFloat(getComputedStyle(element).transitionDuration) || 0
		})
		expect(transitionDuration).toBeLessThanOrEqual(0.001)
	})

	test('keyboard navigation reaches navigation, editor, upload, and visible focus states', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await page.getByRole('link', { name: '文章', exact: true }).press('Enter')
		await expect(page).toHaveURL('/admin/articles')
		await expect(page.getByRole('link', { name: /Cycle 1 article/u })).toBeVisible()

		await page.getByRole('link', { name: '新建文章' }).first().press('Enter')
		await expect(page).toHaveURL('/admin/articles/new')
		const titleInput = page.getByLabel('标题')
		await tabTo(page, titleInput)
		await page.keyboard.type('Keyboard article')
		await expect(titleInput).toHaveValue('Keyboard article')

		await page.goto('/admin/media')
		const uploadButton = page.getByRole('button', { name: '选择文件', exact: true })
		await tabTo(page, uploadButton)
		const focus = await uploadButton.evaluate((element) => {
			const style = getComputedStyle(element)
			return {
				tagName: element.tagName,
				outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
			}
		})
		expect(focus.tagName).toBe('BUTTON')
		expect(focus.outlineWidth).toBeGreaterThanOrEqual(2)
	})

	test('logout clears the mocked session and returns to login', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await expect(page.getByRole('heading', { name: /(早上好|下午好|晚上好|夜深了)，flyoko/u })).toBeVisible()
		await page.getByRole('button', { name: '退出登录' }).click()
		await expect(page).toHaveURL('/admin/login')
		await expect.poll(() => capture.logoutCount).toBe(1)
	})

	test('session expiry redirects a refreshed admin page to login', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { sessionExpiresAfterLoad: true })
		await page.goto('/admin')
		await expect(page.getByRole('heading', { name: /(早上好|下午好|晚上好|夜深了)，flyoko/u })).toBeVisible()
		await page.reload()
		await expect(page).toHaveURL(/\/admin\/login\?returnTo=/u)
	})

	test('dependency failure renders an actionable degraded state', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { overviewFailure: true })
		await page.goto('/admin')
		await expect(page.getByText('依赖服务暂时不可用，请稍后重试。').first()).toBeVisible()
		await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible()
	})
})

test('unauthenticated users are redirected to GitHub login screen', async ({ page }) => {
	await mockAdminApi(page, { authenticated: false })
	await page.goto('/admin/articles')
	await expect(page).toHaveURL(/\/admin\/login\?returnTo=/u)
	await expect(page.getByRole('button', { name: '使用 GitHub 登录' })).toBeVisible()
})

test('mobile admin uses a compact navigation drawer', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Mobile drawer coverage runs in the mobile project.')
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin')
	await page.getByRole('button', { name: '打开导航' }).click()
	await expect(page.locator('.admin-sidebar')).toHaveClass(/is-open/u)
	await expect(page.getByRole('link', { name: '媒体库' })).toBeVisible()
})

test('visitor analytics stays contained across target widths and themes', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Responsive matrix runs once in the desktop project.')
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin/analytics')
	await expect(page.getByRole('heading', { name: '访问分析', exact: true })).toBeVisible()
	await page.setViewportSize({ width: 1440, height: 900 })
	const insightLayout = await page.evaluate(() => {
		const grid = document.querySelector<HTMLElement>('.admin-analytics-insight-grid')
		const stack = document.querySelector<HTMLElement>('.admin-analytics-insight-stack')
		const panels = stack?.querySelectorAll<HTMLElement>(':scope > .admin-panel')
		if (!grid || !stack || !panels || panels.length !== 2)
			return null
		const geo = panels[0].getBoundingClientRect()
		const device = panels[1].getBoundingClientRect()
		return {
			columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
			stackGap: device.top - geo.bottom,
		}
	})
	expect(insightLayout).not.toBeNull()
	expect(insightLayout?.columns).toBe(2)
	expect(insightLayout?.stackGap).toBeGreaterThanOrEqual(8)
	expect(insightLayout?.stackGap).toBeLessThanOrEqual(24)
	for (const width of [320, 390, 768, 1024, 1440]) {
		await page.setViewportSize({ width, height: 900 })
		const dimensions = await page.evaluate(() => ({
			scrollWidth: document.documentElement.scrollWidth,
			clientWidth: document.documentElement.clientWidth,
		}))
		expect(dimensions.scrollWidth, `${width}px viewport overflowed`).toBeLessThanOrEqual(dimensions.clientWidth + 1)
	}
	await page.setViewportSize({ width: 1440, height: 900 })
	await page.getByRole('button', { name: '切换明暗模式' }).click()
	await expect(page.locator('html')).toHaveClass(/dark/u)
	await expect(page.getByRole('img', { name: /访问趋势/u })).toBeVisible()
	const transitionDuration = await page.locator('.admin-analytics-page').evaluate((element) => {
		return Number.parseFloat(getComputedStyle(element).transitionDuration) || 0
	})
	expect(transitionDuration).toBeLessThanOrEqual(0.001)
})

test('unauthenticated visitor analytics redirects to login', async ({ page }) => {
	await mockAdminApi(page, { authenticated: false })
	await page.goto('/admin/analytics')
	await expect(page).toHaveURL(/\/admin\/login\?returnTo=/u)
	await expect(page.getByRole('button', { name: '使用 GitHub 登录' })).toBeVisible()
})

test('mobile visitor analytics keeps the page contained and the dashboard operable', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Mobile analytics coverage runs in the mobile project.')
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin/analytics')
	await expect(page.getByRole('heading', { name: '访问分析', exact: true })).toBeVisible()
	await expect(page.locator('.admin-analytics-kpis').getByText('248', { exact: true }).first()).toBeVisible()
	const dimensions = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
	}))
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
	await page.getByRole('button', { name: '打开导航' }).click()
	await expect(page.getByRole('link', { name: '访问分析', exact: true })).toBeVisible()
})

test('mobile finance content management stays contained', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Mobile finance coverage runs in the mobile project.')
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin/ai-news')
	await page.getByRole('tab', { name: /财经内容/u }).click()
	await expect(page.getByRole('heading', { name: '财经内容' })).toBeVisible()
	const dimensions = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
	}))
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
})
