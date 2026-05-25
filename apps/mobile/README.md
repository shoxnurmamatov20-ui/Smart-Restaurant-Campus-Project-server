# @campus/mobile (Phase 2 — bo'sh)

React Native + Expo mobile app — **Phase 2'da boshlanadi**.

## Phase 1'da nima qilamiz?
**Hech narsa.** Mobile ilova Phase 2 ga ko'chirildi (foydalanuvchi qarori, 2026-05-25).

## Phase 2 rejasi

- **Framework:** React Native + Expo SDK 52+
- **Til:** TypeScript
- **State:** Zustand + TanStack Query (web bilan ulashish)
- **UI:** React Native Paper yoki NativeWind (Tailwind for RN)
- **Navigation:** Expo Router
- **Auth:** Same Laravel Sanctum tokens

## Phase 2'da boshlash

```bash
cd apps/mobile
pnpm create expo-app . --template blank-typescript
# yoki:
pnpm dlx create-expo-app@latest . --template blank-typescript
```

## Web bilan kod ulashish

Web va mobile ulashiladi:
- `@campus/types` — TS types (User, ApiResponse, etc.)
- `@campus/utils` — helper funktsiyalar
- `@campus/i18n` — tarjimalar
- `@campus/sdk` — API client (axios)
