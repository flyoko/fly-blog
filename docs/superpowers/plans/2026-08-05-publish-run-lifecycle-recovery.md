# 发布任务生命周期收敛与人工关闭实施计划

> **执行约束：** 用户明确要求由当前 agent 串行实施，不使用子 agent。所有步骤遵循 TDD，并在验证后提交。

**Goal:** 让失败、成功和被放弃的发布任务可靠收敛，并允许管理员安全关闭未完成任务，最终部署到生产环境。

**Architecture:** 扩展 PublishingService 的 PR 状态协调，使列表和详情都读取 PR、Checks 与预览部署；新增按 run id 关闭任务的服务端命令和 GitHub PR 关闭能力；后台依据更新时间提示停滞任务并提供逐项重新检查、关闭操作。

**Tech Stack:** Nuxt 4、Vue 3、Hono、Cloudflare Workers、D1、GitHub REST API、Vitest、TypeScript。

## Global Constraints

- 不物理删除发布记录。
- 不自动关闭长期任务，不自动重跑 GitHub Actions。
- 直接发布关闭不会撤销 Git 提交。
- 20 分钟无更新时间定义为长时间未更新。
- 不使用子 agent。

---

### Task 1: PR 状态自动收敛

**Files:**
- Modify: `workers/api/src/features/publishing/publishing-service.ts`
- Test: `workers/api/test/publishing.spec.ts`

**Interfaces:**
- Consumes: `getPullRequest(number)`, `getChecks(ref, resourcePath?)`, `getDeployment(ref)`。
- Produces: `reconcilePullRequestRun(...)` 将打开 PR 更新为 `failed`、`preview_ready` 或 `checks_pending`。

- [ ] **Step 1: 写失败测试**

新增测试：

```ts
it('reconciles open pull requests from checks and preview deployment', async () => {
  // failure => failed
  // success + deployment => preview_ready
  // failed then success => preview_ready and clears errors
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @fly-living/api-worker test -- publishing.spec.ts`

Expected: 新断言显示打开 PR 仍为 `checks_pending`。

- [ ] **Step 3: 最小实现**

在 `reconcilePullRequestRun` 中：

```ts
const checks = await repository.getChecks(current.headSha, run.resourcePath ?? undefined)
const deployment = await repository.getDeployment(run.repositoryRef)
if (checks.status === 'failure') return updateReconciledRun(...failed...)
if (checks.status === 'success' && deployment?.status === 'success') return updateReconciledRun(...preview_ready...)
return updateReconciledRun(...checks_pending...)
```

