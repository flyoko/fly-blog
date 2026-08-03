# fly living Cycle 2 About and Moments Implementation Plan

## Constraints

- 基于周期 1 现有私有 GitHub、API/Edge Worker、D1、R2、OAuth、审计、幂等、Pages 流水线增量实现。
- 不迁移或复用 Twikoo D1；瞬间评论仅通过稳定页面路径接入现有 Twikoo 服务。
- Git 内容白名单限定为 `content/about/*` 与 `backups/moments/*`。
- 公开 API 不返回草稿、撤回、管理员字段、访客 HMAC 或精确位置。
- 先写测试和迁移，再实现 API、后台、公开页、备份恢复，最后真实生产验收。

## Task 1: Shared contracts and content collections

- 定义 profile/timeline/links、moment、media relation、like、backup snapshot、restore preview DTO 与 Zod schema。
- 添加 Nuxt Content `about` 集合和初始自述文件。
- 添加自述/瞬间路径、URL、标签、城市和外部链接安全校验测试。

## Task 2: D1 migration and repositories

- 新增 moments、moment_media、moment_likes、moment_backup_state、sync_runs 所需 migration、索引和约束。
- 实现 MomentRepository、LikeRepository、SyncRepository 与事务边界。
- 覆盖分页、版本冲突、状态过滤、引用和并发点赞测试。

## Task 3: Public moment APIs and cache

- 实现公开列表、详情、点赞/取消点赞 API。
- 使用 HMAC 访客标识、Cookie、安全限流和统一错误格式。
- 添加 Cache API key、TTL、stale fallback 和写入后失效。

## Task 4: Admin moment APIs

- 实现管理员列表、详情、创建、编辑、发布、撤回和恢复草稿。
- 校验 R2 active 媒体、标签、城市和音乐引用。
- 接入审计、幂等、CSRF、会话和写限流。

## Task 5: About Git APIs

- 读取并验证 profile/timeline/links。
- profile 文本允许直接 Git 发布；timeline/links/模块结构使用受控 PR。
- 复用冲突检测、发布记录、预览和本地草稿。

## Task 6: Admin UI

- 实现 `/admin/moments` 列表、筛选、编辑器、媒体选择、预览与状态操作。
- 实现 `/admin/about` 富文本和结构化表单；替换周期 1 占位入口。
- 更新概览真实瞬间、备份与同步状态。

## Task 7: Public `/me`

- 实现 profile Markdown、时间线、链接和模块排序。
- 添加 SEO、响应式、深浅主题、键盘与 reduced-motion 支持。

## Task 8: Public `/moments` and detail

- 实现时间线分页、筛选、画廊、详情、骨架、空态和降级缓存提示。
- 详情接入点赞和 Twikoo 稳定评论路径。
- 添加 canonical、Open Graph 和 404 保护。

## Task 9: Backup and restore

- 实现每日 Cron 变更检测、确定性 JSON 导出、Git Commit 和状态记录。
- 实现快照列表、dry-run、事务恢复、缓存失效和审计。
- 无变化不提交；失败可重试且不破坏上次成功状态。

## Task 10: CI, tests and operations

- 扩展 Worker/Nuxt/E2E 测试和链接/Secret 扫描。
- 更新 Wrangler Cron、bindings/type declarations、运维手册、回滚与验收报告。
- 执行本地全量 `pnpm verify`、`pnpm test:e2e`。

## Task 11: Production validation

- 应用 D1 migration，部署 API/Edge/Pages。
- 真实验证 OAuth、临时自述、瞬间发布、R2 图片、点赞、Twikoo 入口、备份 dry-run/真实快照/恢复演练。
- 清理临时内容、R2 对象、D1 记录、Git 分支和 PR。

## Task 12: Push and closeout

- 提交并推送功能分支和私有 `main`。
- 等待 Quality、Pages、Workers 成功并执行正式/备用域名回归。
- 完成周期 2 证据报告后进入周期 3。
