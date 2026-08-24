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

- `kitchen_stations` — sexlar (issiq, sovuq, mangal, bar) + `printer_id`
- `kitchen_tickets` — oshxona chiptalari (satrlar `lines` jsonb snapshot'ida)
- `kitchen_printers` — printer parki
- `kitchen_print_jobs` — chop etish navbati

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

## Qog'oz — printerlar va chop etish navbati (P8)

Bu modul oshxona ekranidan tashqari **printer parkini** ham ushlaydi: sex
docket'i, mijoz cheki va naqd yashigi impulsi. Nega shu yerda — printer sex
bilan bir xil narsani biladi (nima qayerda pishadi), va ularni ajratish
`kitchen_stations` bilan `printers` orasiga modul chegarasini qo'yardi.
Ko'chirish sharti bitta: printer parki sexdan mustaqil bo'lganda alohida
`Printing` moduliga chiqadi va `App\Contracts\Printing\PrintSpooler` o'zgarmaydi.

| Jadval                        | Nima                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| `kitchen.printers`            | Qurilma reyestri: filial, roli, ulanish, kengligi, kod sahifasi, tiriklik |
| `kitchen.print_jobs`          | Chidamli navbat: bosilishi kerak bo'lgan va bosilgan hujjatlar            |
| `kitchen_stations.printer_id` | Sex → printer marshruti; `null` bo'lsa filial standarti                   |

**Asosiy qoida: ilova hech qachon printerga ulanmaydi.** U tranzaksiya ichida
navbatga bitta qator yozadi va qaytadi. Printerga baytlarni lokal agent yozadi —
`Modules/Kitchen/docs/print-agent-design.md`. Sababi: `TenderService::settle()`
butunlay `DB::transaction` ichida, va u yerdagi sinxron chop etish yiqilsa,
karta terminalda o'tkazilgan to'lov orqaga qaytardi.

Render serverda: `Modules/Kitchen/app/Printing/`. `Charset` o'zbek lotinidagi
`oʻ`/`gʻ` (U+02BB) ni hal qiladi — u hech qanday termal printer kod sahifasida
yo'q, va e'tiborsiz qoldirilsa har bir chekda savol belgisi chiqadi.

```
GET    /api/v1/kitchen/printers/health     — holat qatori (pos.view|kitchen.view)
GET    /api/v1/kitchen/printers            — reyestr (kitchen.view)
POST   /api/v1/kitchen/printers            — qo'shish (kitchen.manage)
POST   /api/v1/kitchen/printers/{p}/test   — sinov chop etish (kitchen.manage)
POST   /api/v1/kitchen/print-jobs/claim    — agent ish so'raydi (kitchen.update)
POST   /api/v1/kitchen/tickets/{t}/print   — docket'ni qayta bosish (kitchen.update)
POST   /api/v1/kitchen/receipts            — chekni qayta bosish (pos.sell)
```

---

## Boshqa modullar bilan bog'liqlik

- **Orders** — buyurtma chiptaga aylanadi
- **Menu** — taomning sexi va standart tayyorlash vaqti
- **Warehouse** — tayyorlangan taom ingredientni hisobdan chiqaradi
- **Analytics** — oshxona samaradorligi ko'rsatkichlari
- **Pos** — chek va naqd yashigi, `App\Contracts\Printing\PrintSpooler` orqali
  (Pos bu modulni import qilmaydi)

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
