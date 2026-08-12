# Modul 5 — Ombor (Inventory & Warehouse)

> Ingredientlar, texnologik kartalar, qoldiq nazorati, inventarizatsiya va chiqim.

**Alias:** `inventory` · **Namespace:** `Modules\Inventory` · **API prefiks:** `/api/v1/inventory`

---

## Asosiy funksiyalar

- Ingredientlar reestri (o'lchov birligi, saqlash sharti, yaroqlilik muddati)
- Texnologik karta (kalkulyatsiya) — har taom uchun ingredient sarfi
- Yarim tayyor mahsulotlar (zagotovka) va ularning tex-kartasi
- Real-time qoldiq — sotuvdan avtomatik hisobdan chiqarish
- Inventarizatsiya (sanoq) va farqlar akti
- Chiqim (write-off): buzilgan, yaroqsiz, xodim ovqati
- Minimal qoldiq ogohlantirishi va avtomatik xarid arizasi
- Filiallar o'rtasida ko'chirish (transfer)
- Food-cost va real sarf/nazariy sarf farqi

---

## Database jadvallar (rejalashtirilgan)

- `ingredients` — ingredientlar
- `stock_balances` — filial bo'yicha qoldiqlar
- `stock_movements` — barcha harakatlar (kirim/chiqim/transfer)
- `recipes` — texnologik kartalar
- `recipe_items` — tex-karta satrlari
- `stock_takes` — inventarizatsiya
- `write_offs` — chiqim aktlari

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/inventory/                 — modul ma'lumoti
GET    /api/v1/inventory/ingredients      — ingredientlar
GET    /api/v1/inventory/stock            — joriy qoldiqlar
POST   /api/v1/inventory/recipes          — tex-karta yaratish
POST   /api/v1/inventory/write-offs       — chiqim akti
POST   /api/v1/inventory/stock-takes      — inventarizatsiya boshlash
GET    /api/v1/inventory/low-stock        — kam qolgan ingredientlar
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`inventory.view`, `inventory.create`, `inventory.update`, `inventory.delete`, `inventory.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Menu** — tex-karta orqali taom tannarxi va stop-list
- **Kitchen** — tayyorlangan taom qoldiqni kamaytiradi
- **Suppliers** — xarid qilingan mahsulot kirim bo'ladi
- **Analytics** — food-cost va yo'qotishlar tahlili

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Inventory

# Model + factory
php artisan module:make-model <Name> Inventory --factory

# Controller
php artisan module:make-controller <Name>Controller Inventory --api

# Testlar
php artisan test --filter=Modules\\Inventory
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — Ingredient, StockMovement.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
