# 随心听迷你控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全局随心听播放器实现为用户选定的 C 方案迷你控制台，默认约 330 × 60px，完整控制进入展开详情。

**Architecture:** 保持现有 `GlobalPlayer.vue` 与 `useMusicStore()` 边界，不改变音频和歌单数据流。重组播放器模板为主控制台、底部进度轨和条件详情区，并通过现有 Store 的 `expanded` 状态控制详情。移动端继续由 `BlogPanel` 按需打开。

**Tech Stack:** Nuxt 4、Vue 3、Pinia、SCSS、Vitest、Playwright

## Global Constraints

- 默认桌面播放器宽度不大于 340px，高度不大于 66px。
- 默认态只显示封面、歌名、艺术家、上一首、播放/暂停、下一首和进度轨。
- 时间、音量和播放模式仅在详情展开后显示。
- 不新增依赖、不改歌单数据结构、不改音频错误恢复逻辑。
- 移动端保留共享浮动面板按需打开，打开后的默认高度小于 80px。
- 正式域和备用域 API 路由行为不得回退。

---

### Task 1: 锁定迷你控制台结构契约

**Files:**
- Modify: `test/nuxt/music-playback.spec.ts`
- Modify: `test/nuxt/mobile-performance.spec.ts`

**Interfaces:**
- Consumes: `app/components/music/GlobalPlayer.vue` 的源码结构。
- Produces: 对 `.music-player-console`、`.music-progress-rail`、`.music-player-details` 和条件音量区的静态回归约束。

- [ ] **Step 1: 将旧“音量始终显示”契约改成默认紧凑契约**

在 `test/nuxt/music-playback.spec.ts` 中，用以下断言替换旧的 `keeps volume controls visible without expanding the player` 测试：

```ts
it('keeps the default player compact and moves secondary controls into details', () => {
  const source = readFileSync(new URL('../../app/components/music/GlobalPlayer.vue', import.meta.url), 'utf8')
  expect(source).toContain('class="music-player-console"')
  expect(source).toContain('class="music-progress-rail"')
  expect(source).toContain('v-if="store.expanded" class="music-player-details"')
  expect(source).toContain(':aria-expanded="store.expanded"')
  expect(source).toContain('aria-label="音量"')
  expect(source).toContain('store.setVolume')
  expect(source).not.toMatch(/<div class="music-volume-control">[\s\S]*?v-if=/u)
  expect(source).not.toContain('music-cover-large')
})
```

- [ ] **Step 2: 加入移动端紧凑几何源码契约**

在 `test/nuxt/mobile-performance.spec.ts` 的首个测试中增加：

```ts
expect(player).toContain('class="music-player-console"')
expect(player).toContain('class="music-progress-rail"')
expect(player).toMatch(/@media \(max-width: \$breakpoint-mobile\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?min-height: 2\.75rem;/u)
```

- [ ] **Step 3: 运行聚焦测试并确认红灯**

Run:

```bash
pnpm vitest run --config vitest.config.ts test/nuxt/music-playback.spec.ts test/nuxt/mobile-performance.spec.ts
```

Expected: FAIL，因为生产组件尚未包含新结构，并仍有常驻音量行和大封面展开区。

- [ ] **Step 4: 提交测试红灯**

```bash
git add test/nuxt/music-playback.spec.ts test/nuxt/mobile-performance.spec.ts
git commit -m "test: 锁定迷你播放器结构"
```

### Task 2: 实现 C 方案迷你控制台

**Files:**
- Modify: `app/components/music/GlobalPlayer.vue`

**Interfaces:**
- Consumes: `useMusicStore()` 的 `currentTrack`、`expanded`、`playing`、`loading`、`progress`、`duration`、`volume`、`muted`、`mode` 及现有控制方法。
- Produces: `.music-player-console`、`.music-track-toggle`、`.music-progress-rail`、`.music-player-details` DOM 契约。

- [ ] **Step 1: 重组模板为主行、进度轨和详情区**

将现有大封面展开块、主行、常驻时间行和常驻音量行替换为以下结构：

