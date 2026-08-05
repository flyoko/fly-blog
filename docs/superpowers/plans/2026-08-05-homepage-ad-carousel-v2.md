# 首页紧凑轮播广告实施计划

> **执行约束：** 用户明确要求不使用子 agent；所有步骤在隔离 worktree 中串行执行，并保持测试先行。

**目标：** 将文章详情广告改造成仅首页展示的紧凑主题化轮播，并支持每条广告独立的微信二维码联系动作。

**架构：** 共享 Zod schema负责写入契约；轻量前端工具负责可展示判定；首页决定广告与推荐轮播的互斥关系；`HomeAdCarousel` 负责视觉、轮播、链接和微信模态框；后台设置页负责动作类型和行内校验。

**技术栈：** Nuxt 4、Vue 3、VueUse、Zod、SCSS、Vitest、Playwright、Cloudflare Pages/Workers。

## 全局约束

- 仅首页第一页、未筛选分类时展示广告。
- 桌面高度 `10.25rem`，移动端高度 `8.25rem`。
- 自动轮播间隔 5500ms，并尊重减少动画。
- 微信二维码按广告独立配置，不创建虚假生产二维码。
- 文章详情页不得保留广告。

### 任务 1：扩展配置契约

- [ ] 在 `test/shared/contracts.spec.ts` 写入旧配置默认、链接与微信动作的失败/成功测试。
- [ ] 运行 targeted 测试确认失败。
- [ ] 修改 `shared/admin/site-config.ts`，增加动作和微信字段的默认值与条件校验。
- [ ] 更新 Worker 发布测试的构造数据并通过 targeted 测试。

### 任务 2：首页展示边界

- [ ] 在 `test/nuxt/article-editor.spec.ts` 写入首页互斥展示和文章详情无广告测试。
- [ ] 新建 `app/utils/article-ads.ts`，实现轻量可展示判定。
- [ ] 修改 `app/pages/index.vue`，传入有效广告并替代 `PostSlide`。
- [ ] 删除 `app/pages/[...slug].vue` 的广告挂载。

### 任务 3：紧凑轮播和微信弹层

- [ ] 创建 `app/components/home/HomeAdCarousel.vue`，实现 164/132px 主题化横幅。
- [ ] 实现自动轮播、暂停条件、按钮、圆点和链接语义。
- [ ] 实现 Teleport 微信模态框、焦点恢复、复制和关闭行为。
- [ ] 删除 `app/components/post/PostHeaderAd.vue`。
- [ ] 运行 Nuxt targeted 测试。

### 任务 4：后台配置与中文校验

- [ ] 更新 `e2e/admin.spec.ts` 和 fixture，覆盖微信类型、缺二维码错误与正确 payload。
- [ ] 修改 `app/pages/admin/settings.vue` 的名称、字段、预览和行内校验。
- [ ] 更新相关管理页静态测试与 Worker payload 测试。
- [ ] 运行后台 targeted 单测与 E2E。

### 任务 5：响应式和完整验证

- [ ] 在前台 E2E 中验证 1440px、390px 高度、无溢出、轮播、弹层和文章页无广告。
- [ ] 运行 lint、typecheck、单元测试和 Worker 测试。
- [ ] 运行 `pnpm verify` 和完整 Playwright。
- [ ] 审查差异、提交、推送 PR、等待 Preview、合并并验证生产。
