# Modul 7 — Xodimlar (Staff & Shifts)

> Restoran xodimlari, smenalar jadvali, davomat (Face ID / QR) va ish haqi asosi.

**Alias:** `staff` · **Namespace:** `Modules\Staff` · **API prefiks:** `/api/v1/staff`

---

## Asosiy funksiyalar

- Xodimlar bazasi: ofitsiant, oshpaz, kassir, barmen, kuryer, menejer
- Lavozim va ruxsatlar (RBAC bilan bog'langan)
- Smenalar jadvali va almashinuv (shift swap)
- Davomat: Face ID + QR + PIN orqali smenaga kirish/chiqish
- Kechikish, erta ketish, ortiqcha ish soatlari
- Ta'til, kasallik varaqasi, ish safari
- Ish haqi asosi: stavka × soat + servis haqi ulushi + bonus
- Ofitsiant reytingi (tushum, o'rtacha chek, mehmon bahosi)
- Sanitariya kitobchasi va muddati nazorati (HACCP talabi)
- Mehnat shartnomalari arxivi

---

## Database jadvallar (rejalashtirilgan)

- `staff_members` — xodimlar
- `staff_positions` — lavozimlar
- `shifts` — smenalar jadvali
- `shift_assignments` — xodim ↔ smena
- `attendances` — kelish-ketish
- `leaves` — ta'til va yo'qliklar
- `staff_documents` — hujjatlar (shartnoma, sanitariya kitobchasi)

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## Qurilgan qismi — e'lon qilingan rota, almashinuv va telefon navbati (2026-08-22)

### Rota — qoralama va va'da

`staff.shifts.published_at` gacha menejerning ish nusxasi bilan xodimga
berilgan va'da bir xil narsa edi: har bir tahrir darhol ko'rinardi, va
seshanbada ko'rgan smena chorshanbada yo'q bo'lardi. Endi `published_at`
qo'yilmaguncha hafta menejerniki.

```
POST /api/v1/staff/shifts/publish   — {from, to}; staff.manage
GET  /api/v1/staff/shifts?filter[published]=1
```

Qayta e'lon qilish oldingi vaqtni **surmaydi**: nizoli rota faqat "hafta qachon
va'da qilingan" degan savolga tayanadi.

### Smena almashinuvi — `staff.shift_swaps`

Alohida jadval, chunki so'rov — u haqidagi narsaning xususiyati emas: ikki
ofitsiant bitta payshanba haqida so'rashi mumkin, menejer birini rad etadi, va
ikkala rad ham tarixda qolishi kerak. Bitta shiftga bitta ochiq so'rov —
qisman unique indeks (`status = 'pending'`).

So'rash `staff.update`, hal qilish `staff.manage`. Tasdiqlanganda smena qo'l
almashadi va `status` tegilmaydi: `swapped` qo'yish uni e'lon qilingan rotadan
tushirib yuborardi (`shifts-server.ts` faqat `cancelled` ni tashlaydi).

### Telefon navbati — `staff.actions`

`apps/mobile/src/crew/queue.ts` ning ikkinchi yarmi. Sakkiz turdan to'rttasi
bugun haqiqiy joyga tushadi (ikkitasi davomatga, ikkitasi `StockLedger` orqali
omborga), qolgan to'rttasi — Tables, Orders va Suppliers ishi — jurnalga
yoziladi. **Rad etish emas:** ofitsiant stolni bir soat oldin, haqiqatda
olgan; rad etsak telefon yozuvni o'chiradi va fakt yo'qoladi.

Idempotentlik `local_id` bo'yicha, **odamga bog'langan**. Sarlavhadagi kalit
so'rovni himoya qiladi; navbat esa boshqa holatni tug'diradi — o'n ikkitasi
yuborildi, to'qqiztasi yozildi, ulanish uzildi, va qayta urinish boshqa
so'rovda ustma-ust tushadigan o'n ikkitani olib keladi.

```
POST /api/v1/staff/actions   — batch; ruxsat har bir fe'l uchun ichkarida
GET  /api/v1/staff/me/today  — o'z smenasi, soatlari, keyingi smena
```

Ikkalasi ham marshrutda ruxsat ko'tarmaydi va `ModuleRouteGuardTest::UNGUARDED`
da sababi bilan yozilgan: hech bir ruxsatni barcha crew rollari ushlamaydi —
ofitsiant, kuryer va omborchi umumiy hech narsaga ega emas. `actions` esa
mohiyatan qo'riqlanmagan emas: sakkizala fe'l
`StaffActionController::PERMISSION_FOR` ga qarshi tekshiriladi, xuddi
`SyncController` kassa uchun qilgani kabi.

### Ro'yxat ekranining hisoblangan ustunlari

`attendance_rate`, `last_shift_at`, `has_pin` —
`StaffMember::scopeWithRosterFigures()`, bitta so'rovda subquery. "Keldi" degani
smenaning o'z oynasi ichidagi davomat, boshlanishidan uch soat oldin ham:
08:00–20:00 ga yozilgan oshpaz 05:40 da tayyorgarlikka kelsa, o'sha smenaga
kelgan.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/staff/                     — modul ma'lumoti
GET    /api/v1/staff/members              — xodimlar
POST   /api/v1/staff/members              — xodim qo'shish
GET    /api/v1/staff/shifts               — smenalar jadvali
POST   /api/v1/staff/attendance/check-in  — smenaga kirish
POST   /api/v1/staff/attendance/check-out — smenadan chiqish
GET    /api/v1/staff/payroll/preview      — ish haqi hisobi
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`staff.view`, `staff.create`, `staff.update`, `staff.delete`, `staff.manage`.

---

## Boshqa modullar bilan bog'liqlik

- **Pos / Finance** — kassir smenasi va kassa javobgarligi
- **Orders** — ofitsiant bo'yicha tushum va o'rtacha chek
- **Analytics** — xodim samaradorligi va KPI
- **TelegramBots** — xodim boti (smena, davomat, payslip)

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Staff

# Model + factory
php artisan module:make-model <Name> Staff --factory

# Controller
php artisan module:make-controller <Name>Controller Staff --api

# Testlar
php artisan test --filter=Modules\\Staff
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — StaffMember, Shift, Attendance.
Model, migratsiya, factory, form request, API resource, controller, RBAC route,
seeder va feature testlar mavjud.

Kanonik namuna: `Modules/Menu`.
