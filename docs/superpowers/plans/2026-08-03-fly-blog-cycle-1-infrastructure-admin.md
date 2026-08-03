# fly living Cycle 1 Infrastructure and Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the private-repository deployment foundation, same-origin Cloudflare API, GitHub App authentication, R2 media library, Git-backed article management, controlled Pull Request publishing, and the first usable `/admin` workspace without implementing the later public modules.

**Architecture:** Keep the Nuxt site statically generated and add a separate `fly-living-api` Worker for authenticated data operations. Keep `fly-living-edge` as the public gateway: it forwards admin API traffic through a Service Binding and proxies all other requests to the existing Pages project. Store sessions, audit records, idempotency records, media metadata, and publish runs in a new D1 database; store media bytes in R2; use a GitHub App installation token for repository writes.

**Tech Stack:** Nuxt 4.4.x, Vue 3.5.x, Pinia 3.x, Nuxt Content 3.14.x, TypeScript 6.x, Zod 4.x, Hono, jose, gray-matter, YAML, Cloudflare Workers/D1/R2/Rate Limiting/Service Bindings, Wrangler 4.36+, Vitest 4.1+, `@cloudflare/vitest-pool-workers`, Nuxt Test Utils, Playwright, GitHub Actions, Wrangler Pages Direct Upload.

## Global Constraints

- Work in `/Users/liruiyu/Desktop/project/blog`; do not re-clone, reset, clean, overwrite, or replace the repository.
- The current branch is `setup/personalize`; preserve all existing uncommitted personalization changes.
- Do not run `git commit`, `git push`, merge a Pull Request, or change repository visibility unless the user explicitly authorizes that exact action.
- Product code may create Git commits through the GitHub App only against mocks, a dedicated sandbox repository, or a target explicitly authorized by the user.
- Keep `https://flyovo.cc.cd/`, `https://fly-living.pages.dev/`, and `https://comment.flyovo.cc.cd/` available throughout the cycle.
- Keep the existing Pages project name `fly-living` and use `.output/public` with Wrangler Direct Upload.
- Keep the existing Twikoo D1 database untouched; create a separate D1 database named `fly-living-content`.
- Use a single R2 bucket named `fly-living-media`; public media uses `media.flyovo.cc.cd`.
- Only GitHub login `flyoko` and its configured immutable GitHub user ID may create an admin session.
- Never place GitHub private keys, OAuth client secrets, installation tokens, Cloudflare API tokens, R2 credentials, or session encryption keys in Git, static output, browser storage, or logs.
- Ordinary article content may use direct Git publishing; categories, navigation, module state, footer, weather, and source configuration default to branch plus Pull Request.
- The admin visual target is 70% information-dense workspace and 30% personal creative atmosphere.
- The admin must support light, dark, system, and `prefers-reduced-motion` behavior.
- Every task ends with `git diff --check` and targeted tests, not a commit.
- Production resource creation, Worker deployment, D1 remote migration, R2 custom-domain attachment, GitHub App registration, and GitHub Actions secret creation require an explicit user-approved execution window.

---

## File and Boundary Map

### Existing files to modify

- `package.json`: add workspace-wide test, typecheck, link-check, and Worker commands.
- `pnpm-workspace.yaml`: register `workers/*` packages and add testing/Cloudflare catalogs.
- `eslint.config.mjs`: include Worker and test conventions while continuing to ignore generated plans.
- `.gitignore`: ignore local Worker state, development secrets, Playwright output, and test artifacts.
- `nuxt.config.ts`: add admin route rules, direct `@nuxtjs/mdc` runtime support, and TypeScript includes for shared admin contracts.
- `blog.config.ts`: read validated structured category configuration while preserving current public behavior.
- `app/app.config.ts`: read validated navigation/footer/module configuration while preserving current values.
- `README.md`: document local admin development, Cloudflare resources, required secrets, and deployment order.

### New shared files

- `shared/admin/api.ts`: API success/error envelopes and stable error codes.
- `shared/admin/auth.ts`: session and user DTOs.
- `shared/admin/articles.ts`: article DTOs, frontmatter schema, publish request schemas, and path encoding.
- `shared/admin/media.ts`: media DTOs and upload/list schemas.
- `shared/admin/publishing.ts`: publish-run, PR, check, and deployment DTOs.
- `shared/admin/site-config.ts`: schemas for categories, navigation, footer, modules, weather, and news-source configuration.
- `config/taxonomy/categories.json`: current categories in structured form.
- `config/site/navigation.json`: current public navigation.
- `config/site/footer.json`: footer and social links, including independent GitHub/social and source-code switches.
- `config/site/modules.json`: feature visibility and order.
- `config/site/weather.json`: valid disabled configuration for the later weather cycle.
- `config/news/sources.json`: valid disabled configuration for later source adapters.

### New API Worker package

- `workers/api/package.json`
- `workers/api/tsconfig.json`
- `workers/api/wrangler.jsonc`
- `workers/api/.dev.vars.example`
- `workers/api/migrations/0001_cycle1_foundation.sql`
- `workers/api/src/index.ts`
- `workers/api/src/env.ts`
- `workers/api/src/lib/api-error.ts`
- `workers/api/src/lib/crypto.ts`
- `workers/api/src/lib/github-app.ts`
- `workers/api/src/lib/idempotency.ts`
- `workers/api/src/middleware/context.ts`
- `workers/api/src/middleware/session.ts`
- `workers/api/src/repositories/session-repository.ts`
- `workers/api/src/repositories/audit-repository.ts`
- `workers/api/src/repositories/media-repository.ts`
- `workers/api/src/repositories/publish-repository.ts`
- `workers/api/src/features/auth/routes.ts`
- `workers/api/src/features/health/routes.ts`
- `workers/api/src/features/articles/article-codec.ts`
- `workers/api/src/features/articles/github-repository.ts`
- `workers/api/src/features/articles/article-service.ts`
- `workers/api/src/features/articles/routes.ts`
- `workers/api/src/features/media/file-signatures.ts`
- `workers/api/src/features/media/media-service.ts`
- `workers/api/src/features/media/routes.ts`
- `workers/api/src/features/publishing/publishing-service.ts`
- `workers/api/src/features/publishing/routes.ts`
- `workers/api/src/features/overview/routes.ts`
- `workers/api/test/*.spec.ts`
- `workers/api/vitest.config.ts`

### New edge Worker package

- `workers/edge/package.json`
- `workers/edge/tsconfig.json`
- `workers/edge/wrangler.jsonc`
- `workers/edge/src/index.ts`
- `workers/edge/test/router.spec.ts`
- `workers/edge/vitest.config.ts`

### New Nuxt admin files