```vue
<div class="music-player-console">
  <button
    class="music-track-toggle"
    type="button"
    :aria-label="store.expanded ? '收起播放器详情' : '展开播放器详情'"
    :aria-expanded="store.expanded"
    @click="store.toggleExpanded"
  >
    <span class="music-cover" aria-hidden="true">
      <img v-if="store.currentTrack?.coverUrl" :src="store.currentTrack.coverUrl" alt="" decoding="async">
      <Icon v-else name="tabler:vinyl" />
    </span>
    <span class="music-player-copy">
      <strong>{{ store.currentTrack?.title }}</strong>
      <span>{{ store.currentTrack?.artist || store.currentTrack?.source || '随心听' }}</span>
    </span>
  </button>
  <div class="music-controls">
    <button type="button" aria-label="上一首" @click="store.previous"><Icon name="tabler:player-skip-back-filled" /></button>
    <button class="music-play" type="button" :aria-label="store.playing ? '暂停' : '播放'" @click="store.toggle">
      <Icon :name="store.loading ? 'tabler:loader-2' : store.playing ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'" :class="{ spin: store.loading }" />
    </button>
    <button type="button" aria-label="下一首" @click="store.next()"><Icon name="tabler:player-skip-forward-filled" /></button>
  </div>
</div>
<div class="music-progress-rail">
  <input
    :value="store.progress"
    type="range"
    min="0"
    :max="Math.max(store.duration, 1)"
    step="0.1"
    aria-label="播放进度"
    @input="store.seek(Number(($event.target as HTMLInputElement).value))"
  >
</div>
<div v-if="store.expanded" class="music-player-details">
  <div class="music-time-row"><span>{{ formatTime(store.progress) }}</span><span>{{ formatTime(store.duration) }}</span></div>
  <div class="music-volume-control">
    <button type="button" :aria-label="store.muted ? '取消静音' : '静音'" @click="store.toggleMuted"><Icon :name="store.muted ? 'tabler:volume-off' : 'tabler:volume'" /></button>
    <input :value="store.volume" type="range" min="0" max="1" step="0.05" aria-label="音量" :aria-valuetext="store.muted ? '静音' : `${Math.round(store.volume * 100)}%`" @input="store.setVolume(Number(($event.target as HTMLInputElement).value))">
    <output>{{ store.muted ? '静音' : `${Math.round(store.volume * 100)}%` }}</output>
  </div>
  <div class="music-player-tools">
    <button type="button" :aria-label="store.mode === 'shuffle' ? '切换为顺序播放' : '切换为随机播放'" @click="store.toggleMode">
      <Icon :name="store.mode === 'shuffle' ? 'tabler:arrows-shuffle' : 'tabler:repeat'" />
      {{ store.mode === 'shuffle' ? '随机' : '顺序' }}
    </button>
  </div>
</div>
```

- [ ] **Step 2: 实现紧凑桌面样式**

将播放器核心尺寸设为：

```scss
.music-player {
  width: min(20.625rem, calc(100vw - 2rem));
  border-radius: 1rem;
}

.music-player-console {
  display: flex;
  align-items: center;
  min-height: 3.5rem;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem 0.35rem;
}

.music-track-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  gap: 0.55rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: start;
  cursor: pointer;
}

.music-cover {
  flex: 0 0 auto;
  width: 2.625rem;
  height: 2.625rem;
  border-radius: 0.75rem;
}

.music-controls button { width: 1.875rem; height: 1.875rem; }
.music-controls .music-play { width: 2rem; height: 2rem; }
```

删除 `.music-cover-large` 和封面旋转选择器。为 `.is-playing .music-play` 增加克制的主色阴影，不旋转封面。

- [ ] **Step 3: 实现 Signal Rail 与详情样式**

```scss
.music-progress-rail {
  height: 0.2rem;
  padding: 0 0.55rem;
}

.music-progress-rail input {
  display: block;
  width: 100%;
  height: 0.2rem;
  margin: 0;
  accent-color: var(--c-primary);
}

.music-player-details {
  display: grid;
  gap: 0.55rem;
  padding: 0.6rem 0.75rem 0.75rem;
  border-top: 1px solid color-mix(in srgb, var(--c-border) 70%, transparent);
}
```

时间行使用两端对齐与 tabular nums；音量和模式继续使用现有 Store 方法。

- [ ] **Step 4: 保留移动按需打开并压缩默认高度**

在现有移动媒体查询中：

```scss
.music-player-console { min-height: 2.75rem; }
.music-cover { width: 2.375rem; height: 2.375rem; }
.music-controls button { min-width: 2.75rem; min-height: 2.75rem; }
.music-controls .music-play { min-width: 2.75rem; min-height: 2.75rem; }
```

