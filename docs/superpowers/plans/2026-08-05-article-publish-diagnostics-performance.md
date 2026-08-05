# Article Publish Diagnostics and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 缩短文章提交与检查反馈时间，并让发布失败能定位到文章正文的具体位置。

**Architecture:** 单文件文章写入改用 GitHub Contents API；共享轻量 Markdown 校验在浏览器与 Worker 两侧运行；GitHub check-run annotations 作为异步 CI 诊断来源。文章 PR 使用内容专用 CI 快路径，正式 main 发布继续执行完整验证。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、Hono、Cloudflare Workers、GitHub REST API、Vitest、GitHub Actions。

## Global Constraints

- 在独立 worktree 中实现和验证，确认主工作区未发生并行变化后再复制最终文件。
- 不执行 commit、push、PR 合并或部署。
- 不删除完整生产校验；main 发布继续运行 `pnpm verify`。
- 优先复用现有 API envelope、发布状态和编辑器组件。

---

### Task 1: 共享文章诊断

**Files:**
- Create: `shared/admin/article-validation.ts`
- Modify: `workers/api/src/features/articles/article-service.ts`
- Modify: `app/composables/useAdminArticleEditor.ts`
- Modify: `app/components/admin/AdminArticleEditor.vue`
- Test: `test/shared/article-validation.spec.ts`
- Test: `workers/api/test/articles.spec.ts`

**Interfaces:**
- Produces: `ArticleDiagnostic`, `validateArticleMarkdown(body)`。
- Worker 抛出 `ApiError('VALIDATION_FAILED', 400, ..., { diagnostics })`。
- 编辑器接收 `diagnostics` prop，并按 `bodyLine/bodyColumn` 聚焦 textarea。

- [x] **Step 1: 写失败测试**：覆盖结束强调标记前空格、正常强调、不检查代码围栏。
- [x] **Step 2: 运行测试确认失败**：`pnpm test:unit -- test/shared/article-validation.spec.ts`。
- [x] **Step 3: 实现纯函数与 Worker 校验**。
- [x] **Step 4: 实现编辑器错误卡片和定位**。
- [x] **Step 5: 运行共享、Worker 与 Nuxt 定向测试**。

### Task 2: 单文件快速提交

**Files:**
- Modify: `workers/api/src/features/articles/article-service.ts`
- Modify: `workers/api/src/features/articles/github-repository.ts`
- Modify: `workers/api/src/features/publishing/publishing-service.ts`
- Test: `workers/api/test/github-repository.spec.ts`
- Test: `workers/api/test/articles.spec.ts`
- Test: `workers/api/test/publishing.spec.ts`

**Interfaces:**
- Produces: `createFileCommit({ branch, expectedHeadSha, path, content, fileSha?, message })`。
- 文章直接发布与文章 PR 使用新接口；配置、多文件导入继续使用 `createAtomicCommit`。

- [x] **Step 1: 写 Contents API 请求与冲突测试**。
- [x] **Step 2: 运行测试确认缺少接口**。
- [x] **Step 3: 实现 `createFileCommit` 并接入文章路径**。
- [x] **Step 4: 增加相同内容 no-op 拦截，避免空提交和空 PR**。
- [x] **Step 5: 运行三个 Worker 定向测试文件**。

### Task 3: GitHub annotations 与审核页

**Files:**
- Modify: `shared/admin/publishing.ts`
- Modify: `workers/api/src/features/articles/github-repository.ts`
- Modify: `workers/api/src/features/publishing/publishing-service.ts`
- Modify: `app/pages/admin/reviews.vue`
- Modify: `app/components/admin/reviews/AdminReleaseChecklist.vue`
- Test: `workers/api/test/github-repository.spec.ts`
- Test: `workers/api/test/publishing.spec.ts`
- Test: `test/nuxt/admin-management.spec.ts`

**Interfaces:**
- Produces: `CheckDiagnosticDto` 与 `CheckSummaryDto.diagnostics`。
- `getChecks(ref, resourcePath?)` 映射 repository line 到 body line。
- 审核页提供带 line/column 查询参数的文章编辑链接。

- [x] **Step 1: 写 annotation 映射与正文行号测试**。
- [x] **Step 2: 扩展 DTO 和 GitHub API 查询**。
- [x] **Step 3: 使用首条失败诊断生成直接发布错误文案**。
- [x] **Step 4: 在审核页渲染诊断和定位链接**。
- [x] **Step 5: 运行 Worker 与 Nuxt 定向测试**。

### Task 4: CI 快路径和状态刷新

**Files:**
- Modify: `.github/workflows/pages-preview.yml`
- Modify: `.github/workflows/quality.yml`
- Modify: `app/pages/admin/reviews.vue`
- Modify: `nuxt.config.ts`
- Modify: `scripts/check-generated-smoke.ts`
- Create: `shared/article-preview-build.ts`
- Test: `test/nuxt/admin-management.spec.ts`
- Test: `test/shared/article-preview-build.spec.ts`
- Test: `test/shared/publishing-workflows.spec.ts`

**Interfaces:**
- `admin/article/*` PR 必须只修改一个 `content/posts/**/*.md`。
- 内容 PR 执行目标 Markdown ESLint，并以 `NUXT_ARTICLE_PREVIEW=1` 移除后台页面后执行 generate、smoke、links、secrets 和预览部署。
- 前 60 秒每 5 秒刷新，之后每 15 秒刷新。

- [x] **Step 1: 写工作流静态断言和刷新节奏测试**。
- [x] **Step 2: 实现文章 PR 条件分支及 Quality 跳过条件**。
- [x] **Step 3: 实现公开站点专用文章预览构建，生产模式保持完整后台产物**。
- [x] **Step 4: 实现自适应刷新定时器**。
- [x] **Step 5: 运行 YAML 静态检查、Nuxt 单测和定向 Lint**。

### Task 5: 完整验证

- [x] **Step 1:** `pnpm test:unit -- test/shared/article-validation.spec.ts test/nuxt/admin-management.spec.ts`。
- [x] **Step 2:** `pnpm --filter @fly-living/api-worker test -- github-repository.spec.ts articles.spec.ts publishing.spec.ts`。
- [x] **Step 3:** `pnpm typecheck`。
- [x] **Step 4:** 对全部修改代码运行 `pnpm exec eslint <files>`，对修改 Vue 样式运行 Stylelint。
- [x] **Step 5:** `pnpm generate && pnpm check:smoke && pnpm check:links && pnpm check:secrets`。
- [x] **Step 6:** 检查 `git diff --check`、`git status` 和未授权操作。
