# 文章编辑与公开发布链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 统一后台与前台文章渲染，支持多个可插入 macOS 窗口块，彻底阻止草稿公开，并修复编辑布局与加入可选文章头部广告位。

**Architecture:** 正式页继续使用 Nuxt Content，后台预览改用运行时 MDC；两者共享同一组 remark/rehype 插件和自动注册内容组件。公开文章读取点统一添加 `draft = false` 约束；窗口、广告和后台 full-bleed 均通过职责单一的组件或布局修饰类实现。

**Tech Stack:** Nuxt 4.4.8、Vue 3.5.38、Nuxt Content 3.14.0、Nuxt MDC 0.22.0、TypeScript 6、Vitest 4、Playwright 1.55、SCSS。

## Global Constraints

- 仓库：`/Users/liruiyu/Desktop/project/blog`，分支：`setup/personalize`。
- 使用简体中文 UI 文案；不在公开 UI 暴露内部实现或调试信息。
- 所有公开文章查询必须使用 `.where('draft', '=', false)`。
- 后台预览不得使用 `v-html` 或独立 `micromark` 渲染链。
- 默认广告配置必须关闭；未配置时不产生 DOM 占位。
- 未经用户明确授权，不执行 commit、push 或部署；本计划中的检查点只查看 diff 和测试状态。

---

## File Map

- `app/pages/[...slug].vue`：公开详情查询、文章头部广告位置、正文根渲染。
- `app/composables/useArticle.ts`：公开文章索引查询约束。
- `app/components/post/PostSurround.vue`：前后文章查询约束。
- `server/routes/atom.xml.get.ts`、`server/api/stats.get.ts`：服务端公开文章输出约束。
- `app/components/content/MacWindow.global.vue`：MDC 可重复窗口组件。
- `app/assets/css/article.scss`：文章、窗口块与广告视觉样式。
- `nuxt.config.ts`：Content 与运行时 MDC 的共享 Markdown 插件配置。
- `app/composables/useAdminDraft.ts`：纯 Markdown 选区编辑函数。
- `app/components/admin/AdminArticleEditor.vue`：编辑工具栏、MDC 预览、桌面/移动模式。
- `app/layouts/admin.vue`、`app/assets/css/admin.scss`、`app/assets/css/admin-management.scss`：编辑页 full-bleed 布局。
- `blog.config.ts`、`app/components/post/PostHeaderAd.vue`：文章头部广告配置和组件。
- `test/nuxt/article-editor.spec.ts`、`test/nuxt/admin-humanized.spec.ts`：纯函数和源码边界回归。

---

### Task 1: 公开草稿保护

**Files:**
- Modify: `app/composables/useArticle.ts:26-31`
- Modify: `app/pages/[...slug].vue:7-11`
- Modify: `app/components/post/PostSurround.vue:6-12`
- Modify: `server/routes/atom.xml.get.ts:45-55`
- Modify: `server/api/stats.get.ts:20-27`
- Test: `test/nuxt/article-editor.spec.ts`

**Interfaces:**
- Produces: every public post query returns only documents whose `draft` field is `false`.
- Preserves: `/about/profile` and `/link` content queries remain unchanged.

- [x] **Step 1: Write the failing source-contract test**

Add a test that reads the five public query files and asserts each post query contains `.where('draft', '=', false)`. Also assert `app/pages/[...slug].vue` applies the filter before `.path(route.path).first()`.

- [x] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts`

Expected: FAIL because current files do not contain the draft filter.

- [x] **Step 3: Add the minimal filters**

Use this exact query shape for client and server:

```ts
queryCollection('content')
  .where('draft', '=', false)
  .where('stem', 'LIKE', path)
```

```ts
queryCollection(event, 'content')
  .where('draft', '=', false)
```

For surroundings, add the same condition before ordering or stem filtering.

- [x] **Step 4: Run the focused test**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts`

Expected: PASS for the new contract.

- [x] **Step 5: Checkpoint without commit**

Run: `git diff -- app/composables/useArticle.ts 'app/pages/[...slug].vue' app/components/post/PostSurround.vue server/routes/atom.xml.get.ts server/api/stats.get.ts test/nuxt/article-editor.spec.ts`

Expected: only draft-filter and test changes.

---

### Task 2: 可重复 macOS 窗口块

**Files:**
- Create: `app/components/content/MacWindow.global.vue`
- Modify: `app/pages/[...slug].vue:25-44`
- Modify: `app/assets/css/article.scss:1-50,206-232`
- Test: `test/nuxt/article-editor.spec.ts`

**Interfaces:**
- Consumes: Nuxt auto-registration for `app/components/content`.
- Produces: MDC component name `mac-window` with one default Markdown slot.

- [x] **Step 1: Write the failing component contract**

Assert:

```ts
expect(page).not.toContain('<div class="article-window">')
expect(page).toContain('<ContentRenderer')
expect(macWindow).toContain('class="article-window"')
expect(macWindow).toContain('<slot />')
expect(macWindow).toContain('aria-hidden="true"')
```

