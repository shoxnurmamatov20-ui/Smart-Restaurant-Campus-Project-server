# Architecture Decision Records (ADRs)

Bu yerda CAMPUS arxitekturasi bo'yicha muhim qarorlarning **yozma yodgorliklari** saqlanadi.

## Nima uchun ADR?

ADR — bu *qaror sababini* hujjatlash. Kelajakda kim biror narsani "nega shunday qilingan?" deb so'rasa, ushbu fayllar javob beradi.

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

| ID | Sarlavha | Status |
|----|----------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions (meta-ADR) | accepted |
| [0002](0002-laravel-for-backend.md) | Laravel for backend (vs NestJS, FastAPI) | accepted |
| [0003](0003-monorepo-structure.md) | Monorepo with pnpm + Composer + uv | accepted |
| [0004](0004-modular-monolith.md) | Modular monolith (vs microservices from day one) | accepted |
| [0005](0005-separate-super-admin-app.md) | Separate Next.js app for Super Admin | accepted |

## ADR yozish

```bash
# Yangi ADR uchun raqam:
ls docs/decisions/*.md | wc -l   # = N. Yangisi: ADR-(N+1)
```

Faylni `NNNN-short-title-in-kebab-case.md` formatida yarating.
