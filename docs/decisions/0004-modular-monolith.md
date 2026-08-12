# ADR-0004: Modular monolith (Phase 1)

**Status:** accepted
**Date:** 2026-05-25
**Decision makers:** Project owner + architect

## Context

10 ta Phase-1 modul + kelajakda 20 ta qo'shimcha = jami 30 modul. Mikroservis arxitekturasi ko'p talab qilingan, lekin bu juda murakkab.

## Decision

**Modular monolith** yondashuvi: bitta Laravel ilova, lekin har modul **alohida papka** (`Modules/Menu/`, `Modules/Orders/`, va h.k.) — `nwidart/laravel-modules` paketi orqali.

Kelajakda har modul **microservice**'ga ajratish oson (bir necha kunlik ish).

## Consequences

**+:**

- Boshlang'ich rivojlanish tezroq (bitta deploy, bitta CI)
- Cross-modul savollar SQL JOIN orqali (microservices'da REST/gRPC chaqiruvi)
- Debug oson (bitta log, bitta context)
- Phase 1 da scaling muammosi yo'q

**−:**

- Yagona deploy: bitta moduldagi bug butun tizimni o'chiradi
- Yagona PHP versiya
- 30+ modul'da haqiqiy microservices'ga o'tish kerak bo'ladi (Phase 3-4)

## Migration plan (kelajak)

Microservice'ga ajratish belgilari:

1. Modul juda yuklangan (DB queries 50%+ shu moduldan)
2. Modul boshqa stack istaydi (masalan, AI Chatbot — Python)
3. Modul alohida deploy cycle xohlaydi

Texnik yo'l:

1. Shu modulning `composer.json` ni alohida loyiha sifatida ko'chirish
2. DB jadvallarni alohida schema'ga ajratish
3. Laravel "Modules/X" ni "API client" ga aylantirish (HTTP calls)
4. Yangi service'ni deploy qilish
5. Eski moduldagi kodni o'chirish

## Alternatives considered

| Variant                                | Nega yo'q                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Microservices from day one**         | Phase 1 uchun overengineered. 30+ deploy, service mesh, distributed tracing — juda erta. |
| **Single-folder Laravel (no modules)** | 30 modul kodi `app/Http/Controllers/` ichida — chalkash, refactor qiyin                  |
| **Lumen** (Laravel mikro)              | "Batteries" yo'q, biz ishlatadigan ko'p features yo'q                                    |
