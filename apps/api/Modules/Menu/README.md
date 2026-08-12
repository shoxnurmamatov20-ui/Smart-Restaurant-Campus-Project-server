# Modul 1 — Menyu (Menu)

> Restoran menyusi: kategoriyalar, taomlar, narxlar, modifikatorlar, stop-list.

**Alias:** `menu` · **Namespace:** `Modules\Menu` · **API prefiks:** `/api/v1/menu`

---

## Asosiy funksiyalar

- Kategoriyalar daraxti (issiq taomlar, salatlar, ichimliklar, desertlar)
- Taomlar kartochkasi: rasm, tarkib, chiqish og'irligi, kaloriya, tayyorlash vaqti
- Modifikatorlar va qo'shimchalar (o'tkirligi, garnir, sous, porsiya hajmi)
- Ko'p tilli nomlar va tavsiflar (uz / ru / en)
- Allergenlar va parhez belgilari (halol, vegetarian, gluten-free)
- Narx turlari: zal, olib ketish, yetkazib berish, agregator
- Stop-list — ingredient tugaganda taom avtomatik o'chadi (Warehouse bilan)
- Aksiya narxlari va kunlik taklif (happy hour, biznes-lanch)
- QR-menyu uchun publik API

---

## Database jadvallar (rejalashtirilgan)

- `menu_categories` — kategoriyalar (ierarxik)
- `menu_items` — taomlar
- `menu_item_modifiers` — modifikator guruhlari va variantlari
- `menu_prices` — kanal bo'yicha narxlar (zal/takeaway/delivery)
- `menu_stop_list` — vaqtincha to'xtatilgan taomlar

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/menu/                      — modul ma'lumoti
GET    /api/v1/menu/categories            — kategoriyalar
POST   /api/v1/menu/categories            — kategoriya yaratish
GET    /api/v1/menu/items                 — taomlar ro'yxati
POST   /api/v1/menu/items                 — taom yaratish
GET    /api/v1/menu/items/{item}          — bitta taom
PATCH  /api/v1/menu/items/{item}          — yangilash
DELETE /api/v1/menu/items/{item}          — o'chirish (soft)
POST   /api/v1/menu/items/{item}/stop     — stop-listga qo'shish
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`menu.view`, `menu.create`, `menu.update`, `menu.delete`, `menu.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Orders** — buyurtmaga taom qo'shishda narx va mavjudlik shu yerdan
- **Warehouse** — texnologik karta orqali ingredient qoldig'i tekshiriladi
- **Kitchen** — tayyorlash vaqti va oshxona bo'limi (sex) shu yerdan
- **Analytics** — ABC tahlil va food-cost hisobi

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Menu

# Model + factory
php artisan module:make-model <Name> Menu --factory

# Controller
php artisan module:make-controller <Name>Controller Menu --api

# Testlar
php artisan test --filter=Modules\\Menu
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — MenuCategory, MenuItem + QR-menyu.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