保持 `.music-player` 默认 `display: none`、`.is-mobile-open { display: block; }`、实体背景与无 backdrop-filter。

- [ ] **Step 5: 运行聚焦测试并确认绿灯**

Run:

```bash
pnpm vitest run --config vitest.config.ts test/nuxt/music-playback.spec.ts test/nuxt/mobile-performance.spec.ts
pnpm eslint app/components/music/GlobalPlayer.vue test/nuxt/music-playback.spec.ts test/nuxt/mobile-performance.spec.ts
pnpm stylelint app/components/music/GlobalPlayer.vue
```

Expected: 全部 PASS，Lint/Stylelint 0 errors。

- [ ] **Step 6: 提交组件实现**

```bash
git add app/components/music/GlobalPlayer.vue
git commit -m "feat: 将随心听改为迷你控制台"
```

### Task 3: 增加真实几何和交互回归

**Files:**
- Create: `e2e/music-player-mini-console.spec.ts`
- Modify: `e2e/mobile-player-performance.spec.ts`

**Interfaces:**
- Consumes: 公开歌单 API mock、播放器可访问角色和 `.music-player-details` DOM。
- Produces: 桌面和移动端几何、展开、播放、无溢出回归。

- [ ] **Step 1: 创建桌面 E2E**

创建 `e2e/music-player-mini-console.spec.ts`，复用一个本地 `mockPublicMusic(page)`，并验证：

```ts
const player = page.getByRole('region', { name: '随心听播放器' })
await expect(player).toBeVisible()
const collapsed = await player.evaluate((element) => {
  const rect = element.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
})
expect(collapsed.width).toBeLessThanOrEqual(340)
expect(collapsed.height).toBeLessThanOrEqual(66)
await expect(player.getByRole('slider', { name: '音量' })).toHaveCount(0)
await player.getByRole('button', { name: '展开播放器详情' }).click()
await expect(player.getByRole('slider', { name: '音量' })).toBeVisible()
const expandedHeight = await player.evaluate(element => element.getBoundingClientRect().height)
expect(expandedHeight).toBeGreaterThan(collapsed.height)
expect(expandedHeight).toBeLessThan(180)
```

同时点击播放并验证按钮变为“暂停”，点击下一首后歌名变化。

- [ ] **Step 2: 收紧移动 E2E 几何阈值**

在 `e2e/mobile-player-performance.spec.ts` 将打开后的默认高度阈值从 `<190` 改为 `<80`，并增加：

```ts
const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
expect(overflowX).toBe(false)
```

- [ ] **Step 3: 运行 E2E**

Run:

```bash
pnpm playwright test e2e/music-player-mini-console.spec.ts e2e/mobile-player-performance.spec.ts
```

Expected: desktop-chromium 与 mobile-chromium 中适用项目全部 PASS。

- [ ] **Step 4: 提交 E2E**

```bash
git add e2e/music-player-mini-console.spec.ts e2e/mobile-player-performance.spec.ts
git commit -m "test: 覆盖迷你播放器几何与交互"
```

### Task 4: 视觉复核与完整门禁

**Files:**
- Modify only if review finds a concrete issue: `app/components/music/GlobalPlayer.vue`

**Interfaces:**
- Consumes: 已实现的迷你控制台。
- Produces: 桌面/移动视觉截图、完整验证结果和发布候选提交。

- [ ] **Step 1: 本地浏览器视觉复核**

启动静态预览并用 Chrome 检查 1440×900、390×844：默认尺寸、展开尺寸、标题省略、暗色/浅色、播放态、移动触控热区。若存在具体缺陷，先补测试再修复。

- [ ] **Step 2: 运行完整门禁**

```bash
GOMAXPROCS=2 WRANGLER_SEND_METRICS=false pnpm verify
```

Expected: Lint 0 errors；Nuxt/共享、API、Edge 全部 PASS；生成、Smoke、内链与敏感信息检查通过。

- [ ] **Step 3: 运行聚焦 E2E**

```bash
pnpm playwright test e2e/music-player-mini-console.spec.ts e2e/mobile-player-performance.spec.ts
```

Expected: 全部适用项目 PASS。

- [ ] **Step 4: 提交最终视觉修正（仅有改动时）**

```bash
git add app/components/music/GlobalPlayer.vue test/nuxt e2e
git commit -m "fix: 收口迷你播放器视觉细节"
```