- [x] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts`

Expected: FAIL because `MacWindow.vue` does not exist and the page still owns the window.

- [x] **Step 3: Create the content component**

`MacWindow.vue` must render:

```vue
<template>
<div class="article-window">
  <div class="article-window-bar" aria-hidden="true">
    <span class="article-window-dot article-window-dot-close" />
    <span class="article-window-dot article-window-dot-minimize" />
    <span class="article-window-dot article-window-dot-expand" />
  </div>
  <div class="article-window-body">
    <slot />
  </div>
</div>
</template>
```

- [x] **Step 4: Remove the page-level wrapper**

Render `ContentRenderer` directly with `class="article"`; do not move `PostHeader`, `PostExcerpt`, footer, surroundings or comments into the renderer.

- [x] **Step 5: Adapt SCSS for an in-article block**

- `.article-window` uses vertical margin and no dependency on a child `.article`.
- `.article-window-body` owns the inner padding.
- `.article > .article-window` aligns with other article children.
- mobile and reduced-transparency rules target the component structure.

- [x] **Step 6: Run the focused test**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts`

Expected: PASS.

---

### Task 3: 统一 MDC 预览与编辑工具

**Files:**
- Modify: `nuxt.config.ts:1-22,191-211`
- Modify: `app/composables/useAdminDraft.ts:1-55`
- Modify: `app/components/admin/AdminArticleEditor.vue:1-328`
- Delete or leave unused then delete: `app/utils/admin-markdown.ts`
- Modify: `app/assets/css/admin-management.scss:297-433`
- Test: `test/nuxt/article-editor.spec.ts`

**Interfaces:**
- Produces:

```ts
export type MarkdownEdit =
  | { type: 'wrap', before: string, after: string, placeholder: string }
  | { type: 'line-prefix', prefix: string, placeholder: string }
  | { type: 'block', before: string, after: string, placeholder: string }
  | { type: 'insert', value: string }

export interface MarkdownEditResult {
  body: string
  selectionStart: number
  selectionEnd: number
}

export function applyMarkdownEdit(body: string, start: number, end: number, edit: MarkdownEdit): MarkdownEditResult
export function insertMacWindowBlock(body: string, start: number, end: number): MarkdownEditResult
```

- [x] **Step 1: Write failing pure-function tests**

Cover at least:

```ts
expect(insertMacWindowBlock('前\n\n后', 2, 2)).toEqual({
  body: '前\n\n::mac-window\n在这里填写窗口内容\n::\n\n后',
  selectionStart: 16,
  selectionEnd: 26,
})
```

and a selected-text case that preserves the selection inside the block. Add tests for bold wrapping, line prefix over multiple lines, and fenced code block insertion.

- [x] **Step 2: Write failing UI/source contracts**

Assert the editor contains `<MDC`, `插入 macOS 窗口`, the formatting toolbar labels, and does not contain `v-html`, `renderAdminMarkdown`, or `lastSuccessfulPreview`.

- [x] **Step 3: Run focused tests and confirm failure**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts test/nuxt/admin-humanized.spec.ts`

Expected: FAIL for missing helpers/MDC toolbar and old preview references.

- [x] **Step 4: Share Markdown plugin maps**

In `nuxt.config.ts`, extract `remarkPlugins` and `rehypePlugins` constants and use them in both:

```ts
content: { build: { markdown: { remarkPlugins, rehypePlugins, ... } } },
mdc: { remarkPlugins, rehypePlugins, highlight: false }
```

Keep the current plugin order and paths.

- [x] **Step 5: Implement pure edit helpers**

Clamp selection indices to `[0, body.length]`, preserve selected text, insert placeholders only for empty selections, and return the final selection range rather than only a cursor.

`insertMacWindowBlock` calls `applyMarkdownEdit` with:

```ts
{
  type: 'block',
  before: '::mac-window\n',
  after: '\n::',
  placeholder: '在这里填写窗口内容',
}
```

- [x] **Step 6: Replace the preview**

Keep a 300 ms debounced `previewMarkdown` string, but render it with:

```vue
<MDC
  v-if="previewMarkdown"
  :value="previewMarkdown"
  tag="article"
  class="article admin-preview-content"
/>
```

Do not use `v-html`. Parsing errors should display a readable error without replacing the editor body.

- [x] **Step 7: Add the formatting toolbar**

Each button calls one shared `applyEditorEdit(edit)` method. Include accessible `aria-label` and `title`; restore textarea focus/selection after updating. Keep media insertion as a separate picker action.

- [x] **Step 8: Delete the obsolete renderer**

Remove all imports/usages of `app/utils/admin-markdown.ts`; delete the file once search confirms no references.

- [x] **Step 9: Run focused tests**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts test/nuxt/admin-humanized.spec.ts`

Expected: PASS.

---

### Task 4: 修复后台编辑布局

