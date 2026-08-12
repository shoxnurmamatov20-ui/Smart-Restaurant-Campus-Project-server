# POS moduli — dizayn spetsifikatsiyasi

**Sana:** 2026-08-11
**Holat:** tasdiqlashga taqdim etildi
**Modul:** `Pos` — 12-modul (`apps/api/Modules/Pos`) + `apps/pos` terminal ilovasi
**Shaxobcha turlari:** restoran · kafe · bar · fast food · nonvoyxona/counter

---

## 1. Maqsad

Restoran, kafe, bar va fast food shaxobchalarini **kassadan** to'liq
avtomatlashtirish: ofitsiant buyurtma oladi, oshxona ko'radi, kassir pul oladi,
menejer tasdiqlaydi, buxgalter hisobot chiqaradi — hammasi bitta terminalda,
internet uzilganda ham ishlaydigan holda.

**Muvaffaqiyat mezoni:**

1. Kassir smenani ochib, buyurtmani qabul qilib, aralash to'lov olib, Z-hisobot
   bilan yopa oladi — sichqonchasiz, faqat teginish bilan.
2. Internet uzilganda terminal sotishda davom etadi; ulanish tiklanganda hech
   nima ikki marta yozilmaydi.
3. Har bir chegirma, bekor qilish va qayta ochish — kim so'ragani va kim
   tasdiqlagani bilan jurnalda qoladi.
4. Kunlik sotuv POS'da va Analytics'da **bir xil** chiqadi (bitta haqiqat manbai).

---

## 2. Arxitektura qarori

### 2.1 Ikkita artefakt

