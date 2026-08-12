# Modul 4 — Stollar va bronlar (Tables & Reservations)

> Zallar, stollar, joy bandligi, oldindan bron qilish va QR-menyu.

**Alias:** `tables` · **Namespace:** `Modules\Tables` · **API prefiks:** `/api/v1/tables`

---

## Asosiy funksiyalar

- Zallar va stollar reestri (sig'im, joylashuv, tur: VIP/terassa/bar)
- Zal xaritasi — real-time bandlik holati
- Online bron qilish (sayt, Telegram bot, telefon)
- Bron tasdiqlash va eslatma (SMS / Telegram)
- Kutish ro'yxati (waitlist) va navbat boshqaruvi
- Har bir stolga QR-kod — mehmon menyuni ochadi va o'zi buyurtma beradi
- Stolni birlashtirish va bo'lish
- Bron kelmadi (no-show) statistikasi
- Tadbir va banket bronlari (oldindan to'lov bilan)

---

## Database jadvallar (rejalashtirilgan)

- `halls` — zallar
- `tables` — stollar
- `reservations` — bronlar
- `reservation_guests` — bron mehmonlari
- `waitlist_entries` — kutish ro'yxati

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/tables/                    — modul ma'lumoti
GET    /api/v1/tables/halls               — zallar
GET    /api/v1/tables/tables              — stollar va bandlik
POST   /api/v1/tables/reservations        — bron yaratish
PATCH  /api/v1/tables/reservations/{id}   — bronni o'zgartirish
POST   /api/v1/tables/reservations/{id}/confirm — tasdiqlash
GET    /api/v1/public/tables/{code}/menu  — QR-menyu (publik)
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`tables.view`, `tables.create`, `tables.update`, `tables.delete`, `tables.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Orders** — stol sessiyasi shu yerdagi stolga bog'lanadi
- **Crm** — mijoz bron tarixi va afzalliklari
- **Menu** — QR orqali ochiladigan menyu
- **TelegramBots** — bron boti

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Tables

# Model + factory
php artisan module:make-model <Name> Tables --factory

# Controller
php artisan module:make-controller <Name>Controller Tables --api

# Testlar
php artisan test --filter=Modules\\Tables
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — Hall, RestaurantTable, Reservation.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