- `app/assets/css/admin.scss`
- `app/layouts/admin.vue`
- `app/middleware/admin-auth.ts`
- `app/types/admin.ts`
- `app/stores/admin.ts`
- `app/composables/useAdminApi.ts`
- `app/composables/useAdminDraft.ts`
- `app/components/admin/AdminSidebar.vue`
- `app/components/admin/AdminTopbar.vue`
- `app/components/admin/AdminStatusCard.vue`
- `app/components/admin/AdminEmptyState.vue`
- `app/components/admin/AdminArticleEditor.vue`
- `app/components/admin/AdminMediaPicker.vue`
- `app/components/admin/AdminPublishStatus.vue`
- `app/pages/admin.vue`
- `app/pages/admin/login.vue`
- `app/pages/admin/index.vue`
- `app/pages/admin/articles/index.vue`
- `app/pages/admin/articles/new.vue`
- `app/pages/admin/articles/[id].vue`
- `app/pages/admin/media.vue`
- `app/pages/admin/reviews.vue`
- `app/pages/admin/settings.vue`
- `app/pages/admin/[section].vue`
- `test/nuxt/*.spec.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `e2e/admin.spec.ts`
- `e2e/fixtures/admin-api.ts`

### New CI and operations files

- `.github/workflows/quality.yml`
- `.github/workflows/pages-preview.yml`
- `.github/workflows/pages-production.yml`
- `.github/workflows/workers-production.yml`
- `scripts/check-generated-links.ts`
- `scripts/verify-no-secrets.ts`
- `docs/operations/admin-platform.md`
- `docs/operations/cycle-1-acceptance-report.md`

---

### Task 1: Establish workspace packages and test commands

**Files:**
- Modify: `package.json:13-28,63-90`
- Modify: `pnpm-workspace.yaml:1-55`
- Modify: `eslint.config.mjs:1-49`
- Modify: `.gitignore`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `test/nuxt/smoke.spec.ts`

**Interfaces:**
- Consumes: existing root Nuxt package and pnpm catalogs.
- Produces: root scripts `typecheck`, `test:unit`, `test:workers`, `test:e2e`, `check:links`, `verify`, plus workspace discovery for `workers/*`.

- [ ] **Step 1: Add a failing Nuxt smoke test**

```ts
// test/nuxt/smoke.spec.ts
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('public site smoke', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
  })

  it('renders the existing home page', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('fly living')
  })
})
```

- [ ] **Step 2: Add testing and Cloudflare workspace dependencies**

Run:

```bash
pnpm add -D @nuxt/test-utils@^4.0.3 @playwright/test@latest happy-dom@latest vitest@^4.1.0 vue-tsc@latest
pnpm add @nuxtjs/mdc@latest
```

Add workspace package discovery to the top of `pnpm-workspace.yaml`; preserve the existing catalog groups below it:

```yaml
packages:
  - .
  - workers/*
```

Keep the exact package versions selected by pnpm in `package.json` and `pnpm-lock.yaml`. Cloudflare's Workers test pool is installed later with its current compatible release and must retain Vitest 4.1 or newer.

- [ ] **Step 3: Add root scripts**

Update `package.json` scripts to include:

```json
{
  "typecheck": "nuxt typecheck && pnpm --filter './workers/*' -r --if-present typecheck",
  "test:unit": "vitest run --config vitest.config.ts",
  "test:workers": "pnpm --filter './workers/*' -r --if-present test",
  "test:e2e": "playwright test",
  "check:links": "unrun scripts/check-generated-links.ts",
  "check:secrets": "unrun scripts/verify-no-secrets.ts",
  "verify": "pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:workers && pnpm generate && pnpm check:links && pnpm check:secrets"
}
```

- [ ] **Step 4: Configure Vitest and Playwright**

```ts
// vitest.config.ts
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/nuxt/**/*.spec.ts', 'test/shared/**/*.spec.ts'],
    restoreMocks: true,
  },
})
```

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev:host',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
})
```

- [ ] **Step 5: Extend ignores and lint coverage**

Add to `.gitignore`:

```gitignore
.dev.vars
workers/**/.dev.vars
workers/**/.wrangler
playwright-report
test-results
coverage
```

Extend ESLint ignores only for generated outputs, not Worker source or tests.

- [ ] **Step 6: Verify the harness**

Run:

```bash
pnpm prepare
pnpm test:unit -- test/nuxt/smoke.spec.ts
pnpm typecheck
git diff --check
```

Expected: the smoke test passes, Nuxt types generate, and no Worker package is required yet.

---

### Task 2: Define stable shared contracts and structured site configuration

**Files:**
- Create: `shared/admin/api.ts`
- Create: `shared/admin/auth.ts`
- Create: `shared/admin/articles.ts`
- Create: `shared/admin/media.ts`
- Create: `shared/admin/publishing.ts`
- Create: `shared/admin/site-config.ts`
- Create: `test/shared/contracts.spec.ts`
- Create: `config/taxonomy/categories.json`
- Create: `config/site/navigation.json`
- Create: `config/site/footer.json`
- Create: `config/site/modules.json`
- Create: `config/site/weather.json`
- Create: `config/news/sources.json`
- Modify: `blog.config.ts:1-85`
- Modify: `app/app.config.ts:1-100`
- Modify: `nuxt.config.ts:116-124`

**Interfaces:**
- Consumes: current article fields and current public configuration values.
- Produces: shared Zod schemas and DTOs imported by both Nuxt and Workers; JSON configuration that preserves current rendered behavior.

- [ ] **Step 1: Write failing schema tests**

```ts
// test/shared/contracts.spec.ts
import { describe, expect, it } from 'vitest'
import { articleDocumentSchema, decodeArticleId, encodeArticleId } from '../../shared/admin/articles'
import { categoriesConfigSchema } from '../../shared/admin/site-config'

describe('admin contracts', () => {
  it('round-trips an article repository path', () => {
    const path = 'content/posts/2026/welcome.md'
    expect(decodeArticleId(encodeArticleId(path))).toBe(path)
  })

  it('preserves unknown legal frontmatter', () => {
    const parsed = articleDocumentSchema.parse({
      path: 'content/posts/2026/welcome.md',
      sha: 'abc',
      body: '# Hello',
      frontmatter: { title: 'Hello', custom: 'keep-me' },
    })
    expect(parsed.frontmatter.custom).toBe('keep-me')
  })

  it('rejects duplicate category names', () => {
    expect(() => categoriesConfigSchema.parse([
      { name: '技术', icon: 'tabler:code' },
      { name: '技术', icon: 'tabler:mouse' },
    ])).toThrow()
  })
})
```

- [ ] **Step 2: Implement API and auth contracts**

```ts
// shared/admin/api.ts
export const apiErrorCodes = [
  'UNAUTHENTICATED', 'FORBIDDEN', 'CSRF_INVALID', 'VALIDATION_FAILED',
  'CONFLICT', 'NOT_FOUND', 'RATE_LIMITED', 'UPSTREAM_FAILED',
  'DEPLOYMENT_FAILED', 'INTERNAL_ERROR',
] as const

export type ApiErrorCode = typeof apiErrorCodes[number]
export interface ApiSuccess<T> { ok: true, data: T, requestId: string }
export interface ApiFailure { ok: false, error: { code: ApiErrorCode, message: string, requestId: string, details?: unknown } }
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure
```

```ts
// shared/admin/auth.ts
export interface AdminUser {
  id: string
  login: string
  avatarUrl: string
}

export interface AdminSessionDto {
  authenticated: boolean
  user?: AdminUser
  expiresAt?: string
}
```

