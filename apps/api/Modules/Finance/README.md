# Modul 8 — Moliya va kassa (Finance & POS Payments)

> Kassa smenasi, to'lovlar, fiskal cheklar, xarajatlar va kunlik moliyaviy yopilish.

**Alias:** `finance` · **Namespace:** `Modules\Finance` · **API prefiks:** `/api/v1/finance`

---

## Asosiy funksiyalar

- Kassa smenasi: ochish, X-hisobot, Z-hisobot, yopish
- To'lov usullari: naqd, bank kartasi, Payme, Click, Uzum, korporativ
- Aralash to'lov (bir chek — bir necha usul)
- Fiskal modul integratsiyasi (O'zbekiston onlayn-kassa talabi)
- Chek chop etish va elektron chek (QR)
- Qaytarish (refund) va bekor qilish — sabab va rahbar tasdig'i bilan
- Kassadagi naqd pul nazorati (inkassatsiya)
- Xarajatlar: ijara, kommunal, ish haqi, xarid
- Kunlik / oylik moliyaviy hisobot (P&L)
- Filiallar bo'yicha konsolidatsiya

---

## Database jadvallar (rejalashtirilgan)

- `cash_shifts` — kassa smenalari
- `payments` — to'lovlar
- `payment_methods` — to'lov usullari
- `fiscal_receipts` — fiskal cheklar
- `refunds` — qaytarishlar
- `expenses` — xarajatlar
- `expense_categories` — xarajat kategoriyalari
- `cash_movements` — kassa pul harakati

Har bir jadvalda `tenant_id` bo'ladi va model `BelongsToTenant` trait'ini
ishlatadi — bitta restoran boshqasining ma'lumotini hech qachon ko'rmaydi.

---

## API endpointlar (rejalashtirilgan)

```
GET    /api/v1/finance/                   — modul ma'lumoti
POST   /api/v1/finance/shifts/open        — kassa smenasini ochish
POST   /api/v1/finance/shifts/close       — Z-hisobot va yopish
POST   /api/v1/finance/payments           — to'lovni qabul qilish
POST   /api/v1/finance/refunds            — qaytarish
GET    /api/v1/finance/expenses           — xarajatlar
GET    /api/v1/finance/reports/daily      — kunlik hisobot
```

Barcha endpointlar `auth:sanctum` + `tenant` middleware ostida.
Har bir amal Spatie permission bilan himoyalangan:
`finance.view`, `finance.create`, `finance.update`, `finance.delete`, `finance.manage`.

---

## Kunni yopish (P10)

Kassir pulni sanaydi, ekran tiyingacha rozi bo'ladi, Z ikkita imzo joyi bilan
chop etiladi. Oqshom aynan shu tartibda o'tadi va har bir qadam o'zidan
oldingisini talab qiladi.

### 1. Nominal bo'yicha sanash

Yashik **jami summa bilan emas, banknot bilan** sanaladi. Sabab oddiy: ochiq
yashik oldida turgan odam qo'lida pul ushlab turadi, boshida summa emas — va
«480 000» ni yashikni umuman ochmasdan ham yozib qo'yish mumkin. Bu esa har bir
Z solishtiriladigan raqam.

- Banknotlar: **200 000 · 100 000 · 50 000 · 20 000 · 10 000 · 5 000 · 2 000 ·
  1 000 so'm.** Tanga qatori yo'q. Ro'yxat `config/config.php` da (so'mda),
  `GET /api/v1/finance/denominations` orqali beriladi — mijoz qattiq yozmasin.
- Jami **faqat** banknotlardan hisoblanadi (`CashDenominations::total()`), va
  qatorga **saqlanadi**: ro'yxat konfiguratsiya, kelasi yil bir banknot
  chiqarilsa o'tgan yilgi Z o'zgarmasligi kerak.
- Mijoz ham jami, ham banknot yuborsa va ular mos kelmasa — **rad etiladi**.
  Ikkitasidan birini tanlash Z ni `if` ning qaysi shoxi ishlaganiga bog'lab
  qo'yardi.
- Ro'yxatda yo'q nominal va manfiy dona ham rad etiladi. Manfiy «dona» —
  o'g'irlik oladigan shakl: yashikdan hech narsa olmasdan jamini kamaytiradi.

