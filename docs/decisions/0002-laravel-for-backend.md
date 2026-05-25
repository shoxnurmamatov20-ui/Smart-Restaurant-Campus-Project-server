# ADR-0002: Laravel for backend

**Status:** accepted
**Date:** 2026-05-25
**Decision makers:** Project owner

## Context

Backend uchun til/framework tanlash kerak. Variantlar:
1. **Laravel** (PHP) — mature, batteries-included
2. **NestJS** (TypeScript) — frontend bilan bitta til
3. **FastAPI** (Python) — AI/ML uchun ideal
4. **Spring Boot** (Java) — enterprise standart
5. **Microservices polyglot** — har modul alohida til

## Decision

**Laravel 13** ni asosiy backend sifatida tanlaymiz.

## Consequences

**+:**
- O'zbekistonda PHP/Laravel dev'lar ko'p (jamoa topish oson)
- Mature ekosistema (10+ yil, juda barqaror)
- "Batteries included": Auth, Queue, Cache, Mail, Scheduling, Broadcasting — hammasi tayyor
- Eloquent ORM juda kuchli
- HEMIS o'zi ham PHP'da yozilgan — integratsiya tabiiy
- Spatie packagelar (permission, activitylog, medialibrary) — production-grade

**−:**
- Frontend (TypeScript) bilan ikki xil til. Lekin AI/ML ham Python — baribir polyglot.
- Performance Node/Go'dan biroz pastroq. Lekin 10K concurrent user uchun yetarli.
- Real-time uchun Reverb yangi (Reverb 1.x — stable lekin yosh).

## Alternatives considered

| Variant | Nega tanlanmadi |
|---------|-----------------|
| **NestJS** | O'zbekistonda kamroq dev, "batteries included" qismi yo'q |
| **FastAPI** | Web framework sifatida Laravel'cha mature emas, "batteries" yo'q |
| **Spring Boot** | Juda og'ir, dev cycle sekin, O'zbekistonda kamroq dev |
| **Microservices polyglot** | Phase 1 (10 modul) uchun overengineered. 50+ modulda kerak. |

## Note

AI/ML uchun Python alohida service (`apps/ai-services`) sifatida ishlatamiz — Laravel uni internal HTTP orqali chaqiradi. Bu eng yaxshi tanlov.