- [ ] **Step 3: Implement article, media, and publishing contracts**

Use Zod `.passthrough()` for frontmatter, require repository paths to start with `content/posts/`, and encode IDs with URL-safe Base64. Define these exported names exactly:

```ts
export const articleFrontmatterSchema
export const articleDocumentSchema
export const articleSaveRequestSchema
export function encodeArticleId(path: string): string
export function decodeArticleId(id: string): string
export const mediaUploadPurposeSchema
export const configPullRequestSchema
export type ArticleDocument
export type ArticleSummary
export type MediaObjectDto
export type PublishRunDto
```

- [ ] **Step 4: Implement validated site configuration schemas**

`shared/admin/site-config.ts` must export:

```ts
export const categoriesConfigSchema
export const navigationConfigSchema
export const footerConfigSchema
export const modulesConfigSchema
export const weatherConfigSchema
export const newsSourcesConfigSchema
```

Each schema must reject duplicate IDs/names and unknown module IDs. The allowed cycle-1 module IDs are:

```ts
['articles', 'about', 'moments', 'ai-news', 'weather', 'music', 'links', 'archive']
```

- [ ] **Step 5: Move current values into JSON without changing output**

Create JSON files containing the existing categories, navigation, footer, GitHub social link, theme/source links, and disabled future modules. `footer.json` must separate:

```json
{
  "showPersonalGitHub": true,
  "showThemeSource": true,
  "showSiteSource": true
}
```

Cycle 1 preserves current public output; the later public-visual cycle will default the source switches to `false`.

- [ ] **Step 6: Wire JSON into current configuration**

In `blog.config.ts`, parse `categories.json` once and derive the existing category object. In `app/app.config.ts`, parse navigation/footer/modules JSON and map them into the current `Nav` structures. Fail the build on invalid configuration.

- [ ] **Step 7: Verify compatibility**

Run:

```bash
pnpm test:unit -- test/shared/contracts.spec.ts
pnpm typecheck
pnpm generate
pnpm check:feed

git diff --check
```

Expected: tests pass and the generated public navigation/footer remain unchanged.

---

### Task 3: Scaffold the API Worker and uniform request/error pipeline

**Files:**
- Create: `workers/api/package.json`
- Create: `workers/api/tsconfig.json`
- Create: `workers/api/wrangler.jsonc`
- Create: `workers/api/.dev.vars.example`
- Create: `workers/api/src/env.ts`
- Create: `workers/api/src/index.ts`
- Create: `workers/api/src/lib/api-error.ts`
- Create: `workers/api/src/middleware/context.ts`
- Create: `workers/api/src/features/health/routes.ts`
- Create: `workers/api/test/health.spec.ts`
- Create: `workers/api/vitest.config.ts`

**Interfaces:**
- Consumes: shared API contracts from Task 2.
- Produces: `app.fetch(request, env, ctx)`, request IDs, stable JSON envelopes, and `/api/health`.

- [ ] **Step 1: Create package metadata and install dependencies**

```json
{
  "name": "@fly-living/api-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "types": "wrangler types",
    "typecheck": "wrangler types && tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "deploy": "wrangler deploy"
  }
}
```

Run:

```bash
pnpm --filter @fly-living/api-worker add hono jose gray-matter yaml zod@catalog:content
pnpm --filter @fly-living/api-worker add -D @cloudflare/vitest-pool-workers@latest @cloudflare/workers-types@latest vitest@^4.1.0 wrangler@latest typescript@catalog:framework
```

- [ ] **Step 2: Write failing health and error-envelope tests**

```ts
import { exports } from 'cloudflare:workers'

it('returns a request id and service status', async () => {
  const response = await exports.default.fetch('https://example.test/api/health')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    ok: true,
    data: { service: 'fly-living-api', status: 'ok' },
  })
  expect(response.headers.get('x-request-id')).toBeTruthy()
})

it('uses the stable not-found envelope', async () => {
  const response = await exports.default.fetch('https://example.test/api/missing')
  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND' },
  })
})
```

- [ ] **Step 3: Define Worker bindings**

```ts
// workers/api/src/env.ts
export interface Env {
  DB: D1Database
  MEDIA: R2Bucket
  AUTH_RATE_LIMITER: RateLimit
  WRITE_RATE_LIMITER: RateLimit
  PUBLIC_ORIGIN: string
  PAGES_ORIGIN: string
  MEDIA_ORIGIN: string
  GITHUB_API_BASE_URL: string
  GITHUB_OWNER: string
  GITHUB_REPO: string
  GITHUB_DEFAULT_BRANCH: string
  GITHUB_APP_ID: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  GITHUB_PRIVATE_KEY: string
  GITHUB_INSTALLATION_ID: string
  GITHUB_ALLOWED_LOGIN: string
  GITHUB_ALLOWED_USER_ID: string
  SESSION_ENCRYPTION_KEY: string
}

export interface Variables {
  requestId: string
  session?: import('../../../shared/admin/auth').AdminUser & { sessionId: string, csrfHash: string }
}
```

Create a safe template that contains names and non-secret local values only:

```dotenv
# workers/api/.dev.vars.example
PUBLIC_ORIGIN=http://127.0.0.1:3000
PAGES_ORIGIN=http://127.0.0.1:3000
MEDIA_ORIGIN=http://127.0.0.1:8787/media
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_OWNER=flyoko
GITHUB_REPO=fly-blog
GITHUB_DEFAULT_BRANCH=main
GITHUB_APP_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_PRIVATE_KEY=
GITHUB_INSTALLATION_ID=
GITHUB_ALLOWED_LOGIN=flyoko
GITHUB_ALLOWED_USER_ID=
SESSION_ENCRYPTION_KEY=
```

Developers copy it to the ignored `workers/api/.dev.vars` and fill secrets locally. The example file must never contain a real ID, key, token, or private-key body.

- [ ] **Step 4: Implement error and context middleware**

`ApiError` must carry code, HTTP status, safe message, and optional details. The global handler must never serialize stack traces or secrets. `contextMiddleware` must accept a valid incoming `x-request-id` or generate `crypto.randomUUID()`.

- [ ] **Step 5: Build the Hono entry point**

```ts
const app = new Hono<{ Bindings: Env, Variables: Variables }>()
app.use('*', contextMiddleware)
app.route('/api/health', healthRoutes)
app.notFound(c => failure(c, new ApiError('NOT_FOUND', 404, 'Route not found')))
app.onError((error, c) => failure(c, normalizeError(error)))
export default app
```

- [ ] **Step 6: Configure Wrangler and Vitest**

Use `compatibility_date: "2026-08-03"`, ES modules, `nodejs_compat`, local D1/R2 bindings, two Rate Limiting bindings, and no public Worker route. Keep `workers_dev` disabled in production because the API is intended to be reached through the edge Service Binding.

- [ ] **Step 7: Verify the Worker core**

Run:

```bash
pnpm --filter @fly-living/api-worker test -- health.spec.ts
pnpm --filter @fly-living/api-worker typecheck
git diff --check
```