Sanoq `finance.cash_counts` da: `kind` = `open` · `close` · `handover` ·
`collection` · `top_up` · `x`, va **ikkita imzo** — `counted_by_user_id` va
`witnessed_by_user_id`.

### 2. Smena qulfi

`POST shifts/{shift}/lock` → `status = counting`. Sotayotgan kassani sanash —
sanayotganingizda o'sib boradigan farq, va so'raladigan odam pulni ushlab
turgan kishi. Qulflangan smena to'lov ham, chiqim ham, qaytarish ham qabul
qilmaydi: modulning barcha tekshiruvlari `status !== 'open'` ni o'qiydi.

Qulfdan chiqarish — **menejer kaliti** (`finance.manage`). O'z yashigini
qulfdan chiqara oladigan kassir o'z sanog'i o'rtasida to'lov qabul qila oladi.

`unclosed()` skopi shu yerda paydo bo'ldi: «bu kassirda smena bormi» degan
tekshiruv `open()` ni o'qirdi, ya'ni `counting` paydo bo'lgan zahoti kassirga
ikkinchi yashik berilardi.

### 3. Kutilgan naqd — bitta formula, oltita had

`CashShift::computeExpectedCash()`, va **faqat u**:

```
opening_cash + naqd to'lovlar + yaxlitlash + naqd choypuli + keltirilgan pul − naqd chiqim
```

`expectedCashTerms()` xuddi shu hadlarni nomi bilan qaytaradi — hisobot
o'zgaruvchilarni ko'rsatib, jamini boshqa joydan olishi mumkin emas.

Karta, Click, Payme, korporativ — qutidan o'tmaydi. Ekvayring ulushi ham:
mehmon to'liq to'lagan, bank keyinroq hisobdan yechadi.

**Keltirilgan pul** (`finance.cash_movements`, `direction = in`) — maydalash
uchun seyfdan olib kelingan pul. Bu had yo'q edi, shuning uchun har bir
bunday holat yopilishda «yashik ortiqcha» bo'lib qaytardi.

### 4. Farq zinapoyasi

Rejadagi «farq nolga teng bo'lmasa yopilmaydi» so'zma-so'z olinmaydi: 100
so'mlik kamomad kassani abadiy qulflaydi va kassirni sanagan raqamini emas,
to'g'ri keladigan raqamni yozishga o'rgatadi. To'g'ri o'qilishi — farq hech
qachon **jimgina** yopilmaydi:

| farq (absolyut) | nima kerak                                  | xato kodi                         |
| --------------- | ------------------------------------------- | --------------------------------- |
| 0               | hech narsa                                  | —                                 |
| > 0             | sabab                                       | `finance.variance_needs_reason`   |
| ≥ 20 000 so'm   | sabab + menejer imzosi                      | `finance.variance_needs_approval` |
| ≥ 50 000 so'm   | + `finance.shift_variance_flagged` hodisasi | —                                 |

Ortiqcha ham kamomad kabi baholanadi — ortiqchaning odatdagi sababi
rasmiylashtirilmagan sotuv.

