# ADR-0003: Monorepo (pnpm + Composer + uv + Turborepo)

**Status:** accepted
**Date:** 2026-05-25
**Decision makers:** Project owner

## Context

Loyiha bir nechta tildan iborat: TypeScript (web/admin/mobile/packages), PHP (api), Python (ai-services).
Har birini alohida repo qilish yoki bitta monorepo'da yig'ishni tanlash kerak.

## Decision

**Hybrid monorepo** — bitta repo'da hammasi:

- **TypeScript** apps/packages — **pnpm workspaces** + **Turborepo**
- **PHP** (Laravel) — **Composer** (alohida, lekin shu repo'da)
- **Python** (AI) — **uv** (alohida, lekin shu repo'da)

## Consequences

**+:**

- Atomic commits cross-stack (frontend + backend o'zgarishi bir PR'da)
- Shared types: `@restaurant/types` web/admin/mobile o'rtasida ulashiladi
- Bitta git history, bitta CI pipeline
- Onboarding oson (1 git clone)
- Refactoring oson (cross-stack rename)

**−:**

- CI configurar murakkabroq (3 ta til pipeline)
- Repo hajmi katta (lekin pnpm dedup yordam beradi)
- Tooling murakkabroq (Turborepo + pnpm + Composer + uv)

## Alternatives considered

| Variant                            | Nega yo'q                                                   |
| ---------------------------------- | ----------------------------------------------------------- |
| **Polyrepo** (3 ta alohida)        | Cross-stack o'zgarish 3 PR talab qiladi, shared types qiyin |
| **pnpm only** (PHP/Python alohida) | Hybrid monorepo'dan farqi yo'q, lekin docker compose qiyin  |
| **Nx**                             | Turborepo'dan og'irroq, JS'ga ko'proq qaratilgan            |
| **Bazel**                          | Eng kuchli, lekin juda murakkab kichik jamoa uchun          |
