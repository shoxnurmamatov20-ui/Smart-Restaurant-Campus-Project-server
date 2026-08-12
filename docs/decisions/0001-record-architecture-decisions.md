# ADR-0001: Architecture Decision Records (ADRs) yozish

**Status:** accepted
**Date:** 2026-05-25
**Decision makers:** Loyiha jamoasi

## Context

Smart Restaurant Campus — 30+ modulli, 2+ yillik loyiha. Vaqt o'tishi bilan jamoa o'zgaradi, qarorlar unutiladi. Nima uchun X tanlangani haqida savol tug'iladi.

## Decision

Har bir muhim arxitektura qarorini `docs/decisions/` papkasida ADR sifatida yozamiz. ADR formati: Michael Nygard'ning [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) maqolasidan.

## Consequences

**+:** Kelajakdagi jamoa muhim qarorlar sababini biladi
**+:** Yangi a'zolarga onboarding tezroq
**+:** Bir xil qaror takror muhokama qilinmaydi
**−:** ADR yozish vaqt talab qiladi (lekin har qaror uchun ~30 daqiqa)

## Alternatives considered

- **Wiki sahifalari** — yo'qoladi, versiyalanmaydi
- **Issue tracker'da** — qidirish qiyin, kontekst yo'qoladi
- **Code comments** — kichik qarorlar uchun OK, lekin arxitektura uchun yetarsiz
