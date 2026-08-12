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
