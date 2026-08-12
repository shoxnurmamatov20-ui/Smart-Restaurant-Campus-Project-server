# Modul 3 — Oshxona (KDS) (Kitchen Display System)

> Oshxona displey tizimi: chiptalar, sexlar bo'yicha marshrutlash, tayyorlash vaqti nazorati.

**Alias:** `kitchen` · **Namespace:** `Modules\Kitchen` · **API prefiks:** `/api/v1/kitchen`

---

## Asosiy funksiyalar

- KDS ekrani — sexlar bo'yicha (issiq sex, sovuq sex, mangal, bar, konditer)
- Chipta holati: yangi → tayyorlanmoqda → tayyor → berildi
- Tayyorlash vaqti taymeri va kechikish ogohlantirishi (SLA)
- Kurs (podacha) boshqaruvi — taomlarni to'g'ri tartibda chiqarish
- Bump-bar / sensorli ekran uchun optimallashtirilgan interfeys
- Oshpaz bo'yicha yuklama taqsimoti
- Stop-list e'lon qilish (ingredient tugadi)
- Real-time push (Reverb) — ofitsiant "tayyor" xabarini oladi
- O'rtacha tayyorlash vaqti statistikasi

---

## Database jadvallar (rejalashtirilgan)

- `kitchen_stations` — sexlar (issiq, sovuq, mangal, bar)
- `kitchen_tickets` — oshxona chiptalari
- `kitchen_ticket_items` — chipta satrlari
- `kitchen_ticket_events` — holat o'zgarishlari va taymerlar

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/kitchen/                   — modul ma'lumoti
GET    /api/v1/kitchen/stations           — sexlar
GET    /api/v1/kitchen/tickets            — faol chiptalar
PATCH  /api/v1/kitchen/tickets/{ticket}/start — tayyorlashni boshlash
PATCH  /api/v1/kitchen/tickets/{ticket}/ready — tayyor deb belgilash
POST   /api/v1/kitchen/tickets/{ticket}/recall — qaytarib chaqirish
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`kitchen.view`, `kitchen.create`, `kitchen.update`, `kitchen.delete`, `kitchen.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Orders** — buyurtma chiptaga aylanadi
- **Menu** — taomning sexi va standart tayyorlash vaqti
- **Warehouse** — tayyorlangan taom ingredientni hisobdan chiqaradi
- **Analytics** — oshxona samaradorligi ko'rsatkichlari

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Kitchen

# Model + factory
php artisan module:make-model <Name> Kitchen --factory

# Controller
php artisan module:make-controller <Name>Controller Kitchen --api

# Testlar
php artisan test --filter=Modules\\Kitchen
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — KitchenStation, KitchenTicket + KDS oqimi.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
