# CAMPUS — Yagona Raqamli Ekotizim Platformasi

> Smart Campus SaaS for Uzbek higher education. Target scale: extreme (multi-tenant, multi-country).

## Loyiha holati (Status)

- **Status:** Environment setup → ready to plan Phase 1 architecture
- **Code:** Not started yet — user is leading step-by-step
- **Decided:** Phase 1 = the 10 modules from `CAMPUS_Yagona_Raqamli_Platforma.docx`
- **Pending:** Tech stack choice, monorepo layout, first module to scaffold

## Hujjatlar (Documents in this directory)

| File | Purpose |
|------|---------|
| `CAMPUS_Yagona_Raqamli_Platforma.docx` | Original user spec — 10 Phase 1 modules |
| `CAMPUS_30_MODULLAR.md` | Expanded full-scope spec — 30 modules, architecture, tech stack, roadmap |
| `CLAUDE.md` | This file — live working context |

## Phase 1 — 10 modullar

1. **Kadrlar (HR)** — staff mgmt, Face ID + QR attendance
2. **Talabalar (SMS)** — student mgmt, HEMIS integration
3. **Online platform (5–6 kurs)** — live lessons, video conferencing
4. **EDMS** — e-document workflow, E-IMZO
5. **RTTM** — IT inventory & repair tracking
6. **Psixologik test** — psych testing & monitoring
7. **Exam Engine** — online testing, anti-cheat
8. **E-Library** — e-books, QR checkout
9. **Media DAM** — photo/video archive
10. **KPI** — transparent KPI & analytics

Full Phase-1 details: see source `.docx`. Full long-term vision (all 30): see `CAMPUS_30_MODULLAR.md`.

## Tamoyillar (Principles — set by user)

1. **Super ultra pro darajada** — production-grade from day one. No toy/MVP code that needs rewriting.
2. **Bosqichma-bosqich** — step-by-step. User confirms direction before major builds. Don't preemptively scaffold modules they didn't ask for.
3. **Multi-tenant, multi-country, multi-lingual from start** — uz / ru / en at minimum. HEMIS integration is mandatory.
4. **Kengaytiriladigan** — Phase 1 architecture must accept the other 20 modules without rewrite.
5. **Foydalanuvchi bilan o'zbek tilida** — respond to the user in Uzbek. Code/identifiers stay in English.

## Til (Communication)

- **Chat & docs prose:** Uzbek (Latin script)
- **Code, file names, identifiers, comments:** English
- **DB columns, API fields:** English (camelCase or snake_case, TBD with user)

## Tech stack (CONFIRMED 2026-05-25)

| Layer | Choice |
|-------|--------|
| **Backend** | PHP 8.3+ / Laravel 11 (modular monolith) / Eloquent ORM |
| **Auth** | Laravel Sanctum + Keycloak (SSO, later) |
| **Frontend** | Next.js 15 (App Router) + React 19 + TypeScript 5 / Tailwind v4 / shadcn/ui |
| **Mobile** | React Native + Expo (Phase 2 — deferred) |
| **AI/ML** | Python 3.13+ / FastAPI / uv |
| **Database** | PostgreSQL 16 (primary), Redis 7 (cache/queue), ClickHouse (analytics), MinIO (objects) |
| **Monorepo** | pnpm workspaces + Composer + Turborepo |
| **Containers** | Docker + Compose (dev), Kubernetes (prod, later) |
| **Server** | University on-prem: 12 TB disk / 500 GB RAM / Ubuntu Server 24.04 LTS |
| **Code hosting** | GitHub + GitHub Actions |
| **i18n** | next-intl, languages: uz / ru / en |

Full rationale: see memory `project_tech_stack.md`.

❌ Rejected: Prisma (JS-only), Better Auth (JS-only) — user's initial draft had these but they're incompatible with Laravel.

## Working agreements

- Before scaffolding a new module → confirm with user which one and at what depth
- Before adding a new dependency → confirm choice with user
- Before destructive ops (rm, force-push, dropping data) → always confirm
- Memory of project decisions lives in `C:\Users\User\.claude\projects\C--Users-User-Desktop-Smart-Campus\memory\` — read it at session start, update it when decisions are made