Ostonalar `config/config.php` da **tiyinda**, `20_000 * 100` ko'rinishida;
tenant uchun `tenants.settings['variance_thresholds_som']` (so'mda),
konvertatsiya bitta joyda.

**Menejer imzosi:** PIN Pos modulida qoladi (modul chegarasi), Finance esa
siyosat va yozuvni oladi. Pos `pos.approvals` orqali imzo oladi va
`approved_by_user_id` ni uzatadi; Finance uni **mustaqil** tekshiradi —
mavjud, shu restorandan, `finance.manage` bor, va **kassirning o'zi emas**.
O'zini o'zi tasdiqlash ikkinchi juft ko'z emas, o'sha juftning o'zi.

### 5. X va Z — bitta hujjat, ikki payt

`GET shifts/{shift}/report`. Ochiq smenada X (hech narsani yopmaydi), yopilgan
smenada — imzolangan Z. Bitta endpoint ataylab: ikkitasi bo'lsa ular
ajralib ketadi, va bu modulda aynan shu bo'lgan.

Bo'limlar tartibi rejadan: **aylanma → to'lov turlari → naqd kassa →
tuzatishlar**. Har biri keyingisini tushuntiradi: nima sotdik, uning qaysi
qismi banknotda keldi, demak qutida nima bo'lishi kerak, va nega aynan
shuncha emas. Tuzatishlarni oldinga qo'ysangiz o'sha raqamlar oqlanishga
aylanadi.

**Z muzlatiladi.** Yopishda butun hujjat `cash_shifts.z_report` ga yoziladi va
keyin faqat o'sha o'qiladi. Ilgari aylanma, usullar bo'yicha taqsimot va chek
soni yopilgandan keyin ham jonli hisoblanardi — kechagi chekni bugun
qaytarsangiz kechagi Z jim o'zgarardi, papkadagi imzolangan varaqdan farq
qilib.

### 6. Topshirish

`POST shifts/{shift}/handover` — smena yopiladi, **o'sha banknotlar** keyingi
kassirning boshlang'ich puliga aylanadi. Pul yashikdan chiqmaydi; chiqib
qaytadigan bo'lsa bu ikkita sanoq, ikkita xato imkoniyati va kassa oldida
navbat bo'lardi. Aloqa `handed_over_to_shift_id` da saqlanadi — «uning float'i
uning yopilish sanog'i» isbotlanadigan bo'lsin, ikkita tasodifan mos raqam
emas.

### 7. Qaytarish qaysi yashikdan chiqadi

| holat                               | nima bo'ladi                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| to'lov o'z smenasida, smena ochiq   | faqat status `refunded`. **`Expense` yozilmaydi**            |
| to'lov boshqa **ochiq** smenaniki   | rad — «pulni olgan kassada qaytaring»                        |
| to'lov **yopilgan** smenaniki, naqd | status + joriy ochiq smenaga `refund` kategoriyali `Expense` |
| karta / Click / Payme               | status; quti ochilmaydi — bank hisobdan qaytaradi            |

Bir smena ichida `Expense` yozilmasligi eng oson yanglishadigan joy:
`computeExpectedCash()` faqat `captured` to'lovlarni qo'shadi, ya'ni statusni
o'zgartirishning o'zi pulni kutilgan naqddan olib tashlaydi. Ustiga chiqim
yozilsa **ikki marta** ayiriladi.

### Endpointlar

```
GET  /api/v1/finance/denominations              finance.view
GET  /api/v1/finance/shifts/{shift}/report      finance.view    X yoki muzlatilgan Z
POST /api/v1/finance/shifts/{shift}/lock        finance.update
POST /api/v1/finance/shifts/{shift}/unlock      finance.manage
POST /api/v1/finance/shifts/{shift}/count       finance.update  nazorat sanog'i
POST /api/v1/finance/shifts/{shift}/collection  finance.update  inkassatsiya
POST /api/v1/finance/shifts/{shift}/cash-in     finance.update
POST /api/v1/finance/shifts/{shift}/handover    finance.update
POST /api/v1/finance/shifts/{shift}/close       finance.update  javob = Z hujjati
```

---

## Fiskallashtirish (P11)

**Qoida:** o'lik fiskal modul buyurtmani **hech qachon to'smaydi.** Hujjat
`EloquentTillLedger::capture()` ichida, to'lov bilan **bitta tranzaksiyada**
yoziladi; OFD bilan suhbat esa `DB::afterCommit` dan keyin boshlanadi. Ya'ni
tarmoq chaqiruvi hech qachon kassa qatorini qulflab turmaydi, va soliq xizmati
javob bermasa ham mehmon to'laydi, hisob yopiladi.

Buning narxi — **24 soatlik oyna** (`FISCAL_WINDOW_HOURS`). Oyna yopilgach
hujjat navbat elementi bo'lishdan to'xtaydi va **majburiyatga** aylanadi:
`expired` holati, `finance.fiscal_receipt_expired` hodisasi, Z-hisobotdagi
`fiscal.expired` qatori va probadagi son.

| holat        | nima deydi                                                        |
| ------------ | ----------------------------------------------------------------- |
| `pending`    | lokal yozildi, hali qabul qilinmadi — backoff bilan qayta urinadi |
| `sent`       | yuborildi, javob kutilmoqda                                       |
| `registered` | qabul qilindi; `fiscal_sign` — mehmon tekshiradigan yagona narsa  |
| `expired`    | oyna yopildi — korreksiya kerak, qayta urinish emas               |
| `void`       | fiskallashtirilmasdan qaytarildi — e'lon qilinmagan, tuzatilmaydi |

**Bitta hisob — bitta e'lon.** Ikkita karta va naqd bilan to'langan stol —
uchta `payment` qatori va **bitta** deklaratsiya. `file()` yozuvni drayverga
murojaat qilishdan oldin qaytadan o'qiydi: bitta tranzaksiyada ikkita tender
bir hujjatni ikki marta navbatga qo'yadi, va eskirgan nusxaga ishonish bir
taomni soliqqa **ikki marta** e'lon qilardi.

```
GET  /api/v1/finance/fiscal/probe                        finance.view    modul raqami >= 8 raqam + ulanish
GET  /api/v1/finance/fiscal/receipts                     finance.view    ?filter[status]=pending|expired
GET  /api/v1/finance/fiscal/receipts/{receipt}           finance.view
POST /api/v1/finance/fiscal/receipts/{receipt}/duplicate finance.update  NUSXA nusxasi, yangi sotuv emas
POST /api/v1/finance/fiscal/relay                        finance.manage  navbatni qo'lda bo'shatish
```

`fiscal:relay` har daqiqada `withoutOverlapping` bilan ishlaydi va butun node
bo'ylab (`withoutTenancy`) supuradi; `POST fiscal/relay` esa faqat so'rovchining
restorani uchun — bir venue tugmasi boshqasining deklaratsiyalarini
yubormasligi kerak.

---

## Onlayn to'lov (Payme · Click · Uzum)

Mehmon telefonidan to'laydigan yo'l. Ikki narsa ataylab bir-biridan ajratilgan:

- **`finance.payment_invoices` — urinish.** Payme'ga ochilgan, mehmon esa
  ilovani yopib qo'ygan har bir hodisa shu yerda qoladi. Ularni
  `finance.payments` ga qo'shish kunlik tushumga hech qachon kelmagan pulni
  yozgan bo'lardi — bu modul aynan shu raqamni to'g'ri saqlash uchun bor.
- **`payments` — kelgan pul.** Faqat provayder tasdiqlagach yoziladi, va usul
  `payme`/`click`/`uzum` deb — umumiy `online` emas: uchtasining komissiyasi
  `AcquirerFees` da alohida turadi va egasi bank ko'chirmasini bittalab
  solishtiradi.

Protokol drayverda (`app/Payments/`), pul harakati esa bitta joyda
(`Services/OnlinePaymentLedger`). Payme JSON-RPC bilan **bizga** murojaat
qiladi, Click esa Prepare/Complete va MD5 imzo bilan. `settle()` qatorni
`FOR UPDATE` bilan qulflaydi — bank tozalanmagan javob olguncha qayta uradi va
oltita PerformTransaction bitta tender yozishi shart. `Idempotency-Key` bu
yerda yordam bermaydi: bank bizning sarlavhamizni yubormaydi, shuning uchun
callback marshruti `EnsureIdempotency` dan istisno (sababi
`IdempotencyCoverageTest::EXEMPT` da yozilgan).

| Endpoint                               | Kim chaqiradi                        |
| -------------------------------------- | ------------------------------------ |
| `GET  v1/public/payments/providers`    | mehmon — qaysi tugmalar chiziladi    |
| `POST v1/public/payments/invoice`      | mehmon — buyurtma raqami → `pay_url` |
| `GET  v1/public/payments/{invoice}`    | mehmon telefoni — holatni so'raydi   |
| `POST v1/payments/{provider}/callback` | bank — imzo drayverda tekshiriladi   |
| `GET  v1/payments/providers`           | konsol — o'chiqlarini ham ko'rsatadi |

Kalit yo'q provayder — **o'chiq**, xato emas (`available: false`). Ko'p restoran
bitta ekvayer bilan shartnoma qiladi; bo'lmagan tugmani chizish esa mehmon
to'lashga rozi bo'lgandan **keyin** yiqiladi.

`sandbox` — noutbukdagi provayder: hisobni darhol `paid` qiladi va
**production'da konstruktor xato tashlaydi**. Sababi `DemoFiscalDriver` nikiga
teng: pul kelmasdan «to'landi» degan rels — bu ovqatni tekinga berayotgan
restoran, paneli esa tushum ko'rsatib turadi.

---

## Daftar: to'lov usullari, toifalar, davrlar, aktivlar va kassa kitobi

Beshta jadval, va ularning to'rttasi konsolning allaqachon chizilgan ekranlari
ostidagi bo'shliqni yopadi.

### `finance.payment_methods`

Restoranning **qarori**, tenderning o'zi emas. `method` ustuni
`Payment::METHODS` bilan cheklangan — kassa shu qiymatlar bo'yicha shoxlanadi,
Z-hisobot shular bo'yicha bo'linadi, `AcquirerFees` har biriga stavka saqlaydi
— shuning uchun undan tashqaridagi qator kassa pul ololmaydigan yorliq bo'lardi.

**Karta rekvizitlari bu yerda saqlanmaydi va hech qachon saqlanmaydi.** PAN
yo'q, muddat yo'q, CVV yo'q, egasining ismi yo'q. Platforma kartani hech qachon
ushlamaydi: ekvayring terminali kartani oladi va tasdiq kodini qaytaradi
(`payments.reference`), onlayn rels esa mehmonni bankning o'z sahifasiga
yuboradi. Rekvizitlarni saqlash har bir restoran uchun butun platformani
PCI-DSS doirasiga kiritardi — hech kim so'ramagan imkoniyat evaziga. Drayver
kalitlari (`PAYME_MERCHANT_ID`, `CLICK_SECRET`) muhitda, tenant qatorida emas:
sizib chiqqan baza sizib chiqqan merchant hisobi emas.

`fee_bps` — bazis punkt (foizning yuzdan biri), chunki 1.2% butun foizda
ifodalanmaydi va alternativa pul yo'lida float bo'lardi. `null` — «kelishilgan
stavka yo'q», `0` — «bu rels bepul»; ikkalasini ajratmagan ustun jadval
to'ldirilgan kuni har bir relsning komissiyasini jimgina nolga tushirardi.

### `finance.expense_categories`

`Expense::CATEGORIES` konstantasi **qoladi** — kassa `refund` ni yopilish
paytida, `payroll` ni oylik yozilganda nom bilan yozadi — va ustun varchar
bo'lib qoladi. Jadval uning ustidagi **katalog**: sakkiztasini qayta nomlash
mumkin, o'chirish mumkin emas, to'qqizinchisini esa restoran o'zi qo'shadi.
`direction` daromad va xarajatni ajratadi, chunki tushum to'lov usuli bo'yicha
tasniflanadi va sotuv bo'lmagan pul (zal ijarasi, yetkazuvchi bonusi) uchun
joy yo'q edi.

### `finance.accounting_periods`

Jadval — kichik yarmi; **qulf** — asosiy qismi. `PeriodLock` va
`ClosedPeriodObserver` orqali shu moduldagi har bir pul yozuvi (payment,
expense, cash_movement) yozilishdan oldin shu jadvalni so'raydi va
`business_date` si yopilgan oyga tushgan qator `finance.period_closed` bilan rad
etiladi. **`TillLedger::amendClosedShift()` ham istisno emas** — u muhrlangan
_smenaga_ ochilgan yagona eshik, yopilgan _oy_ esa binodan chiqib ketgan raqam.

### `finance.fixed_assets`

To'g'ri chiziqli amortizatsiya, va faqat u. Xarid qilingan oyda hech narsa
yozilmaydi (keyingi oydan boshlanadi), oxirgi oy qoldiqni oladi, sotilgan oydan
keyin to'xtaydi. `finance.expenses` ga hech narsa **yozilmaydi**: har oy
yozadigan vazifa ikki marta ishga tushsa ikki marta yozadi, hosila qiymat esa
narx tuzatilganda o'zini qayta hisoblaydi.

### `finance.cash_accounts` va ikki oyoqli o'tkazma

Kassa kitobining qatorlari uchta jadvalda yashaydi va birortasi sana oralig'ini
qabul qilmasdi. Yomonrog'i: o'tkazma bitta qator edi — seyfga ketgan
5 000 000 so'm «ketgan pul» bo'lib o'qilardi va foyda qilgan kecha zarar
ko'rsatardi. `counterpart_id` ikki oyoqni bir-biriga qaratadi.

### Endpointlar

```
GET    /api/v1/finance/payment-methods           — o'n bitta tender, sozlanmagani ham
POST   /api/v1/finance/payment-methods           — tenderni taklif qilish        (finance.manage)
PATCH  /api/v1/finance/payment-methods/{method}  — nom, kind, fiskal, stavka, tartib
DELETE /api/v1/finance/payment-methods/{id}      — sozlamani olib tashlash

GET    /api/v1/finance/expense-categories        — ?with_counts=1 · ?direction=in|out
POST   /api/v1/finance/expense-categories        — to'qqizinchi toifa            (finance.manage)
PATCH  /api/v1/finance/expense-categories/{code} — nom, tartib, arxiv
DELETE /api/v1/finance/expense-categories/{id}   — yozuvsiz toifani o'chirish

GET    /api/v1/finance/periods?months=12         — oylar, tegilmagani ham
POST   /api/v1/finance/periods/{YYYY-MM}/close   — oyni yopish                   (finance.manage)
POST   /api/v1/finance/periods/{YYYY-MM}/reopen  — sabab MAJBURIY                (finance.manage)

GET    /api/v1/finance/fixed-assets?month=       — reyestr + jamlar
POST   /api/v1/finance/fixed-assets              — aktiv qo'shish                (finance.manage)
GET    /api/v1/finance/fixed-assets/{id}
PATCH  /api/v1/finance/fixed-assets/{id}         — tuzatish yoki chiqim (disposed_on)
DELETE /api/v1/finance/fixed-assets/{id}

GET    /api/v1/finance/cash-book?from=&to=&branch=  — uch jadval, bitta ro'yxat
GET    /api/v1/finance/cash-book/accounts
POST   /api/v1/finance/cash-book/transfers       — ikki oyoq, bitta tranzaksiya  (finance.manage)
```

Kassa kitobi oynasi **eng ko'pi bilan 92 kun** (`finance.window_too_wide`):
o'qish moduldagi eng tez o'sadigan uchta jadvalga tegadi.

---

## Boshqa modullar bilan bog'liqlik

- **Orders** — yopilgan buyurtma to'lovga o'tadi
- **Staff** — kassir smenasi va javobgarligi
- **Suppliers** — xarid xarajatlari
- **Analytics** — tushum, marja, P&L

---

## Ishlab chiqish

```bash
cd apps/api

# Migratsiya yaratish
php artisan module:make-migration create_<table>_table Finance

# Model + factory
php artisan module:make-model <Name> Finance --factory

# Controller
php artisan module:make-controller <Name>Controller Finance --api

# Testlar
php artisan test --filter=Modules\\Finance
```

---

## Status

Phase 1 · ✅ **Implementatsiya qilingan** — CashShift, Payment, Expense,
CashCount, CashMovement. Model, migratsiya, factory, form request, API resource,
controller, RBAC route, seeder va feature testlar mavjud.

POS rejasi · **P10 (kunni yopish) tugallandi** — nominal bo'yicha sanash,
smena qulfi, farq zinapoyasi, X/Z hujjati, muzlatilgan Z, topshirish,
inkassatsiya. Testlar: `DayCloseLadderTest`, `DrawerRefundTest`,
`ShiftReportAgreementTest`.

Daftar · ✅ **To'lov usullari, xarajat toifalari, hisob davrlari, asosiy
vositalar va kassa kitobi** — migratsiya (RLS), model, request, resource,
controller, RBAC route, `FinanceLedgerSeeder` va testlar
(`LedgerConfigurationTest`, `ClosedPeriodTest`, `CashBookTest`) mavjud.
Oy yopilgach o'sha oyga har qanday pul yozuvi 422 bilan rad etiladi —
`amendClosedShift()` ham.

POS rejasi · **P11 (fiskallashtirish) tugallandi** — drayver shartnomasi,
demo drayver (production'da ishlamaydi), `fiscal_receipts`, backoff bilan
navbat, 24 soatlik oyna, NUSXA dublikati va beshta endpoint. Sotuv endi
`capture()` ichida e'lon qilinadi. Test: `FiscalisationTest`.

Haqiqiy OFD provayderi hali yo'q — `FISCAL_DRIVER=none` bo'lganda cheklar
navbatda turadi va oyna yopilganda `expired` bo'ladi, ya'ni fiskal modulsiz
savdo qilayotgan restoran buni **ko'radi**.

Kanonik namuna: `Modules/Menu`.
