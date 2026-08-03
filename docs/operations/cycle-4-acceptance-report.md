# 周期 4 验收证据报告

- 日期：2026-08-03
- 范围：统一视觉、动效、响应式、可访问性、性能与最终生产回归
- 当前结论：本地实现、全量门禁、桌面/移动浏览器回归与静态 WCAG A/AA 审计全部通过；等待私有 `main` 推送、Pages 部署与生产视觉矩阵后更新

## 已完成实现

- 新增全局视觉/动效/焦点/触控/forced-colors/reduced-motion 样式。
- 页面切换采用 200ms 淡入与小位移；瞬间/阅闻首屏最多 8 项有限顺序显现。
- 天气与播放器由静态模块配置进行条件懒加载；禁用时零公开 API 请求、零 Open-Meteo 上游请求、零 Audio 实例、零可见组件。
- 侧栏/搜索锁定背景滚动并恢复焦点；站内搜索使用 button/dialog 语义。
- 公开站和后台均有跳至主内容入口与单一主地标。
- 移动侧栏、天气栏和播放器支持 `100dvh` 与安全区避让。
- 图片补齐异步解码；非首屏媒体使用懒加载。
- 关闭命名布局插槽转换，改用路由驱动侧栏组件；修复首页 SSR/客户端片段差异、快捷键和相对时间的非确定首帧，生产 Hydration 无 mismatch。
- 下拉菜单改为原生 button disclosure，支持点击、焦点离开、外部点击、Escape 与方向键；`aria-expanded` 只出现在真实按钮。
- 修复 Twikoo 第三方 textarea/Markdown 链接可访问名称，并通过 MutationObserver 覆盖异步重绘。
- 修复首页、文章、自述、瞬间、归档与侧栏组件的标题、列表、导航名称和文字对比度。

## 聚焦自动化

| 类别 | 结果 |
|---|---:|
| 周期 4 源码契约 | 6/6 Pass |
| 周期 4 E2E | 12 Pass / 8 设备条件 Skip |
| 320–430px 公开路由溢出矩阵 | Pass |
| 320–430px 全部后台路由溢出矩阵 | Pass |
| 搜索键盘、焦点、背景锁定与恢复 | Pass |
| 后台 skip link | Pass |
| 可见按钮命名、图片 alt、单一 main 地标 | Pass |
| 禁用天气/音乐零运行时 | Pass |
| 公开 Hydration 控制台矩阵 | Pass |
| Twikoo 第三方表单语义 | Pass |
| 静态生产 axe WCAG A/AA | 6 核心页面 / 0 violation |

## 最终全量门禁

| 类别 | 结果 |
|---|---:|
| ESLint / Stylelint / Typecheck | Pass |
| Nuxt / 共享测试 | 10 files / 51 tests |
| API Worker 测试 | 16 files / 90 tests |
| Edge Worker 测试 | 1 file / 22 tests |
| 静态生成 | 42 routes |
| Nuxt Link Checker | 0 error / 0 warning |
| 生成 HTML 链接检查 | 24 files / 0 broken href |
| Secret 扫描 | 526 files / 0 finding |
| Playwright | 36 passed / 30 device-condition skipped |

## 构建体积证据

| 项目 | 周期 3 基线 | 周期 4 | 说明 |
|---|---:|---:|---|
| 最大 JS chunk | 约 707.17 kB | 707,370 B | 约 +0.2 kB；Nuxt/Vue/Zod/内容与动态路由映射 |
| SQLite 主线程 chunk | 约 199.77 kB | 199,765 B | 基本不变 |
| SQLite Worker | 196,867 B | 196,867 B | 不变 |
| 入口 CSS | 约 55.39 kB | 57,998 B | 增加全局焦点、动效、移动端和高对比规则 |
| 播放器 CSS | 独立 | 3,751 B | 模块关闭时首页不引用 |

首页静态 HTML与浏览器网络检查：`/api/weather`、`/api/music/playlist` 请求均为 0，`.music-player` 与天气卡片均不存在。天气和音乐组件仅在模块静态启用时通过 `LazyWidgetWeather` / `LazyMusicGlobalPlayer` 加载；关闭态不创建 Audio，天气 Worker 不访问 Open-Meteo。E2E 使用仅在 `NUXT_E2E=1` 时存在的 `/__e2e__` 路由验证启用态，普通生产构建中该路由返回 404。

静态生产预览对 `/`、`/2026/welcome`、`/me`、`/moments`、`/link`、`/archive` 执行 axe WCAG 2.0/2.1 A/AA：0 violation；全部页面无控制台错误、无 Hydration mismatch、无非法 `aria-expanded`、无横向溢出。`/moments` 在静态预览中使用同契约 API mock，真实生产 API 在部署后复验。

## 验收矩阵

| AC | 状态 | 证据 |
|---|---|---|
| C4-AC-01–04 | Pass | 共享令牌、公开/后台样式、源码隐藏契约 |
| C4-AC-05–10 | Pass | 页面过渡、hover media query、有限显现、全局 reduced-motion |
| C4-AC-11–15 | Pass | Playwright 公开/后台移动溢出矩阵与安全区样式 |
| C4-AC-16–21 | Pass | skip link、focus-visible、dialog、焦点恢复、原生 disclosure、语义 DOM、Twikoo 增强、RouteAnnouncer 与 axe 审计 |
| C4-AC-22–27 | Pass | 关闭态零同源 API/零上游/零 Audio、条件 Lazy 组件、测试专用启用路由、图片策略、体积与控制台矩阵 |
| C4-AC-28–31 | Pass | 10 files / 51 Nuxt+shared tests；16 files / 90 API tests；22 Edge tests；36 E2E pass / 30 device skips；42 routes；0 link/secret error |
| C4-AC-32–34 | Pending | 等待最终推送、部署、清理和四周期总报告 |