Expected: health and not-found tests pass.

---

### Task 4: Add D1 migrations, repositories, idempotency, and audit logging

**Files:**
- Create: `workers/api/migrations/0001_cycle1_foundation.sql`
- Create: `workers/api/src/repositories/session-repository.ts`
- Create: `workers/api/src/repositories/audit-repository.ts`
- Create: `workers/api/src/repositories/media-repository.ts`
- Create: `workers/api/src/repositories/publish-repository.ts`
- Create: `workers/api/src/lib/idempotency.ts`
- Create: `workers/api/test/repositories.spec.ts`
- Modify: `workers/api/wrangler.jsonc`

**Interfaces:**
- Consumes: `Env.DB`, stable API errors.
- Produces: `SessionRepository`, `AuditRepository`, `MediaRepository`, `PublishRepository`, and `withIdempotency()`.

- [ ] **Step 1: Write failing repository tests**

Test session creation/expiry/revocation, audit redaction, media status transitions, publish-run updates, and duplicate idempotency keys. Use the Vitest Workers pool D1 binding with migrations applied before each file.

- [ ] **Step 2: Create the initial migration**

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE admin_sessions (
  id_hash TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL,
  github_login TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_login TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  result TEXT NOT NULL CHECK(result IN ('success','failure')),
  request_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  state TEXT NOT NULL CHECK(state IN ('running','complete','failed')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE media_objects (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_key TEXT,
  original_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','trashed','deleted')),
  public_url TEXT,
  created_at TEXT NOT NULL,
  trashed_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_media_objects_created ON media_objects(created_at DESC);

CREATE TABLE media_references (
  media_id TEXT NOT NULL REFERENCES media_objects(id) ON DELETE CASCADE,
  repository_path TEXT NOT NULL,
  repository_sha TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(media_id, repository_path)
);

CREATE TABLE publish_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('direct','pull_request')),
  status TEXT NOT NULL,
  repository_ref TEXT NOT NULL,
  commit_sha TEXT,
  pull_number INTEGER,
  workflow_run_id INTEGER,
  deployment_url TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_publish_runs_updated ON publish_runs(updated_at DESC);
```

- [ ] **Step 3: Implement session and audit repositories**

Hash opaque session IDs and CSRF values with SHA-256 before storage. Repository methods must use prepared statements and expose these exact signatures:

```ts
createSession(input: CreateSessionInput): Promise<void>
findActiveSession(idHash: string, now: string): Promise<SessionRow | null>
touchSession(idHash: string, lastSeenAt: string, expiresAt: string): Promise<void>
revokeSession(idHash: string, revokedAt: string): Promise<void>
writeAudit(input: AuditInput): Promise<void>
```

`writeAudit` must reject metadata keys matching `/secret|token|private.?key|authorization/i`.

- [ ] **Step 4: Implement media and publish repositories**

Media transitions must be conditional (`active -> trashed -> active/deleted`). Publish updates must preserve the original run ID and timestamps.

- [ ] **Step 5: Implement idempotency wrapper**

```ts
export async function withIdempotency<T>(options: {
  db: D1Database
  key: string
  scope: string
  requestBody: unknown
  execute: () => Promise<{ status: number, body: T }>
}): Promise<{ status: number, body: T, replayed: boolean }>
```

A repeated key with a different request hash must throw `CONFLICT`; a complete identical request must replay the stored response.

- [ ] **Step 6: Run migrations and repository tests locally**

```bash
pnpm --filter @fly-living/api-worker wrangler d1 migrations apply DB --local
pnpm --filter @fly-living/api-worker test -- repositories.spec.ts
pnpm --filter @fly-living/api-worker typecheck
git diff --check
```

---

### Task 5: Implement GitHub App login, session cookies, CSRF, and rate limiting

**Files:**
- Create: `workers/api/src/lib/crypto.ts`
- Create: `workers/api/src/lib/github-app.ts`
- Create: `workers/api/src/middleware/session.ts`
- Create: `workers/api/src/features/auth/routes.ts`
- Create: `workers/api/test/auth.spec.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/.dev.vars.example`

**Interfaces:**
- Consumes: session/audit repositories and GitHub App secrets.
- Produces: `/api/auth/login`, `/api/auth/callback`, `/api/auth/session`, `/api/auth/logout`; `requireSession` and `requireCsrf` middleware.

- [ ] **Step 1: Write failing auth-flow tests**

Cover: OAuth state/PKCE creation, state mismatch, allowed account, username match with ID mismatch, session cookie attributes, CSRF rejection, logout, expiry, and rate-limit response.

- [ ] **Step 2: Implement cryptographic helpers**

Use Web Crypto and `jose`:

```ts
export function randomToken(bytes = 32): string
export async function sha256Base64Url(value: string): Promise<string>
export async function sealOAuthState(payload: OAuthState, secret: string): Promise<string>
export async function openOAuthState(token: string, secret: string): Promise<OAuthState>
export async function hashOpaqueToken(token: string): Promise<string>
```

`SESSION_ENCRYPTION_KEY` is a Base64-encoded 32-byte key. The OAuth state cookie expires after 10 minutes.

- [ ] **Step 3: Implement GitHub App JWT and installation-token service**

```ts
export async function createAppJwt(env: Env): Promise<string>
export async function getInstallationToken(env: Env): Promise<{ token: string, expiresAt: string }>
```

Cache only the installation token and expiry in Worker memory; refresh at least five minutes before expiry. Do not assume token length or prefix.

- [ ] **Step 4: Implement login and callback routes**

Login redirects to GitHub with `state`, PKCE `S256`, `redirect_uri`, `allow_signup=false`, and `prompt=select_account`. Callback exchanges the code, requests `/user`, verifies both configured login and immutable user ID, discards the user access token, creates an opaque D1 session, and sets:

```text
fly_admin_session: HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200
fly_admin_csrf: Secure; SameSite=Strict; Path=/; Max-Age=43200
```

- [ ] **Step 5: Implement session and CSRF middleware**

All `/api/admin/*` routes require an active session. `POST`, `PUT`, `PATCH`, and `DELETE` also require `Origin === PUBLIC_ORIGIN` and `x-csrf-token` matching the stored hash.

- [ ] **Step 6: Attach Rate Limiting bindings**

Use `AUTH_RATE_LIMITER` keyed by normalized login-flow IP plus route and `WRITE_RATE_LIMITER` keyed by GitHub user ID plus route. Return code `RATE_LIMITED` and HTTP 429 without calling GitHub, D1 write operations, or R2 after a failed limit check.

- [ ] **Step 7: Verify auth**

```bash
pnpm --filter @fly-living/api-worker test -- auth.spec.ts
pnpm --filter @fly-living/api-worker typecheck
git diff --check
```

---

### Task 6: Implement the GitHub repository client and article codec

**Files:**
- Create: `workers/api/src/features/articles/article-codec.ts`
- Create: `workers/api/src/features/articles/github-repository.ts`
- Create: `workers/api/test/article-codec.spec.ts`
- Create: `workers/api/test/github-repository.spec.ts`

**Interfaces:**
- Consumes: GitHub installation token service and shared article schemas.
- Produces: `parseArticle`, `serializeArticle`, and `GitHubRepository` methods for read/list/atomic commit/branch/PR/checks/deployments.

- [ ] **Step 1: Write failing codec tests**

Include round-trip preservation of unknown frontmatter, valid dates, categories/tags defaults, empty body, invalid path, invalid YAML, and stable serialization.

- [ ] **Step 2: Implement the article codec**

```ts
export function parseArticle(input: { path: string, sha: string, content: string }): ArticleDocument
export function serializeArticle(document: ArticleDocument): string
export function createArticlePath(input: { year: number, slug: string }): string
```

Use `gray-matter` and `yaml`. Reject path traversal, NUL bytes, and paths outside `content/posts/`. Slugs match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.

- [ ] **Step 3: Write failing GitHub API tests with mocked fetch**

Test installation-token headers, repository tree listing, file decoding, non-force ref update, SHA conflict, branch creation, Pull Request creation, check-run aggregation, and deployment URL extraction.

- [ ] **Step 4: Implement `GitHubRepository`**

```ts
interface GitHubRepository {
  listFiles(prefix: string, ref: string): Promise<Array<{ path: string, sha: string }>>
  getFile(path: string, ref: string): Promise<{ path: string, sha: string, content: string }>
  createAtomicCommit(input: { branch: string, expectedHeadSha: string, message: string, files: Array<{ path: string, content: string | null }> }): Promise<{ commitSha: string }>
  createBranch(input: { name: string, fromSha: string }): Promise<void>
  createPullRequest(input: { head: string, base: string, title: string, body: string }): Promise<{ number: number, url: string }>
  getPullRequest(number: number): Promise<PullRequestDto>
  mergePullRequest(number: number, expectedHeadSha: string): Promise<{ merged: boolean, sha?: string }>
  getChecks(ref: string): Promise<CheckSummaryDto>
  getDeployment(ref: string): Promise<DeploymentDto | null>
}
```

Use Git Data APIs for atomic commits and `force: false` when updating a ref.

- [ ] **Step 5: Verify repository logic**

```bash
pnpm --filter @fly-living/api-worker test -- article-codec.spec.ts github-repository.spec.ts
pnpm --filter @fly-living/api-worker typecheck
git diff --check
```

---

### Task 7: Add article list, read, validation, direct publish, and conflict APIs

**Files:**
- Create: `workers/api/src/features/articles/article-service.ts`
- Create: `workers/api/src/features/articles/routes.ts`
- Create: `workers/api/test/articles.spec.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/repositories/publish-repository.ts`

**Interfaces:**
- Consumes: `GitHubRepository`, article codec, session middleware, idempotency, audit, publish repository.
- Produces: article admin endpoints and direct publish runs.

- [ ] **Step 1: Write failing article-route tests**

Cover list filtering/pagination, get by encoded ID, create, update, validation errors, missing category, stale SHA conflict, idempotent duplicate publish, path whitelist, and an upstream GitHub failure.

- [ ] **Step 2: Implement article list and read**

Routes:

```text
GET /api/admin/articles?page=1&pageSize=20&query=&category=&draft=
GET /api/admin/articles/:id
POST /api/admin/articles/validate
```

List at most 20 items per page and use a concurrency limit of five file reads.

- [ ] **Step 3: Implement create/update direct publishing**

Routes:

```text
POST /api/admin/articles
PUT /api/admin/articles/:id
```

Request body includes `{ document, expectedSha, mode: 'direct' | 'pull_request', idempotencyKey }`. This task implements `direct`; `pull_request` returns a controlled `VALIDATION_FAILED` message until Task 9 wires it.

- [ ] **Step 4: Record publish and audit state**

Create `publish_runs` before GitHub mutation, update to `commit_created`, then `checks_pending`. On conflict, mark `conflict`; on upstream failure, mark `failed`. Return the `publishRunId` and `commitSha`.

- [ ] **Step 5: Synchronize media references**

After a successful commit, extract `MEDIA_ORIGIN` URLs from Markdown and replace `media_references` for the article path and new SHA in one D1 batch.

- [ ] **Step 6: Verify article APIs**

```bash
pnpm --filter @fly-living/api-worker test -- articles.spec.ts
pnpm --filter @fly-living/api-worker typecheck
git diff --check
```

---

### Task 8: Implement the R2 media library, signatures, trash, restore, and reference protection

**Files:**
- Create: `workers/api/src/features/media/file-signatures.ts`
- Create: `workers/api/src/features/media/media-service.ts`
- Create: `workers/api/src/features/media/routes.ts`
- Create: `workers/api/test/media.spec.ts`
- Modify: `workers/api/src/index.ts`

**Interfaces:**
- Consumes: `Env.MEDIA`, media repository, session/CSRF/rate limit/idempotency.
- Produces: upload/list/trash/restore/permanent-delete APIs and stable public URLs.

- [ ] **Step 1: Write failing media tests**

Cover PNG/JPEG/WebP/GIF and MP3/OGG/WAV signatures, spoofed extensions, image size over 20 MiB, audio size over 80 MiB, multipart partial failure, pagination, trash copy/delete, restore, referenced permanent delete, and duplicate idempotency keys.

- [ ] **Step 2: Implement signature validation**

```ts
export function detectAllowedMedia(bytes: Uint8Array): { extension: string, mime: string, kind: 'image' | 'audio' } | null
export function maxBytesFor(kind: 'image' | 'audio'): number
```

Do not trust the browser MIME or extension. Compute SHA-256 from bytes.

- [ ] **Step 3: Implement stable R2 keys**

```ts
export function buildMediaKey(input: { purpose: 'article' | 'music' | 'profile', extension: string, now: Date, id: string }): string
```

Use `public/articles/YYYY/MM/`, `public/music/audio/`, `public/music/covers/`, and `public/profile/`. Use UUIDs, never original names, in object keys.

- [ ] **Step 4: Implement routes**

```text
POST /api/admin/media
GET /api/admin/media?page=1&pageSize=40&type=&query=&status=active
DELETE /api/admin/media/:id
POST /api/admin/media/:id/restore
DELETE /api/admin/media/:id/permanent
```

Multipart uploads return one result per file. A failed item must not remove successful items.

- [ ] **Step 5: Implement trash and reference protection**

Trash copies the object to `trash/{mediaId}/{filename}`, verifies the copy, deletes the original, and updates D1. Permanent delete requires zero references unless the request includes a second high-risk confirmation token generated for that media ID and expiring after five minutes.

- [ ] **Step 6: Verify media APIs**

```bash
pnpm --filter @fly-living/api-worker test -- media.spec.ts
pnpm --filter @fly-living/api-worker typecheck
git diff --check
```

---

### Task 9: Add controlled configuration Pull Requests, checks, preview status, and merge guard

**Files:**
- Create: `workers/api/src/features/publishing/publishing-service.ts`
- Create: `workers/api/src/features/publishing/routes.ts`
- Create: `workers/api/test/publishing.spec.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/features/articles/routes.ts`

**Interfaces:**
- Consumes: site-config schemas, `GitHubRepository`, publish/audit repositories, idempotency.
- Produces: PR publishing for articles/config, publish history, checks, deployment URL, guarded merge.

- [ ] **Step 1: Write failing publishing tests**

Cover allowed config paths, rejected arbitrary paths, unique branch names, successful PR, duplicate idempotency key, failing checks, missing preview, guarded merge, stale PR head, and merged production run linkage.

- [ ] **Step 2: Implement configuration file map**

```ts
const editableConfigFiles = {
  categories: { path: 'config/taxonomy/categories.json', schema: categoriesConfigSchema },
  navigation: { path: 'config/site/navigation.json', schema: navigationConfigSchema },
  footer: { path: 'config/site/footer.json', schema: footerConfigSchema },
  modules: { path: 'config/site/modules.json', schema: modulesConfigSchema },
  weather: { path: 'config/site/weather.json', schema: weatherConfigSchema },
  newsSources: { path: 'config/news/sources.json', schema: newsSourcesConfigSchema },
} as const
```

The client selects a key; it never supplies a repository path.

- [ ] **Step 3: Implement PR creation**

Route:

```text
POST /api/admin/publishing/pull-requests
```

Create branch `admin/{kind}/{yyyyMMdd-HHmmss}-{random6}`, commit validated files, create a PR, and record the run. Article routes with `mode: 'pull_request'` call the same service.

- [ ] **Step 4: Implement status endpoints**

```text
GET /api/admin/publishing/runs?page=1&pageSize=30
GET /api/admin/publishing/pull-requests/:number
POST /api/admin/publishing/pull-requests/:number/merge
```

The detail endpoint combines PR head SHA, check runs, workflow runs, and GitHub Deployment environment URL.

- [ ] **Step 5: Implement merge guard**

Merge only when the current head equals the caller's expected head, all required checks are successful, a preview deployment URL exists, and the PR is mergeable. Return a safe reason instead of attempting merge otherwise.

- [ ] **Step 6: Verify publishing**

```bash
pnpm --filter @fly-living/api-worker test -- publishing.spec.ts
pnpm --filter @fly-living/api-worker typecheck
git diff --check
```

---

### Task 10: Add overview and health aggregation APIs

**Files:**
- Create: `workers/api/src/features/overview/routes.ts`
- Create: `workers/api/test/overview.spec.ts`
- Modify: `workers/api/src/index.ts`

**Interfaces:**
- Consumes: article list, media repository, publish repository, D1/R2/GitHub health probes.
- Produces: `/api/admin/overview` and dependency-specific status using only measured data.

- [ ] **Step 1: Write failing overview tests**

Test all-healthy response, one dependency failure, stale deployment state, zero-content state, and upstream timeout.

- [ ] **Step 2: Implement bounded health probes**

Each dependency probe has a two-second timeout and returns:

```ts
interface ServiceHealth {
  service: 'github' | 'd1' | 'r2' | 'pages'
  status: 'ok' | 'degraded' | 'down'
  checkedAt: string
  message?: string
}
```

Never fail the entire overview because one probe fails.

- [ ] **Step 3: Implement real overview counts**

Return article count, active media count, open admin PR count, pending/failed publish count, latest publish run, and service health. Do not include the prototype numbers.

- [ ] **Step 4: Verify overview**

```bash
pnpm --filter @fly-living/api-worker test -- overview.spec.ts
pnpm --filter @fly-living/api-worker typecheck
git diff --check
```

---

### Task 11: Bring the existing edge Worker into source control and add same-origin routing

**Files:**
- Create: `workers/edge/package.json`
- Create: `workers/edge/tsconfig.json`
- Create: `workers/edge/wrangler.jsonc`
- Create: `workers/edge/src/index.ts`
- Create: `workers/edge/test/router.spec.ts`
- Create: `workers/edge/vitest.config.ts`

**Interfaces:**
- Consumes: Service Binding `API`, `PAGES_ORIGIN`.
- Produces: same-origin forwarding for `/api/auth/*`, `/api/admin/*`, and `/api/health`; Pages proxy for all other paths, including the existing static `/api/stats`.

- [ ] **Step 1: Write failing routing tests**

Test admin/auth/health routing to `env.API.fetch()`, public page proxy to Pages, `/api/stats` proxy to Pages, method/body/header preservation, and upstream error handling.

- [ ] **Step 2: Create the edge package**

Use the same Worker test/tool versions as the API package. Keep `name: "fly-living-edge"`, `workers_dev: false`, a Service Binding named `API` targeting `fly-living-api`, and `PAGES_ORIGIN: "https://fly-living.pages.dev"`.

- [ ] **Step 3: Implement explicit route selection**

```ts
const apiPrefixes = ['/api/auth/', '/api/admin/']
const apiExact = new Set(['/api/health'])

function shouldUseApi(pathname: string): boolean {
  return apiExact.has(pathname) || apiPrefixes.some(prefix => pathname.startsWith(prefix))
}
```

For Pages proxying, construct a new URL from `PAGES_ORIGIN`, preserve path/search/method/body/headers, and remove only hop-by-hop headers.

- [ ] **Step 4: Verify edge routing**

```bash
pnpm --filter @fly-living/edge-worker test
pnpm --filter @fly-living/edge-worker typecheck
git diff --check
```

Expected: `/api/stats` still resolves to the static Pages asset.

---

### Task 12: Build the admin layout, login/session store, navigation, dashboard, and later-cycle unavailable states

**Files:**
- Create: `app/assets/css/admin.scss`
- Create: `app/layouts/admin.vue`
- Create: `app/middleware/admin-auth.ts`
- Create: `app/types/admin.ts`
- Create: `app/stores/admin.ts`
- Create: `app/composables/useAdminApi.ts`
- Create: `app/components/admin/AdminSidebar.vue`
- Create: `app/components/admin/AdminTopbar.vue`
- Create: `app/components/admin/AdminStatusCard.vue`
- Create: `app/components/admin/AdminEmptyState.vue`
- Create: `app/pages/admin.vue`
- Create: `app/pages/admin/login.vue`
- Create: `app/pages/admin/index.vue`
- Create: `app/pages/admin/[section].vue`
- Create: `test/nuxt/admin-shell.spec.ts`
- Modify: `nuxt.config.ts:69-76,93-99,149-165`

**Interfaces:**
- Consumes: auth/session/overview API contracts.
- Produces: authenticated admin layout, route guard, session store, typed API client, dashboard, and explicit later-cycle unavailable states.

- [ ] **Step 1: Write failing admin-shell tests**

Test unauthenticated redirect, login page rendering, authenticated navigation entries, overview real-data rendering, dependency degradation, dark mode, reduced motion, and later-cycle unavailable-state copy.

- [ ] **Step 2: Implement typed API client**

```ts
export async function useAdminApi<T>(path: string, options: AdminFetchOptions = {}): Promise<T> {
  const csrf = useCookie<string | null>('fly_admin_csrf')
  const response = await $fetch<ApiEnvelope<T>>(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      ...(options.method && options.method !== 'GET' ? { 'x-csrf-token': csrf.value || '' } : {}),
    },
  })
  if (!response.ok)
    throw new AdminApiError(response.error)
  return response.data
}
```

Do not put the session ID or GitHub token in Pinia or local storage.

- [ ] **Step 3: Implement the admin route shell, session store, and middleware**

`useAdminStore()` exposes `session`, `loadSession()`, `logout()`, and `isAuthenticated`. Middleware allows `/admin/login`, otherwise loads `/api/auth/session` and redirects to login when unauthenticated.

```vue
<!-- app/pages/admin.vue -->
<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'admin-auth',
})
</script>

<template>
  <NuxtPage />
</template>
```

Add client-only admin route rules so static generation emits an application shell and never tries to fetch private API data at build time:

```ts
routeRules: {
  '/admin': { ssr: false },
  '/admin/**': { ssr: false },
}
```

- [ ] **Step 4: Implement the 70/30 admin shell**

Use a fixed desktop sidebar, compact mobile drawer, gradient welcome area, accessible focus states, CSS variables compatible with existing color mode, and no continuous decorative animation. Include all ten confirmed navigation entries.

- [ ] **Step 5: Implement dashboard and later-cycle unavailable states**

Dashboard requests `/api/admin/overview`; the `moments`, `ai-news`, `about`, and `music` routes show a named later-cycle unavailable state and never show invented records.

- [ ] **Step 6: Verify admin shell**

```bash
pnpm test:unit -- test/nuxt/admin-shell.spec.ts
pnpm typecheck
pnpm generate
git diff --check
```

Expected: `/admin`, `/admin/login`, and later-cycle unavailable routes are prerendered as static shells without embedding private data.

---

### Task 13: Build article management, Markdown preview, local drafts, and media insertion

**Files:**
- Create: `app/composables/useAdminDraft.ts`
- Create: `app/components/admin/AdminArticleEditor.vue`
- Create: `app/components/admin/AdminMediaPicker.vue`
- Create: `app/pages/admin/articles/index.vue`
- Create: `app/pages/admin/articles/new.vue`
- Create: `app/pages/admin/articles/[id].vue`
- Create: `test/nuxt/article-editor.spec.ts`

**Interfaces:**
- Consumes: article/media APIs and shared schemas.
- Produces: searchable article list, three-pane editor, preview, validation, draft recovery, direct/PR publish actions, and media insertion.

- [ ] **Step 1: Write failing article UI tests**

Test list filters, document load, unknown-frontmatter preservation, field validation, preview failure without data loss, local draft recovery, direct publish, PR publish, SHA conflict, session expiry, and media insertion.

- [ ] **Step 2: Implement local draft storage**

```ts
interface StoredAdminDraft {
  version: 1
  repositoryPath: string
  baseSha: string | null
  savedAt: string
  document: ArticleDocument
}
```

Use IndexedDB via a small composable, not localStorage. Key drafts by repository path plus base SHA. Clear only after a confirmed GitHub mutation.

- [ ] **Step 3: Implement Markdown preview**

Use `parseMarkdown` from `@nuxtjs/mdc/runtime` with a 250 ms debounce and render through `MDCRenderer`. Catch parser errors and keep the last successful preview visible with a warning.

- [ ] **Step 4: Implement article list and editor routes**

The editor has:

```text
left: article list/search/status
center: Markdown textarea and preview tabs
right: title, description, dates, categories, tags, type, image, permalink, draft, publish mode
```

Use shared Zod schemas before sending requests.

- [ ] **Step 5: Implement conflict UX**

On API `CONFLICT`, keep the local draft and show actions: reload remote, compare raw Markdown, or create a new PR from the local version. Never silently overwrite.

- [ ] **Step 6: Implement media picker insertion**

Select an active image from `/api/admin/media` and insert `![alt](publicUrl)` at the cursor. The preview must use the same URL.

- [ ] **Step 7: Verify article UI**

```bash
pnpm test:unit -- test/nuxt/article-editor.spec.ts
pnpm typecheck
pnpm generate
git diff --check
```

---

### Task 14: Build media, settings-PR, and publish-review admin pages

**Files:**
- Create: `app/components/admin/AdminPublishStatus.vue`
- Create: `app/pages/admin/media.vue`
- Create: `app/pages/admin/settings.vue`
- Create: `app/pages/admin/reviews.vue`
- Create: `test/nuxt/media-review.spec.ts`

**Interfaces:**
- Consumes: media, config PR, publish run, PR status, and merge endpoints.
- Produces: upload/list/trash/restore UI, structured settings editor, PR preview/check display, guarded merge UI.

- [ ] **Step 1: Write failing UI tests**

Test upload progress, partial failure, filtering, trash/restore, reference protection, category config validation, PR creation, failing-check display, preview link, disabled merge, and successful merge confirmation.

- [ ] **Step 2: Implement the media page**

Use drag-and-drop plus a normal file input. Show one status row per file. Never clear successful results because another file failed. Display type, bytes, creation time, URL copy, insert action, trash, restore, and references.

- [ ] **Step 3: Implement structured settings forms**

Provide forms for categories, navigation, footer switches, and module order. Weather and source settings remain visibly disabled until their later cycle. Saving calls the PR API; there is no direct-production option.

- [ ] **Step 4: Implement review page**

List direct publish and PR runs. PR detail displays changed config keys/files, checks, preview URL, GitHub link, head SHA, and merge state.

- [ ] **Step 5: Implement high-risk confirmation**

Permanent media deletion and PR merge require a modal that repeats the exact target and requires typing `DELETE` or `MERGE`. The server remains the final authority.

- [ ] **Step 6: Verify admin pages**

```bash
pnpm test:unit -- test/nuxt/media-review.spec.ts
pnpm typecheck
pnpm generate
git diff --check
```

---

### Task 15: Add CI quality gates, Pages preview/production deployment, and Worker deployment order

**Files:**
- Create: `.github/workflows/quality.yml`
- Create: `.github/workflows/pages-preview.yml`
- Create: `.github/workflows/pages-production.yml`
- Create: `.github/workflows/workers-production.yml`
- Create: `scripts/check-generated-links.ts`
- Create: `scripts/verify-no-secrets.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: root verification scripts and both Worker packages.
- Produces: PR checks, preview URL as a GitHub Deployment, production Pages Direct Upload, API-before-edge deployment, and secret scan.

- [ ] **Step 1: Implement generated-link checker**

The script must crawl `.output/public/**/*.html`, normalize internal `href` values, ignore anchors/mailto/tel/external origins, and fail when the matching HTML/file target does not exist. Print the source file and broken URL.

- [ ] **Step 2: Implement secret scanner**

Scan tracked source plus `.output/public` for known secret names and token/private-key patterns. Exclude lockfile integrity hashes. Exit nonzero on matches and print only path/pattern, never the matched secret value.

- [ ] **Step 3: Add quality workflow**

```yaml
name: Quality
on:
  pull_request:
  push:
    branches: ['**']
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
        with: { version: 11.8.0 }
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm test:workers
      - run: pnpm generate
      - run: pnpm check:links
      - run: pnpm check:secrets
```

- [ ] **Step 4: Add Pages preview workflow**

On Pull Requests from the private repository, run verification, generate, and use `cloudflare/wrangler-action@v4`:

```yaml
- id: deploy
  uses: cloudflare/wrangler-action@v4
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: pages deploy .output/public --project-name=fly-living --branch=pr-${{ github.event.number }}
    gitHubToken: ${{ secrets.GITHUB_TOKEN }}
    packageManager: pnpm
```

The action must create/update a GitHub Deployment with `pages-deployment-alias-url` so the admin publishing API can discover it.

- [ ] **Step 5: Add production Pages workflow**

Trigger only on the repository's configured production branch and `workflow_dispatch`. Re-run all quality gates before Direct Upload. Use the existing `fly-living` Pages project and `.output/public`.

- [ ] **Step 6: Add production Worker workflow with protected environment**

Use GitHub environment `production` with required manual approval. Apply D1 migrations, deploy `fly-living-api`, run `/api/health`, then deploy `fly-living-edge`. Never deploy edge first because its Service Binding target must already exist.

- [ ] **Step 7: Verify workflow syntax locally**

Run:

```bash
pnpm verify
pnpm exec playwright install --with-deps chromium
pnpm test:e2e -- --list
git diff --check
```

Do not trigger remote workflows or add repository secrets without explicit authorization.

---

### Task 16: Add end-to-end admin tests, operational runbook, and acceptance evidence template

**Files:**
- Create: `e2e/admin.spec.ts`
- Create: `e2e/fixtures/admin-api.ts`
- Create: `docs/operations/admin-platform.md`
- Create: `docs/operations/cycle-1-acceptance-report.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete cycle-1 UI/API contracts and deployment workflows.
- Produces: repeatable mocked browser E2E, gated live-chain checklist, resource/deploy/runback instructions, and AC-01 through AC-59 evidence mapping.

- [ ] **Step 1: Implement browser E2E fixtures**

Mock same-origin API responses at the browser boundary for deterministic UI tests. Fixtures must cover authenticated/unauthenticated session, overview, articles, media, direct publish, PR checks, preview URL, conflict, and failure envelopes.

- [ ] **Step 2: Implement core Playwright scenarios**

```ts
test('admin core workflow', async ({ page }) => {
  await mockAuthenticatedAdmin(page)
  await page.goto('/admin')
  await expect(page.getByText('晚上好')).toBeVisible()
  await page.getByRole('link', { name: '文章' }).click()
  await page.getByRole('button', { name: '新建文章' }).click()
  await page.getByLabel('标题').fill('Cycle 1 test article')
  await page.getByLabel('正文').fill('# Test')
  await page.getByRole('button', { name: '直接发布' }).click()
  await expect(page.getByText('提交成功')).toBeVisible()
})
```

Add separate tests for config PR, media partial failure, mobile layout, dark mode, reduced motion, logout, and session expiry.

- [ ] **Step 3: Write the operational runbook**

Document exact order for:

1. make repository private after checking existing forks;
2. register GitHub App and restrict installation to `flyoko/fly-blog`;
3. configure callback `https://flyovo.cc.cd/api/auth/callback`;
4. create D1 with `pnpm --filter @fly-living/api-worker wrangler d1 create fly-living-content --binding DB --update-config`;
5. create R2 with `pnpm --filter @fly-living/api-worker wrangler r2 bucket create fly-living-media`;
6. attach `media.flyovo.cc.cd` as R2 custom domain;
7. put Worker secrets interactively;
8. apply migrations;
9. deploy API then edge;
10. add GitHub Actions secrets;
11. run production and rollback checks.

Do not store actual IDs or secret values in the document.

- [ ] **Step 4: Define rollback procedures**

Include Worker version rollback, Pages deployment rollback, D1 Time Travel/bookmark recovery, R2 trash restore, Git ref reset through GitHub UI, and session revocation.

- [ ] **Step 5: Create acceptance evidence matrix**

`cycle-1-acceptance-report.md` must contain AC-01 through AC-59 with columns: status, automated test, manual evidence, date, notes. Mark all as `Not run` initially rather than claiming completion.

- [ ] **Step 6: Run the complete local verification**

```bash
pnpm verify
pnpm test:e2e
git status --short
git diff --check
```

Expected: all local tests pass; generated output contains no secrets; no commit or push occurs.

- [ ] **Step 7: Stop at the production-authorization gate**

Present the local test report, exact pending dashboard actions, and current `git status`. Wait for explicit authorization before creating remote resources, changing repository visibility, setting secrets, applying remote migrations, deploying Workers, running a live Git write, or triggering production workflows.

---

## Execution Batches

`executing-plans` should use these dependency-aware batches:

1. Serial: Task 1.
2. Parallel after Task 1: Task 2 and Task 3.
3. Serial: Task 4, then Task 5.
4. Parallel after Task 5: Task 6 and Task 8.
5. Serial: Task 7, then Task 9, then Task 10.
6. Parallel: Task 11 and Task 12.
7. Serial: Task 13, then Task 14.
8. Serial: Task 15, then Task 16.

Do not parallelize tasks that modify `package.json`, `pnpm-workspace.yaml`, `nuxt.config.ts`, `workers/api/src/index.ts`, or the same route/page file.

## Plan Self-Review Results

- **Spec coverage:** Cycle 1 private repository, GitHub App auth, same-origin Worker routing, D1, R2, article management, direct publishing, PR publishing, admin shell, audit, error recovery, CI, preview, production deployment, and evidence mapping are assigned to Tasks 1-16.
- **Deferred by design:** Public `/me`, `/moments`, `/ai.news`, weather, music playback, and final public source-link removal remain in later cycles. Cycle 1 only creates explicit unavailable states and valid disabled configuration foundations.
- **Type consistency:** Shared DTO and schema names are defined in Task 2 and consumed consistently by Workers and Nuxt tasks.
- **Security consistency:** Browser stores only the non-HttpOnly CSRF cookie; session and GitHub tokens remain server-side. Git writes use installation tokens, not retained user OAuth tokens.
- **Deployment consistency:** API Worker deploys before edge Worker; Pages remains Direct Upload to the existing project.
- **Repository-safety consistency:** All normal commit steps are replaced by diff/test checkpoints because the user has not authorized commits or pushes.

## Current Official Reference Points

- Cloudflare Wrangler JSON configuration and bindings: `https://developers.cloudflare.com/workers/wrangler/configuration/`
- Cloudflare Service Bindings: `https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/`
- Cloudflare D1 migrations: `https://developers.cloudflare.com/d1/reference/migrations/`
- Cloudflare R2 Workers binding: `https://developers.cloudflare.com/r2/api/workers/workers-api-usage/`
- Cloudflare Workers Vitest integration: `https://developers.cloudflare.com/workers/testing/vitest-integration/`
- Cloudflare Pages Direct Upload CI: `https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/`
- GitHub App user authorization: `https://docs.github.com/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app`
- GitHub App installation authentication: `https://docs.github.com/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation`
