# Architecture Decision Records (ADRs)

Bu yerda Smart Restaurant Campus arxitekturasi bo'yicha muhim qarorlarning **yozma yodgorliklari** saqlanadi.

## Nima uchun ADR?

ADR — bu _qaror sababini_ hujjatlash. Kelajakda kim biror narsani "nega shunday qilingan?" deb so'rasa, ushbu fayllar javob beradi.

## ADR formati

Har ADR quyidagi shaklda yoziladi:

```markdown
# ADR-NNNN: Sarlavha

**Status:** proposed | accepted | deprecated | superseded by ADR-XXXX
**Date:** YYYY-MM-DD
**Decision makers:** kim qabul qildi

## Context

Nima muammo bor edi va nima uchun qaror kerak edi?

## Decision

Aniq qaror nima?

## Consequences

Yaxshi/yomon ta'sirlar. Nima yutamiz, nima yo'qotamiz?

## Alternatives considered

Boshqa qaysi yo'llar ko'rib chiqildi va nega ular tanlanmadi?
```

## Mavjud ADR'lar

| ID                                                      | Sarlavha                                                | Status   |
| ------------------------------------------------------- | ------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)           | Record architecture decisions (meta-ADR)                | accepted |
| [0002](0002-laravel-for-backend.md)                     | Laravel for backend (vs NestJS, FastAPI)                | accepted |
| [0003](0003-monorepo-structure.md)                      | Monorepo with pnpm + Composer + uv                      | accepted |
| [0004](0004-modular-monolith.md)                        | Modular monolith (vs microservices from day one)        | accepted |
| [0005](0005-separate-super-admin-app.md)                | Separate Next.js app for Super Admin                    | accepted |
| [0006](0006-telegram-multibot-architecture.md)          | Telegram multi-bot subsystem (aiogram 3 + FastAPI)      | accepted |
| [0007](0007-single-database-tenancy.md)                 | Single database tenancy for Phase 1                     | accepted |
| [0008](0008-module-contract-standard.md)                | Module contract standard                                | accepted |
| [0009](0009-production-observability-and-kubernetes.md) | Production observability and Kubernetes baseline        | accepted |
| [0010](0010-schema-per-module.md)                       | One PostgreSQL schema per module, PostgreSQL everywhere | accepted |

## ADR yozish

```bash
# Yangi ADR uchun raqam:
ls docs/decisions/*.md | wc -l   # = N. Yangisi: ADR-(N+1)
```

Faylni `NNNN-short-title-in-kebab-case.md` formatida yarating.
