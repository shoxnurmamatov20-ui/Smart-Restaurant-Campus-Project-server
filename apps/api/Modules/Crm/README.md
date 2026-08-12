# Modul 9 — Mijozlar va sodiqlik (CRM & Loyalty)

> Mijozlar bazasi, bonus/cashback dasturi, promo-aksiyalar va fikr-mulohaza.

**Alias:** `crm` · **Namespace:** `Modules\Crm` · **API prefiks:** `/api/v1/crm`

---

## Asosiy funksiyalar

- Mijozlar bazasi (telefon, tug'ilgan kun, afzalliklar, allergiya)
- Sodiqlik dasturi: bonus ballari, cashback, darajalar (bronza/kumush/oltin)
- Promo-kodlar va aksiyalar (chegirma, 1+1, biznes-lanch)
- Tug'ilgan kun va bayram avtomatik takliflari
- Mijoz segmentatsiyasi (RFM tahlil)
- Fikr-mulohaza va reyting (taom, xizmat, tozalik)
- Shikoyatlar va ularni hal qilish jarayoni
- SMS / Telegram / push orqali marketing kampaniyalari
- Sovuqqon mijozlarni qaytarish (win-back) kampaniyasi
- Mijoz hayotiy qiymati (LTV) hisobi

---

## Database jadvallar (rejalashtirilgan)

- `customers` — mijozlar
- `loyalty_accounts` — bonus hisoblari
- `loyalty_transactions` — bonus harakati
- `loyalty_tiers` — darajalar
- `promotions` — aksiyalar
- `promo_codes` — promo-kodlar
- `feedbacks` — fikr-mulohaza va reyting
- `complaints` — shikoyatlar
- `campaigns` — marketing kampaniyalari

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/crm/                       — modul ma'lumoti
GET    /api/v1/crm/customers              — mijozlar
POST   /api/v1/crm/customers              — mijoz qo'shish
GET    /api/v1/crm/customers/{id}/loyalty — bonus holati
POST   /api/v1/crm/loyalty/redeem         — bonusni ishlatish
GET    /api/v1/crm/promotions             — faol aksiyalar
POST   /api/v1/crm/feedbacks              — fikr qoldirish
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`crm.view`, `crm.create`, `crm.update`, `crm.delete`, `crm.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Orders** — buyurtmada mijoz va bonus qo'llanishi
- **Tables** — bron tarixi va mijoz afzalliklari
- **Analytics** — RFM, LTV, kampaniya samaradorligi
- **TelegramBots** — mehmon va sodiqlik botlari

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Crm

# Model + factory
php artisan module:make-model <Name> Crm --factory

# Controller
php artisan module:make-controller <Name>Controller Crm --api

# Testlar
php artisan test --filter=Modules\\Crm
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — Customer, LoyaltyTransaction, Feedback.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
