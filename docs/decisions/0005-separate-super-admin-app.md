# ADR-0005: Separate Next.js app for Super Admin

**Status:** accepted
**Date:** 2026-05-25
**Decision makers:** Project owner

## Context

Super Admin paneli hammasini boshqarishi kerak: foydalanuvchilar, statistika, tizim sozlamalari, audit log, va h.k. Bu **god mode** — xavfsizlik talablari boshqa foydalanuvchilarning ilovasidan ancha qattiqroq.

## Decision

Super Admin paneli **alohida Next.js ilovasi** (`apps/admin/`) bo'ladi, **alohida URL'da** (`admin.campus.uz`).

Asosiy `apps/web/` (talabalar/o'qituvchilar UI) bilan **aralashtirilmaydi**.

## Consequences

**+:**
- **Xavfsizlik perimeter alohida** — admin URL ga IP allowlist qo'yish mumkin
- **Mustaqil deploy** — admin update qiluvchi web foydalanuvchilarni ta'sir qilmaydi
- **UX boshqacha** — admin paneli ko'proq table/chart, web esa ko'proq forms
- **2FA majburiy** — faqat shu ilovada
- **Audit log doimiy** — har admin amal yoziladi

**−:**
- 2 ta Next.js build (CI/CD biroz qimmatroq)
- Shared kod kerak (lekin `packages/ui`, `packages/sdk` orqali hal qilinadi)

## Alternatives considered

| Variant | Nega yo'q |
|---------|-----------|
| **Mixed in `apps/web/`** | Bir kodda admin va non-admin → tasodifiy ruxsat bug'lar xavfli |
| **Filament (Laravel)** | Server-side rendered, Next.js'cha real-time emas |
| **Laravel Nova** | Pulli ($199/site), proprietary |
| **Subdomain via routing** | Bitta build, lekin perimeter ajralmaydi (xavfsizlik xavf) |