**Files:**
- Modify: `app/layouts/admin.vue:1-42`
- Modify: `app/assets/css/admin.scss:201-282,780-836`
- Modify: `app/assets/css/admin-management.scss:206-229,1131-1192`
- Test: `test/nuxt/article-editor.spec.ts`

**Interfaces:**
- Produces: `.admin-content-editor` layout modifier for `/admin/articles/new` and `/admin/articles/:id`.

- [x] **Step 1: Write the failing layout contract**

Assert `admin.vue` binds `admin-content-editor`, `admin-management.scss` no longer contains `margin: -2rem` or the mobile `margin: -1rem`, and `admin.scss` defines `.admin-content-editor`.

- [x] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts`

Expected: FAIL.

- [x] **Step 3: Add the route-aware modifier**

Compute:

```ts
const isArticleEditor = computed(() => /^\/admin\/articles\/(?:new|[^/]+)$/u.test(route.path))
```

Bind it on `<main class="admin-content">`.

- [x] **Step 4: Replace negative margin with real layout ownership**

`.admin-content-editor` must use `width: 100%; max-width: none; padding: 0;`. `.admin-editor-shell` uses `margin: 0`, min-height based on the 4.6rem topbar, and explicit grid overflow behavior.

- [x] **Step 5: Make the toolbar and workspace responsive**

At 900px, stack metadata below the editor. At 680px, avoid rendering two permanently visible panes side-by-side; toolbar controls wrap, preview has no fixed max-height, and no horizontal overflow.

- [x] **Step 6: Run focused tests**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts`

Expected: PASS.

---

### Task 5: 文章头部广告位

**Files:**
- Modify: `blog.config.ts:37-66`
- Create: `app/components/post/PostHeaderAd.vue`
- Modify: `app/pages/[...slug].vue:25-35`
- Modify: `app/assets/css/article.scss`
- Test: `test/nuxt/article-editor.spec.ts`

**Interfaces:**
- Consumes: `useAppConfig().article.headerAd`.
- Produces: a component that returns no rendered root when disabled or incomplete.

- [x] **Step 1: Write failing configuration/component contracts**

Assert default config contains `headerAd: { enabled: false, ... }`, page renders `<PostHeaderAd />` between excerpt and content, component checks `enabled`, `title`, and `href`, and external link uses `rel="noopener sponsored"`.

- [x] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts`

Expected: FAIL.

- [x] **Step 3: Add default-disabled configuration**

Use empty strings for optional presentation values; do not put a real sponsor or outbound URL into defaults.

- [x] **Step 4: Create the component**

Use a computed `visible` condition. The root is a semantic `aside` only when visible. Include a small configurable label, title, optional description, optional image, and a clear action affordance. Use `target="_blank"` only for external links.

- [x] **Step 5: Add responsive article styles**

Keep the card visually subordinate to the article title, with image collapsing or moving above text on narrow screens. No reserved dimensions when hidden.

- [x] **Step 6: Run focused tests**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts`

Expected: PASS.

---

### Task 6: Full verification and browser acceptance

**Files:**
- Verify all modified files.
- Temporary local fixture: `.data/article-mac-window-preview.md` if needed; do not add it to Git.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence that public and admin flows meet the acceptance criteria.

- [x] **Step 1: Run focused unit tests**

Run: `pnpm vitest run test/nuxt/article-editor.spec.ts test/nuxt/admin-humanized.spec.ts`

Expected: PASS.

- [x] **Step 2: Run type checking**

Run: `pnpm typecheck`

Expected: exit 0 with no TypeScript errors.

- [x] **Step 3: Run lint**

Run: `pnpm lint`

Expected: exit 0 with no ESLint or Stylelint errors.

- [x] **Step 4: Generate the static site**

Run: `pnpm generate`

Expected: exit 0; no Nuxt Content/MDC parse error.

- [x] **Step 5: Prove the draft is absent from public artifacts**

Run searches against `.output/public` for the known draft title `ether，属于你的第一张虚拟卡` and draft body marker. Expected: no hit in article HTML, `atom.xml`, or `/api/stats` output. If a route file exists for the draft path, it may contain only the generic 404 UI and must not contain the article title/body.

- [x] **Step 6: Start local preview and test public pages**

Run: `pnpm preview --host 127.0.0.1`

Use browser automation at 1440x1000 and 390x844. Verify a fixture/public article with two `::mac-window` blocks and normal content between them; verify no console, page or network errors.

- [x] **Step 7: Test the admin editor with the existing E2E mock/session path**

Verify formatting toolbar, selected-text wrapping, empty mac-window template insertion, live MDC rendering, metadata editing, and 1440/1024/390 layout alignment.

- [x] **Step 8: Review the final diff**

Run: `git status --short && git diff --stat && git diff --check`

Expected: no whitespace errors; only planned files plus design/plan docs changed.

- [x] **Step 9: Stop before release**

Do not commit, push or deploy. Report local verification evidence and wait for explicit release authorization.