| Artefakt               | Nima                            | Nega alohida                                                                                                                                                                   |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/pos`             | Next.js 16 PWA — touch terminal | Offline (service worker + IndexedDB), kiosk qulfi, 2 soniyada ochilish, qurilma tokeni + PIN bilan kirish. Bularning hech biri admin konsolga kerak emas va unga zarar qiladi. |
| `apps/api/Modules/Pos` | **Ingichka** backend modul      | Faqat hozir mavjud bo'lmagan narsalar: terminal, sessiya, tasdiq, chek, fiskal, sync, maket, narx qoidasi, kassa qutisi                                                        |

### 2.2 Egalik chegarasi (eng muhim qaror)

POS **hisob va to'lovni qayta yaratmaydi**. Aks holda pul uchun ikkita haqiqat
manbai paydo bo'ladi va `Analytics` qaysi jadvaldan o'qishini bilmay qoladi.

| Tushuncha                  | Egasi     | POS nima qiladi                                                           |
| -------------------------- | --------- | ------------------------------------------------------------------------- |
| Hisob (bill), qatorlar     | `Orders`  | `BillRegistry` shartnomasi orqali chaqiradi                               |
| To'lov, kassa smenasi      | `Finance` | `TillLedger` shartnomasi orqali chaqiradi                                 |
| Menyu, narx, stop-list     | `Menu`    | `MenuCatalog` (mavjud) orqali o'qiydi                                     |
| Stol, zal, bron            | `Tables`  | `apps/pos` to'g'ridan-to'g'ri Tables API'sini chaqiradi                   |
| Oshxona chiptasi           | `Kitchen` | Buyurtma statusi o'zgaradi → Kitchen o'zi reaksiya qiladi                 |
| Mijoz, sodiqlik            | `Crm`     | `apps/pos` to'g'ridan-to'g'ri CRM API'sini chaqiradi                      |
| **Terminal, sessiya, PIN** | **`Pos`** | Egasi                                                                     |
| **Tasdiq (void/chegirma)** | **`Pos`** | Egasi                                                                     |
| **Chek, printer, fiskal**  | **`Pos`** | Egasi                                                                     |
| **Offline sync jurnali**   | **`Pos`** | Egasi                                                                     |
| **Kassa qutisi harakati**  | **`Pos`** | Egasi; naqd chiqim `TillLedger` orqali `Finance`ga xarajat bo'lib tushadi |

### 2.3 `ModuleBoundaryTest` bilan kelishuv

Test modul modulni import qilishini taqiqlaydi va faqat yozib qo'yilgan
istisnolarga ruxsat beradi. `Pos` **hech qanday yangi istisno qo'shmaydi** —
hamma narsa `App\Contracts\*` orqali o'tadi, xuddi mavjud `MenuCatalog` kabi.

### 2.4 Mavjud kodga tegmaslik qoidasi (majburiy)

**Ishlab turgan mantiq o'zgartirilmaydi.** 349 test yashil — ular shundayligicha
qoladi. Ruxsat etilgan yagona aralashuv turi:

| Ruxsat                                      | Misol                                                      |
| ------------------------------------------- | ---------------------------------------------------------- |
| ✅ Yangi fayl qo'shish                      | `Modules/Orders/app/Services/EloquentBillRegistry.php`     |
| ✅ Ro'yxatga bitta qator qo'shish           | `modules_statuses.json` ga `"Pos": true`                   |
| ✅ ServiceProvider'ga bitta `bind()` qatori | `$this->app->bind(BillRegistry::class, ...)`               |
| ❌ Mavjud metod mantig'ini o'zgartirish     | `CashShift::close()` — **tegilmaydi**                      |
| ❌ Mavjud konstantani o'zgartirish          | `Payment::METHODS`, `Expense::CATEGORIES` — **tegilmaydi** |
| ❌ Mavjud migratsiyani tahrirlash           | Har doim yangi migratsiya                                  |

Bu qoida ikkita dizayn qarorini majbur qildi — va ikkalasi ham aslida to'g'riroq:

1. **Inkassatsiya `CashShift::close()` ni o'zgartirmaydi.** `pos.drawer_movements`
   dagi `cash_out`/`collection` yozuvi `TillLedger` orqali `Finance`da
   `paid_in_cash = true` bo'lgan `Expense` ham yaratadi. `close()` allaqachon
   naqd xarajatlarni ayiradi — matematika o'zi to'g'ri chiqadi, bitta qator ham
   o'zgarmaydi. Shu sabab `DrawerLedger` shartnomasi **kerak emas**.
2. **Sodiqlik ballari to'lov usuli emas.** `Payment::METHODS` ga `bonus`
   qo'shish o'rniga ball yechish hisobga **chegirma** bo'lib tushadi
   (`Order::discount_total`). Bu buxgalteriya nuqtai nazaridan ham to'g'riroq:
   bonus — bu olingan pul emas, berilgan chegirma.

---

## 3. Shartnomalar (yangi, `apps/api/app/Contracts/`)

Faqat 3 ta. Qolgan modullar bilan aloqa frontend'dan ularning o'z API'lari
orqali boradi — bu backend bog'liqligini keskin kamaytiradi.

| Shartnoma                           | Kim bajaradi    | Kim ishlatadi | Metodlar                                                                                                                              |
| ----------------------------------- | --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `App\Contracts\Orders\BillRegistry` | `Orders`        | `Pos`         | `open()`, `find()`, `addLine()`, `voidLine()`, `applyDiscount()`, `split()`, `merge()`, `transfer()`, `send()`, `close()`, `reopen()` |
| `App\Contracts\Finance\TillLedger`  | `Finance`       | `Pos`         | `openShift()`, `closeShift()`, `capture()`, `refund()`, `recordCashOut()`, `shiftTotals()`                                            |
| `App\Contracts\Pos\Fiscalizer`      | `Pos` (drayver) | `Pos`         | `register(FiscalRequest): FiscalResult`                                                                                               |

Har biriga **`Unavailable*`** zaxira implementatsiyasi yoziladi (core'da
bog'lanadi), shunda modul o'chirilganda ham tizim ishlaydi — bu naql loyihada
allaqachon bor: `App\Contracts\Menu\UnavailableMenuCatalog`.

`Orders` va `Finance` modullariga **faqat yangi fayl** qo'shiladi
(`Services/EloquentBillRegistry.php`, `Services/EloquentTillLedger.php`) va
ularning mavjud ServiceProvider'iga **bittadan `bind()` qatori**. Bironta
mavjud metod, konstanta yoki migratsiya o'zgarmaydi.

DTO'lar (`readonly final class`), xuddi `Contracts\Menu\Dish` kabi:
`Bill`, `BillLine`, `Tender`, `ShiftTotals`, `FiscalRequest`, `FiscalResult`.

---

## 4. Ma'lumotlar modeli — `pos` schema (11 jadval)

Hammasida `tenant_id` bor, hammasi `BelongsToTenant`, pul — **tiyinda butun son**.

### 4.1 `pos.terminals` — kassa qurilmasi

`id · tenant_id · branch_id · code (uniq/tenant) · name · mode · status ·
pairing_code · pairing_expires_at · paired_at · last_seen_at ·
device_fingerprint · app_version · layout_id · settings jsonb · timestamps · softDeletes`

- `mode`: `table_service | quick_service | bar | counter`
- `status`: `active | disabled | maintenance`
- `settings`: printer marshruti, kassa qutisi, fiskal qurilma seriyasi,
  yaxlitlash, rol bo'yicha maksimal chegirma %, sessiya taymauti
- **Sanctum tokenable** — terminal o'z qurilma tokeni bilan ishlaydi

### 4.2 `pos.pins` — tez kirish

`id · tenant_id · user_id · pin_hash · failed_attempts · locked_until ·
last_used_at · rotated_at · timestamps`, `unique(tenant_id, user_id)`

PIN **hech qachon ochiq saqlanmaydi**, javobda qaytmaydi, logga tushmaydi.
5 xato → 15 daqiqa qulf.

### 4.3 `pos.sessions` — kim, qaysi terminalda

`id · tenant_id · terminal_id · user_id · cash_shift_id · opened_at ·
closed_at · closed_reason · ip · timestamps`

`closed_reason`: `logout | timeout | takeover | shift_close`.
Har bir POS amali `session_id` ko'taradi — audit umurtqasi shu.

### 4.4 `pos.approvals` — menejer tasdig'i (firibgarlikka qarshi asosiy jadval)

`id · tenant_id · terminal_id · session_id · action · subject_type ·
subject_id · amount · reason · requested_by_user_id · approved_by_user_id ·
status · method · requested_at · decided_at · expires_at · timestamps`

- `action`: `void_line | void_order | discount | price_override | reopen_bill |
refund | drawer_open | comp`
- `status`: `pending | approved | rejected | expired`
- `method`: `pin` (menejer terminalda PIN kiritdi) | `remote` (telefonidan tasdiqladi)
- `expires_at` — tasdiq 5 daqiqada kuchini yo'qotadi

### 4.5 `pos.drawer_movements` — kassa qutisi

`id · tenant_id · terminal_id · session_id · cash_shift_id · kind ·
amount · direction · reason · user_id · approval_id · finance_expense_id ·
occurred_at · timestamps`

- `kind`: `opening_float | cash_in | cash_out | collection | tip_out | correction`
- `direction`: `in | out`; `amount` doim musbat (audit uchun aniqroq)
- `direction = out` bo'lganda `TillLedger::recordCashOut()` chaqiriladi va
  `Finance`da naqd `Expense` yaratiladi; uning id'si `finance_expense_id` ga
  yoziladi. Shu tufayli `CashShift::close()` matematikasi tegilmasdan to'g'ri
  qoladi (§2.4)

### 4.6 `pos.printers`

`id · tenant_id · branch_id · name · kind · driver · connection jsonb ·
station · copies · is_default · is_active · timestamps`

- `kind`: `receipt | kitchen | label`
- `driver`: `browser | escpos_network | escpos_usb | null_driver`
- `station`: `Kitchen` sexlariga mos (`hot|cold|grill|bar|pastry`)

### 4.7 `pos.print_jobs` — chop navbati

`id · tenant_id · terminal_id · printer_id · kind · order_id · payment_id ·
payload jsonb · rendered · status · attempts · last_error · claimed_at ·
printed_at · timestamps`

- `kind`: `precheck | fiscal_receipt | kitchen_ticket | x_report | z_report |
drawer_slip | refund_slip`
- `status`: `queued | claimed | printed | failed | cancelled`

### 4.8 `pos.fiscal_receipts` — O'zbekiston onlayn-kassasi

`id · tenant_id · terminal_id · payment_id · order_id · provider ·
device_serial · kind · status · fiscal_number · fiscal_sign · ofd_url ·
qr_payload · request jsonb · response jsonb · error · attempts ·
registered_at · timestamps`, `unique(tenant_id, payment_id, kind)`

- `status`: `pending | registered | failed | offline_queued | cancelled`
- **Fiskallashtirish xatosi sotuvni to'xtatmaydi** — navbatga tushadi va qayta uriniladi

### 4.9 `pos.sync_entries` — offline idempotentligi

`id · tenant_id · terminal_id · local_id (uuid) · local_seq · action ·
payload jsonb · status · result jsonb · error · received_at · timestamps`

**`unique(terminal_id, local_id)`** — butun offline kafolati shu bitta indeksda.
Bir xil `local_id` ikkinchi marta kelsa, saqlangan natija qaytariladi; yangi
buyurtma ham, yangi to'lov ham yaratilmaydi.

### 4.10 `pos.layouts` — tez tugmalar maketi

`id · tenant_id · name · mode · is_default · pages jsonb · timestamps`

`pages`: `[{title, color, buttons: [{type: item|category|action, ref, label, color, span}]}]`

### 4.11 `pos.price_rules` — happy hour, kanal narxi, kombo

`id · tenant_id · branch_id · name jsonb{uz,ru,en} · kind · scope jsonb ·
channel · days_of_week jsonb · starts_at_time · ends_at_time · adjustment ·
value · priority · is_active · active_from · active_to · timestamps`

- `kind`: `happy_hour | channel_price | combo`
- `adjustment`: `percent | fixed_off | override`
- Ustuvorlik: `priority` DESC → birinchi mos kelgani qo'llanadi

---

## 5. Rejimlar — 4 xil shaxobcha, bitta kod

| Rejim           | Kim uchun         | Oqim                                             | Farqlovchi xususiyat                                 |
| --------------- | ----------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `table_service` | Restoran          | stol → buyurtma → oshxonaga → pre-check → to'lov | Ochiq hisob, servis haqi, split, stol ko'chirish     |
| `quick_service` | Fast food         | buyurtma → **to'lov** → raqam → berish           | Avval to'lov, buyurtma raqami, kombo, katta tugmalar |
| `bar`           | Bar / pab         | tab ochish → qo'shib borish → yopish             | Ochiq tab'lar ro'yxati, tez tugmalar, happy hour     |
| `counter`       | Kafe / nonvoyxona | tanlash → to'lov                                 | Eng tez oqim, olib ketish standart                   |

Rejim terminalda saqlanadi (`pos.terminals.mode`), UI shunga qarab o'zgaradi.

---

## 6. Ruxsatlar

Standart 5 fe'l: `pos.view · pos.create · pos.update · pos.delete · pos.manage`
(seeder'dagi `MODULES` ro'yxatiga `'pos'` qo'shiladi).

Qo'shimcha nomli ruxsatlar (`SYSTEM_PERMISSIONS` naqli bo'yicha):

| Ruxsat         | Ma'nosi                                  |
| -------------- | ---------------------------------------- |
| `pos.sell`     | Terminalda sotish                        |
| `pos.void`     | Qatorni/hisobni bekor qilish             |
| `pos.discount` | Qo'lda chegirma berish                   |
| `pos.reopen`   | Yopilgan hisobni qayta ochish            |
| `pos.refund`   | Qaytarish                                |
| `pos.drawer`   | Kassa qutisini ochish, naqd kirim-chiqim |
| `pos.approve`  | Boshqaning so'rovini tasdiqlash          |
| `pos.terminal` | Terminal ulash va sozlash                |

### Rollar bo'yicha (yangi rol yaratilmaydi — 8 tasi ham mavjud)

| Rol                 | Ruxsatlar                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `owner`             | hammasi                                                                                   |
| `branch-manager`    | view, create, update, sell, void, discount, reopen, refund, drawer, **approve**, terminal |
| `cashier`           | view, create, update, sell, drawer _(void/chegirma — faqat so'rov)_                       |
| `waiter`            | view, create, update, sell _(void/chegirma — faqat so'rov)_                               |
| `chef`              | view _(+ mavjud `menu.update` — stop-list)_                                               |
| `storekeeper`       | view                                                                                      |
| `accountant`        | view, manage _(+ mavjud `reports.export`)_                                                |
| `courier`           | view _(+ mavjud `orders.view/update`)_                                                    |
| `bartender`, `host` | view, create, update, sell — ular ham fizik terminalda ishlaydi                           |

---

## 7. Rol → sahifa xaritasi (`apps/pos`)

### 7.1 Cashier — kassir (7 sahifa)

| Sahifa            | Yo'l                  | Vazifa                                                        |
| ----------------- | --------------------- | ------------------------------------------------------------- |
| Sotuv ekrani      | `/sell`               | Katalog + savat, tez tugmalar, miqdor, modifikator            |
| Ochiq hisoblar    | `/bills`              | Barcha ochiq chek, qidiruv, filtr                             |
| To'lov            | `/pay/[bill]`         | Aralash to'lov (naqd/karta/bonus/sertifikat), qaytim, chaevoy |
| Smena             | `/shift`              | Ochish (boshlang'ich pul), X-hisobot, yopish (ko'r sanoq)     |
| Kassa qutisi      | `/drawer`             | Naqd kirim/chiqim, inkassatsiya, sabab                        |
| Chekni qayta chop | `/bills/[id]/reprint` | Pre-check / fiskal chek nusxasi                               |
| Qaytarish         | `/refund/[payment]`   | Sabab + tasdiq bilan                                          |

### 7.2 Waiter — ofitsiant (7 sahifa)

| Sahifa             | Yo'l                       | Vazifa                                    |
| ------------------ | -------------------------- | ----------------------------------------- |
| Zal xaritasi       | `/floor`                   | Stollar holati, band/bo'sh, hisob summasi |
| Buyurtma pad       | `/sell?table=`             | Tez qo'shish, izoh, modifikator           |
| Oshxonaga yuborish | `/bills/[id]` → _Yuborish_ | Status → `in_kitchen`                     |
| Pre-check          | `/bills/[id]/precheck`     | Mehmonga hisob chiqarish                  |
| Split              | `/bills/[id]/split`        | Mehmon/taom/summa bo'yicha bo'lish        |
| Stol ko'chirish    | `/bills/[id]/transfer`     | Boshqa stol yoki ofitsiantga              |
| Mening smenam      | `/me/shift`                | O'z sotuvim, chaevoyim                    |

### 7.3 Manager — filial menejeri (7 sahifa)

| Sahifa                | Yo'l           | Vazifa                                           |
| --------------------- | -------------- | ------------------------------------------------ |
| Jonli sotuv           | `/live`        | Bugungi tushum, o'rtacha chek, terminal holati   |
| **Tasdiqlar navbati** | `/approvals`   | Kutayotgan void/chegirma/qayta ochish — realtime |
| Terminallar           | `/terminals`   | Ulash, rejim, printer, maket                     |
| Smenalar              | `/shifts`      | Ochiq smenalar, majburiy yopish                  |
| Kassa farqlari        | `/variance`    | Kassir bo'yicha kam/ortiq                        |
| Kunni yopish          | `/day-close`   | Barcha smena yopilganini tekshirish, kunlik Z    |
| Narx qoidalari        | `/price-rules` | Happy hour, kanal narxi, kombo                   |

### 7.4 Chef — osh-boshi (3 sahifa)

| Sahifa            | Yo'l            | Vazifa                                         |
| ----------------- | --------------- | ---------------------------------------------- |
| Stop-list         | `/stoplist`     | Taomni bir teginishda sotuvdan olish/qaytarish |
| Oshxona yuklamasi | `/kitchen-load` | Sex bo'yicha jonli chiptalar (KDS ko'prigi)    |
| Bugungi sotuv     | `/dish-sales`   | Qaysi taom qancha ketdi                        |

### 7.5 Warehouse — omborchi (3 sahifa)

| Sahifa                       | Yo'l                    | Vazifa                                |
| ---------------------------- | ----------------------- | ------------------------------------- |
| Sotuv → qoldiq ta'siri       | `/stock-impact`         | POS sotuvi qoldiqni qanday kamaytirdi |
| Stop-list takliflari         | `/stoplist-suggestions` | Qoldig'i tugagan ingredientli taomlar |
| Kassa hisobdan chiqarishlari | `/till-writeoffs`       | Comp/void → ombor ta'siri             |

### 7.6 Accountant — buxgalter (4 sahifa)

| Sahifa           | Yo'l           | Vazifa                                                 |
| ---------------- | -------------- | ------------------------------------------------------ |
| Z-hisobot arxivi | `/z-reports`   | Kun/kassir/terminal bo'yicha                           |
| Fiskal cheklar   | `/fiscal`      | OFD holati, muvaffaqiyatsizlar navbati, qayta yuborish |
| Kassa farqlari   | `/variance`    | Kassir bo'yicha tarix                                  |
| To'lov usullari  | `/payment-mix` | Naqd/karta/bonus taqsimoti, eksport                    |

### 7.7 Courier — kuryer (2 sahifa)

| Sahifa               | Yo'l               | Vazifa                       |
| -------------------- | ------------------ | ---------------------------- |
| Mening yetkazmalarim | `/deliveries`      | Manzil, summa, holat         |
| Topshirish           | `/deliveries/[id]` | Yetkazildi + naqd topshirdim |

### 7.8 Owner — egasi (4 sahifa)

| Sahifa           | Yo'l                | Vazifa                                    |
| ---------------- | ------------------- | ----------------------------------------- |
| Filiallar jonli  | `/live/all`         | Barcha filial tushumi bir ekranda         |
| Terminal holati  | `/terminals/health` | Kim onlayn, kim offline, oxirgi ko'rinish |
| Chegirma tahlili | `/discount-audit`   | Kim qancha chegirma berdi, kim tasdiqladi |
| Z arxivi         | `/z-reports`        | Barcha filial                             |

### 7.9 Loginsiz yuzalar

| Sahifa         | Yo'l    | Izoh                                           |
| -------------- | ------- | ---------------------------------------------- |
| Terminal ulash | `/pair` | Bir martalik kod bilan qurilma tokeni olish    |
| PIN qulfi      | `/lock` | Foydalanuvchi almashtirish, raqamli klaviatura |

**Jami: ~37 sahifa.**

---

## 8. API sirti — `/api/v1/pos/*`

Barchasi `auth:sanctum` + `tenant` ostida; sotuv yo'llari qo'shimcha
`pos.terminal-session` middleware talab qiladi.

```
GET    /                              modul ma'lumoti
# Terminal va identifikatsiya
POST   /terminals/pair                ulash kodi → qurilma tokeni
GET    /terminals                     ro'yxat            pos.view
POST   /terminals                     yaratish           pos.terminal
PATCH  /terminals/{terminal}          sozlash            pos.terminal
POST   /terminals/{terminal}/heartbeat holat             (terminal token)
POST   /auth/pin                      PIN bilan kirish → sessiya
POST   /auth/pin/rotate               PIN o'zgartirish
DELETE /sessions/current              chiqish
# Sotuv (idempotent: X-Pos-Local-Id majburiy)
POST   /bills                         hisob ochish       pos.sell
POST   /bills/{bill}/lines            qator qo'shish     pos.sell
DELETE /bills/{bill}/lines/{line}     qatorni olib tashlash (tasdiq kerak bo'lishi mumkin)
POST   /bills/{bill}/discount         chegirma           pos.discount | tasdiq
POST   /bills/{bill}/send             oshxonaga yuborish pos.sell
POST   /bills/{bill}/split            bo'lish            pos.sell
POST   /bills/{bill}/merge            birlashtirish      pos.sell
POST   /bills/{bill}/transfer         stol/ofitsiant     pos.sell
POST   /bills/{bill}/tenders          aralash to'lov     pos.sell
POST   /bills/{bill}/reopen           qayta ochish       pos.reopen + tasdiq
# Tasdiqlar
POST   /approvals                     so'rov yuborish
GET    /approvals?status=pending      navbat             pos.approve
POST   /approvals/{approval}/decide   tasdiq/rad         pos.approve
# Smena va kassa qutisi
POST   /shifts/open                   smena ochish       pos.sell
GET    /shifts/{shift}/x-report       X-hisobot          pos.view
POST   /shifts/{shift}/close          Z + yopish         pos.sell
POST   /drawer/movements              naqd kirim/chiqim  pos.drawer
GET    /drawer/movements              tarix              pos.view
# Chop etish
GET    /print-jobs?claim=1            navbatdan olish    (terminal token)
POST   /print-jobs/{job}/ack          chop etildi/xato   (terminal token)
POST   /print-jobs                    qo'lda navbatga qo'yish
GET    /printers · POST · PATCH                          pos.terminal
# Fiskal
GET    /fiscal-receipts               ro'yxat            pos.view
POST   /fiscal-receipts/{r}/retry     qayta yuborish     pos.manage
# Maket va narx
GET/POST/PATCH /layouts                                  pos.terminal
GET/POST/PATCH /price-rules                              pos.manage
# Offline
POST   /sync                          to'plamli replay   (terminal token)
GET    /sync/snapshot                 menyu+stol+narx keshi
```

---

## 9. Offline rejim

**Backend:** har bir yozuv `X-Pos-Local-Id` (uuid) va `X-Pos-Seq` ko'taradi.
`pos.sync_entries` dagi `unique(terminal_id, local_id)` takrorlanishni
to'xtatadi va **saqlangan natijani** qaytaradi.

**Frontend:** IndexedDB outbox. Offline'da terminal:

| Ruxsat etiladi               | Taqiqlanadi                |
| ---------------------------- | -------------------------- |
| Hisob ochish, qator qo'shish | Karta to'lovi              |
| Naqd to'lov olish            | Sodiqlik ballarini yechish |
| Pre-check chop etish         | Qaytarish (refund)         |
| Chekni navbatga qo'yish      | Qayta ochish               |

Ulanish tiklanganda outbox `local_seq` tartibida yuboriladi; fiskal cheklar
`offline_queued` dan `registered` ga o'tadi.

**Menyu keshi:** `GET /sync/snapshot` — menyu, narx qoidalari, stollar, stop-list.
Terminal uni har 60 soniyada yangilaydi va IndexedDB'da saqlaydi.

---

## 10. Fiskal va printer — drayver seami

Ikkalasi ham **interfeys + drayver**, shunda bugun temirsiz ham ishlaydi:

| Seam         | Drayverlar                                                                                                | Standart                        |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `Fiscalizer` | `null_driver` (dev), `uz_ofd` (real, provayder shartnomasi kelganda)                                      | `POS_FISCAL_DRIVER=null_driver` |
| Printer      | `browser` (brauzer chop etadi — bugun ishlaydi), `escpos_network` (TCP 9100), `escpos_usb`, `null_driver` | `browser`                       |

Real fiskal provayder va ESC/POS printer keyingi bosqichda ulanadi — arxitektura
o'zgarmaydi, faqat drayver klassi qo'shiladi.

---

## 11. Invariantlar (testlar majburlaydi)

1. **Pul — tiyinda butun son.** `Pos`da birorta ham float yo'q.
2. **Idempotentlik.** Bir xil `local_id` ikki marta → bitta buyurtma, bitta to'lov.
3. **Tasdiqsiz o'zgarish yo'q.** Rol limitidan oshiq chegirma yoki void
   `approved` tasdiqsiz → `403`, hisob **o'zgarmaydi**.
4. **Yopilgan hisob o'zgarmas.** Qayta ochish faqat `pos.reopen` + tasdiq bilan,
   va jurnalda qoladi.
5. **Z-hisobot serverda hisoblanadi.** Mavjud `CashShift::close()` matematikasi
   ishlatiladi (kutilgan = boshlang'ich + naqd to'lovlar − naqd xarajatlar);
   inkassatsiya naqd xarajat sifatida tushgani uchun u avtomatik hisobga olinadi.
   Klient faqat **sanalgan** summani yuboradi.
6. **Terminal tokeni faqat o'z terminaliga va o'z tenantiga** ta'sir qiladi.
7. **PIN** heshlangan; javobda, logda, audit yozuvida hech qachon ko'rinmaydi.
8. **Fiskal xato sotuvni to'xtatmaydi** — navbatga tushadi.
9. **Tenant izolyatsiyasi** — 11 jadvalning hammasida.
10. **`whereDate` ishlatilmaydi** — `App\Support\Tenancy\BusinessDay` ishlatiladi
    (arxitektura testi talabi).

---

## 12. Apple-style dizayn tili (`apps/pos`)

| Jihat       | Qaror                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipografika | Tizim steki (`-apple-system, "SF Pro Display", Inter`); shkala 34/28/22/17/15/13; sarlavhalarda `letter-spacing: -0.02em`                                            |
| Rang        | Deyarli monoxrom yuza + **rejimga bitta urg'u**: `table_service` ko'k, `quick_service` to'q sariq, `bar` binafsha, `counter` yashil. Qizil faqat buzuvchi amal uchun |
| Fon         | **Qorong'i standart** (zal qorong'i bo'ladi): `#000` asos, `#1c1c1e` ko'tarilgan karta, ajratgich `rgba(255,255,255,.08)` — ramka emas, ingichka chiziq              |
| Chuqurlik   | Tender oynasi va modallar — `backdrop-blur` bilan yarim shaffof varaq (sheet)                                                                                        |
| Harakat     | Spring `cubic-bezier(.32,.72,0,1)`, 200–300 ms; modallar pastdan ko'tariladi                                                                                         |
| Teginish    | Minimal nishon 44×44 pt, raqamli klaviatura 56 pt; hover'ga bog'liq hech narsa yo'q                                                                                  |
| Zichlik     | Sotuv panjarasi 4–6 ustun, katta plitalar; keng ichki bo'shliq                                                                                                       |
| Radius      | Standart 12 px, varaqlar 20 px; hamma joyda soya va gradient **yo'q**                                                                                                |
| Til         | `next-intl` orqali uz/ru/en — `@restaurant/i18n` paketiga `pos` bo'limi qo'shiladi                                                                                   |

---

## 13. Test rejasi

### Backend (PHP, ~85 yangi test)

| Test                        | Nimani tekshiradi                                        |
| --------------------------- | -------------------------------------------------------- |
| `TerminalPairingTest`       | Kod → token; kod bir marta ishlaydi; muddati o'tadi      |
| `PinLoginTest`              | To'g'ri/xato PIN; 5 xatodan keyin qulf; PIN javobda yo'q |
| `PosSessionTest`            | Sessiya ochilishi, taymaut, foydalanuvchi almashtirish   |
| `IdempotencyTest`           | Bir xil `local_id` 2 marta → 1 buyurtma, 1 to'lov        |
| `SellFlowTest`              | Hisob → qator → yuborish → pre-check → to'lov → `paid`   |
| `SplitTenderTest`           | Naqd+karta+bonus = jami; qaytim; yaxlitlash              |
| `ApprovalGateTest`          | Tasdiqsiz void/chegirma → 403, hisob o'zgarmadi          |
| `DrawerMovementTest`        | Kirim/chiqim/inkassatsiya, sababsiz → 422                |
| `ShiftReportTest`           | X va Z matematikasi, kutilgan naqd serverda              |
| `FiscalReceiptTest`         | Xato → `offline_queued` → retry → `registered`           |
| `PrintJobTest`              | Claim → ack → retry; ikkita terminal bir jobni olmaydi   |
| `PriceRuleTest`             | Happy hour, kanal narxi, ustuvorlik                      |
| `SplitMergeTransferTest`    | Hisob bo'linishi, birlashishi, ko'chishi                 |
| `TenantIsolationTest` (Pos) | 11 jadval bo'yicha                                       |
| Mavjud `ModuleBoundaryTest` | Yashil qoladi: yangi schema, registr, marshrut prefiksi  |

### Frontend

- **vitest** — savat matematikasi (tiyinda), split hisobi, qaytim, narx qoidasi
  qo'llanishi, offline navbat tartibi
- **Playwright e2e** — `pair → PIN → sotish → to'lov → smena yopish` to'liq oqimi

---

## 14. Fayllar ro'yxati

### 14.1 To'liq yangi (mavjud kodga tegmaydi)

| Yo'l                                                            | Nima                                                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/api/Modules/Pos/**`                                       | 12-modul: 11 model, 11 migratsiya, factory, request, resource, controller, servis, marshrut, seeder, test |
| `apps/api/app/Contracts/Orders/**`                              | `BillRegistry` + DTO + `UnavailableBillRegistry`                                                          |
| `apps/api/app/Contracts/Finance/**`                             | `TillLedger` + DTO + `UnavailableTillLedger`                                                              |
| `apps/api/app/Contracts/Pos/**`                                 | `Fiscalizer` + DTO                                                                                        |
| `apps/api/Modules/Orders/app/Services/EloquentBillRegistry.php` | Yangi fayl                                                                                                |
| `apps/api/Modules/Finance/app/Services/EloquentTillLedger.php`  | Yangi fayl                                                                                                |
| `apps/pos/**`                                                   | Yangi Next.js PWA                                                                                         |
| `docs/modules/12-pos.md`, `docs/decisions/0011-pos-boundary.md` | Yangi hujjatlar                                                                                           |

### 14.2 Bir qator qo'shiladigan (mavjud qatorlar o'zgarmaydi)

| Fayl                                                                       | Qo'shiladigan                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| `apps/api/modules_statuses.json`                                           | `"Pos": true`                                        |
| `apps/api/database/migrations/0000_01_01_000000_create_module_schemas.php` | ro'yxatga `pos`                                      |
| `apps/api/config/database.php` + `.env.example`                            | `search_path` ga `,pos`                              |
| `apps/api/database/seeders/RolesAndPermissionsSeeder.php`                  | `MODULES` += `'pos'`; 8 nomli ruxsat; rollarga grant |
| `apps/api/tests/Architecture/ModuleBoundaryTest.php`                       | `MODULE_SCHEMAS` += `'Pos' => 'pos'`                 |
| `apps/api/Modules/Orders/app/Providers/OrdersServiceProvider.php`          | 1 ta `bind()`                                        |
| `apps/api/Modules/Finance/app/Providers/FinanceServiceProvider.php`        | 1 ta `bind()`                                        |
| `apps/api/app/Providers/AppServiceProvider.php`                            | `Unavailable*` zaxira bog'lanishlari                 |
| `packages/types/src/module.ts`                                             | `ModuleKey` += `'pos'`; `PHASE_1_MODULES` += yozuv   |
| `packages/i18n`                                                            | `pos` tarjima bo'limi (uz/ru/en)                     |
| `commitlint.config.mjs`                                                    | scope += `pos`                                       |
| `apps/admin/.../modules/page.tsx`                                          | `pos` qatori                                         |
| `pnpm-workspace.yaml`, `turbo.json`                                        | `apps/pos`                                           |
| `CLAUDE.md`                                                                | 12-modul, POS ilovasi                                |

### 14.3 Tegilmaydi

`CashShift::close()`, `Payment::METHODS`, `Expense::CATEGORIES`, `Order` modeli,
mavjud migratsiyalar, mavjud testlar, `apps/web`, `apps/admin` sahifalari.

---

## 15. Bosqichlar

Har bir bosqich **yashil testlar bilan** tugaydi.

| #     | Bosqich                     | Mazmun                                                                                                                               |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **0** | Reyestr                     | `Modules/Pos` skeleti, `pos` schema, 8 ta sinxronlik nuqtasi, ruxsatlar. Arxitektura testlari yashil                                 |
| **1** | Terminal va identifikatsiya | `terminals`, `pins`, `sessions`; ulash, PIN, heartbeat                                                                               |
| **2** | Sotuv yadrosi               | `BillRegistry` + `TillLedger` shartnomalari, `sync_entries` idempotentligi, hisob → qator → yuborish → aralash to'lov, `price_rules` |
| **3** | Nazorat                     | `approvals`, `drawer_movements`, X/Z hisobot, split/merge/transfer, `Finance` ilmog'i                                                |
| **4** | Chiqish                     | `printers`, `print_jobs`, `fiscal_receipts` + drayver seamlari                                                                       |
| **5** | Frontend                    | `apps/pos` — pair, PIN, 4 rejimli sotuv ekrani, zal xaritasi, to'lov, smena, 8 rol ish maydoni, Apple-style                          |
| **6** | Hujjat                      | `docs/modules/12-pos.md`, ADR-0011, `CLAUDE.md`                                                                                      |

---

## 16. Qamrovdan tashqari (hozircha YAGNI)

Kiosk (o'z-o'ziga xizmat), mijoz displeyi, tarozi va barcode skaner, kurslar
(coursing), banket oldindan to'lovi, ko'p valyuta, chaevoy taqsimoti (ish haqiga
ulanish), agregatorlarni to'g'ridan-to'g'ri terminalga ulash, real `uz_ofd`
drayveri (provayder shartnomasi kelganda).

Bularning hech biri arxitekturani o'zgartirmaydi — hammasi mavjud seamlarga
ulanadi.