并把 `failed` 加入可恢复的 PR 活跃状态集合。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @fly-living/api-worker test -- publishing.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add workers/api/src/features/publishing/publishing-service.ts workers/api/test/publishing.spec.ts
git commit -m "fix: reconcile pull request publishing states"
```

### Task 2: GitHub PR 关闭能力与任务关闭命令

**Files:**
- Modify: `workers/api/src/features/articles/github-repository.ts`
- Modify: `workers/api/src/features/publishing/publishing-service.ts`
- Modify: `workers/api/src/features/publishing/routes.ts`
- Test: `workers/api/test/github-repository.spec.ts`
- Test: `workers/api/test/publishing.spec.ts`

**Interfaces:**
- Produces: `closePullRequest(number: number): Promise<void>`。
- Produces: `PublishingService.closeRun(id: string, actor: ArticleActor): Promise<PublishRunRow>`。
- Produces: `POST /api/admin/publishing/runs/:id/close`。

- [ ] **Step 1: 写 GitHub API 失败测试**

断言 `PATCH /pulls/7` 与 `{ state: 'closed' }`。

- [ ] **Step 2: 写服务和路由失败测试**

覆盖 PR、直接发布、重复关闭、禁止关闭 published/merged、审计记录和 CSRF。

- [ ] **Step 3: 运行定向测试确认失败**

Run: `pnpm --filter @fly-living/api-worker test -- github-repository.spec.ts publishing.spec.ts`

- [ ] **Step 4: 实现 Repository、Service 与 Route**

服务端流程：

```ts
const run = await publishRepository.findRun(id)
if (!run) throw new ApiError('NOT_FOUND', 404, 'Publishing run was not found')
if (run.status === 'closed') return run
if (['published', 'merged'].includes(run.status)) throw new ApiError('VALIDATION_FAILED', 400, 'Completed publishing runs cannot be closed')
if (run.kind === 'pull_request' && run.pullNumber) {
  const pull = await repository.getPullRequest(run.pullNumber)
  if (pull.merged) return update(...merged...)
  if (pull.state === 'open') await repository.closePullRequest(run.pullNumber)
}
return update(...closed...)
```

- [ ] **Step 5: 运行定向测试确认通过**

Run: `pnpm --filter @fly-living/api-worker test -- github-repository.spec.ts publishing.spec.ts`

- [ ] **Step 6: 提交**

```bash
git add workers/api/src/features/articles/github-repository.ts workers/api/src/features/publishing/publishing-service.ts workers/api/src/features/publishing/routes.ts workers/api/test/github-repository.spec.ts workers/api/test/publishing.spec.ts
git commit -m "feat: close abandoned publishing runs"
```

### Task 3: 长时间未更新提示和后台操作

**Files:**
- Modify: `shared/admin/publishing-refresh.ts`
- Modify: `app/types/admin.ts`
- Modify: `app/pages/admin/reviews.vue`
- Modify: `app/components/admin/reviews/AdminReleaseQueue.vue`
- Test: `test/shared/publishing-refresh.spec.ts`
- Test: `test/nuxt/admin-management.spec.ts`

**Interfaces:**
- Produces: `isPublishRunStale(updatedAt: string, now?: number): boolean`，阈值 20 分钟。
- Consumes: `POST /api/admin/publishing/runs/:id/close`。

- [ ] **Step 1: 写失败测试**

覆盖 20 分钟边界和后台源码契约：`重新检查`、`关闭任务`、关闭确认框和 API 路径。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- test/shared/publishing-refresh.spec.ts test/nuxt/admin-management.spec.ts`

- [ ] **Step 3: 实现 UI**

- 队列下一步文案在 stale 时显示长时间未更新。
- 详情区增加逐项重新检查。
- 对未完成任务增加关闭按钮与确认对话框。
- 关闭成功后刷新列表并选择下一项。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- test/shared/publishing-refresh.spec.ts test/nuxt/admin-management.spec.ts`

- [ ] **Step 5: 提交**

```bash
git add shared/admin/publishing-refresh.ts app/types/admin.ts app/pages/admin/reviews.vue app/components/admin/reviews/AdminReleaseQueue.vue test/shared/publishing-refresh.spec.ts test/nuxt/admin-management.spec.ts
git commit -m "feat: manage stalled publishing tasks"
```

### Task 4: 完整验证与生产部署

**Files:**
- Verify all changed files.

- [ ] **Step 1: 静态和测试验证**

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:workers
pnpm generate
pnpm check:smoke
pnpm check:links
pnpm check:secrets
git diff --check
```

Expected: 全部退出码 0；允许仓库已有的两条 JSON 行尾 warning。

- [ ] **Step 2: 推送功能分支**

```bash
git push -u origin <feature-branch>
```

- [ ] **Step 3: 创建 PR 并等待检查通过**

PR 目标为 `main`，标题说明发布任务自动收敛和人工关闭。

- [ ] **Step 4: 合并并等待生产部署**

确认 Pages Production、API Worker、Edge Worker 对 `main` 的工作流全部成功。

- [ ] **Step 5: 线上验收**

- 请求生产站点首页与 `/api/health`。
- 打开后台“发布与审核”，确认旧检查中任务会收敛，失败任务可关闭。
- 记录最终 main commit 和部署链接。
