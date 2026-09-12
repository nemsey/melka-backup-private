# Worklog — داشبورد هوشمند چندعامله ملک تبریز

Project: Melk Tabriz Multi-Agent Smart Dashboard (PWA, Persian, RTL)
Owner: سید نعمت اله سیدی
Stack: Next.js 16 App Router + TypeScript + Tailwind 4 + shadcn/ui + Prisma(SQLite) + Recharts

---
Task ID: 1
Agent: main (Super Z)
Task: Initialize environment, plan architecture, build complete app

Work Log:
- Loaded fullstack-dev skill, ran init script, dev server running on port 3000
- Verified deps: recharts, zustand, next-themes, framer-motion, date-fns, full shadcn/ui set
- Architecture plan (decisions):
  * Single-page app at `/` (skill constraint: only `/` visible) — client state machine: auth → otp → home (tiles) → tile detail
  * BFF pattern: Next.js API routes proxy to arm.melketabriz.ir; MOCK mode (default) with realistic Persian mock data; REAL mode ready via env
  * Tile plugin architecture: TileContract + TileRegistry, each tile = self-contained module (page, settings, agent)
  * Per-tile learning agent: append-only memory (Prisma), RAG-lite retrieval (TF similarity), versioned policy with rollback
  * Auth: personnel code → OTP → session; master code for owner (hashed, env-configurable); rate limiting; encrypted client storage (AES-GCM)
  * 3 tiles: معاملات، کارشناسان، تنظیمات عمومی
  * Master code default: 41372895 (documented, env: MASTER_ACCESS_CODE)
  * Persian RTL + Vazirmatn font, Persian digits, emerald/amber palette (no blue/indigo)
  * PWA: manifest + service worker + icons
  * Tests: bun test for core libs
  * Docs: README, ARCHITECTURE, API integration, Capacitor Android build guide → /download

---
Task ID: 1 (final)
Agent: main (Super Z)
Task: Build complete Melk Tabriz multi-agent dashboard

Work Log:
- Prisma schema (8 models: Session, OtpAttempt, AuditLog, TransactionRecord, ExpertRecord, AgentMemory, AgentFeedback, AgentPolicyVersion) + db push
- melk-api abstraction layer: config/env, endpoints registry (documented assumptions), HTTP client (timeout+retry+error normalization), seeded mock provider (realistic Tabriz data), real provider, sync (extract-and-cache)
- Auth infra: SHA-256 token hashing, timing-safe master code compare, DB-backed sliding-window rate limiter with lockout, session lifecycle (create/validate/refresh-rotation/revoke), AES-GCM client secure storage (device key in IndexedDB), API guard
- API routes: request-otp, verify-otp, master-login, session (GET/PATCH/DELETE), crm transactions/experts/meta, agent insight/feedback/stats/policy(+rollback OWNER-only), connection status/reset, health
- Tile plugin architecture: TileContract + defineTile validation + TileRegistry (conflict detection, role filter, ordering); 3 tiles registered via bootstrap
- Learning agents: BaseLearningAgent (append-only memory, TF-cosine RAG-lite retrieval, versioned policy with clamp rule, rollback), TransactionAgent (6 domains), ExpertAgent (5 domains), pure analyzers (monthly series, growth, z-score anomalies, expert stats/performance/segments, concentration, conversion)
- Persian RTL UI: Vazirmatn local fonts, emerald/amber palette, AuthScreen (2 paths), OtpScreen (InputOTP + countdown + resend), DashboardHome (animated tile grid + agent badges), AppHeader (theme/account/logout), TileShell (per-tile settings drawer), AgentPanel (insights + feedback dialog + policy history/rollback), TransactionsPage (9 filters + KPIs + 2 recharts + paginated table), ExpertsPage (6 filters + cards/table + performance), SettingsPage (owner credit first, theme, language, account, connection mgmt + RESET button, app guide accordion)
- PWA: manifest (RTL fa), service worker (static cache-first / API network-first + RESET_CACHES message), PIL-generated icons (any+maskable), SwRegister
- Tests: 65 tests / 813 assertions across 6 files — all pass (bun test with separate test.db)
- Fixed during browser verification: zustand unstable selector (getSnapshot infinite loop) in TileShell; boot() token-not-set-before-validation bug; mock commission/price rounding; Persian decimal/thousands separators; server-side insight digits → Persian
- Browser E2E verified: OTP login happy path, master login, session persistence across reload, tiles open, charts render (pixel-verified 3 colors), feedback submit → policy versioning, rate limiting lockout, unauthorized 401, dark mode, mobile 390px single column, sticky footer, 0 console errors
- Docs: README, ARCHITECTURE, API-INTEGRATION, BUILD-ANDROID (Capacitor+TWA), .env.example — copied to download/melk-tabriz-dashboard-docs/ + dashboard screenshot
- capacitor.config.ts ready; package.json scripts: test, test:db:push

Stage Summary:
- Deliverable: production-grade Persian RTL multi-agent dashboard for Melk Tabriz CRM
- Default master code: 41372895 (env MASTER_ACCESS_CODE, must change before production)
- Mock mode default (MELK_API_MODE=mock); real mode endpoint patterns documented in API-INTEGRATION.md
- All requirements from the master prompt implemented: 2-step OTP auth, master code, reset connection button, per-tile settings, general settings tile with owner credit, learning agents with append-only memory + versioned policies + rollback, plugin architecture, tests, full docs
