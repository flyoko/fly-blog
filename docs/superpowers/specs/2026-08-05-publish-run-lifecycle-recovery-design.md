# 发布任务生命周期收敛与人工关闭设计

## 背景

“发布与审核”页面存在两类不会自然消失的记录：

1. Pull Request 已经检查失败，但列表同步只读取 PR 是否合并或关闭，因此数据库仍保持 `checks_pending`。
2. `failed`、`conflict` 和长期无变化的处理中任务没有关闭或归档入口，只能永久停留在“需要处理”或“进行中”。

这使管理员无法判断任务是否仍在执行，也无法清理已经放弃的任务。

## 目标

- 打开的 PR 根据 GitHub Checks 与预览部署自动收敛到 `failed`、`preview_ready` 或继续 `checks_pending`。
- 失败 PR 在 GitHub 重新运行并成功后可以恢复为 `preview_ready`。
- 管理员可以关闭任意未完成任务；PR 任务同时关闭 GitHub PR，直接发布任务只停止后台跟踪。
- 活跃任务超过 20 分钟未更新时明确显示“长时间未更新”，并提供逐项重新检查与关闭操作。
- 历史记录保留失败原因和技术信息，不物理删除数据库记录。

## 非目标

- 不自动重跑 GitHub Actions。
- 不自动关闭长期任务，避免误伤 GitHub 排队或外部服务延迟。
- 不撤销已经写入 `main` 的直接发布提交。
- 不增加数据库迁移；沿用现有 `status`、`error_code`、`error_message` 和时间字段。

## 状态同步

### Pull Request 任务

对 `created`、`commit_created`、`checks_pending`、`preview_ready`、`failed` 执行同步：

1. 读取 PR。
2. 已合并：更新为 `merged`。
3. 已关闭且未合并：更新为 `closed`。
4. PR 打开时，使用任务保存的 `commitSha`/PR `headSha` 获取 Checks，并使用 `repositoryRef` 获取预览部署。
5. Checks 失败：更新为 `failed`，错误码为 `CHECKS_FAILED`，保存首条诊断消息。
6. Checks 成功且预览部署成功：更新为 `preview_ready`，清除旧错误。
7. 其他情况：更新为 `checks_pending`，清除已经过期的失败错误。

同步失败时保留原状态和原错误，页面仍可读取已有记录。

### 直接发布任务

保留现有正式部署同步逻辑。人工关闭只把后台记录标记为 `closed`，不会修改 GitHub 提交或线上内容。

## 人工关闭 API

新增：

```http
POST /api/admin/publishing/runs/:id/close
```

约束：

- 必须登录、通过 CSRF，并受写操作限流保护。
- PR 任务必须先读取已跟踪的 PR：
  - 已合并则同步为 `merged`；
  - 仍打开则调用 GitHub API 关闭 PR；
  - 已关闭则直接同步为 `closed`。
- 直接发布任务直接更新为 `closed`。
- `published`、`merged` 不能被关闭；重复关闭 `closed` 任务应幂等成功。
- 写入 `publishing.close` 审计记录。

GitHubRepository 新增：

```ts
closePullRequest(number: number): Promise<void>
```

使用 `PATCH /pulls/{number}`，请求体为 `{ state: 'closed' }`。

## 后台交互

- 队列中活跃任务 `updatedAt` 超过 20 分钟时，下一步提示改为“长时间未更新，可重新检查或关闭”。
- 详情区为可操作任务提供：
  - `重新检查`：重新加载该任务和列表状态；
  - `关闭任务`：打开确认对话框，说明 PR 会同步关闭、直接发布不会撤销提交。
- 关闭成功后刷新列表；当前任务移入“已完成”，并自动选择下一项需要处理或进行中的任务。
- 失败原因、文件诊断和外部链接继续保留。

## 安全与并发

- 只允许关闭数据库中存在的发布任务。
- PR 关闭前再次读取当前 PR 状态，避免把已合并任务错误标记为关闭。
- 服务端决定任务是否允许关闭，前端按钮只用于体验优化。
- API 失败时不提前修改本地 UI 状态，显示可重试错误。

## 验证

- Worker 单测覆盖 PR 失败、成功、失败后恢复、PR 关闭、直接任务关闭和幂等关闭。
- GitHubRepository 单测覆盖关闭 PR 请求。
- Nuxt 契约测试覆盖长时间未更新、重新检查、关闭按钮和确认对话框。
- 执行 `pnpm lint`、`pnpm typecheck`、`pnpm test:unit`、`pnpm test:workers`、`pnpm generate`、smoke、links 和 secrets 检查。
- 推送分支，创建并合并 PR，等待生产 Pages 与 Worker 部署完成并验证线上健康状态。
