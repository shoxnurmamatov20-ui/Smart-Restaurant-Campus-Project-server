# Smart Restaurant Campus — Restoranlar uchun yagona raqamli platforma

> Multi-tenant SaaS for restaurants, cafés and canteens. Target scale: extreme
> (multi-tenant, multi-branch, multi-country).

## Loyiha holati (Status)

- **Status (2026-08-22, kun oxiri):** Backend to'liq ulandi — **207 `TODO(api)`
  → 0, keyin 64 «integratsiya» belgisidan ichki bo'lganlari ham → 0.** 14 modul
  (Marketplace, Board yangi), ~430 endpoint, 2139 PHP testi, 1105 frontend
  testi, 24 E2E. Har ekran jonli. Qolgan **faqat 9 ta tashqi kalit**
  (`docs/GO-LIVE.md`): Eskiz SMS, Payme/Click, OFD, SMTP, Telegram bot, Expo,
  Apple, xarita SDK, PBX — bular kod emas, shartnoma. Qoidalar endi serverda
  ijro etiladi (`config/settings.php` → `policies.*`, har biri `BillRegistry`,
  `ApprovalGate`, KDS yoki stop-listda o'qiladi — test juftligi bilan).
- **Production'da hali `log` drayverlari:** `SMS_DRIVER=log` (mijoz kod
  olmaydi — Eskiz kaliti kerak), `FISCAL_DRIVER=none`, `PAYMENTS_SANDBOX_ENABLED=true`
  (demo to'lov), `MAIL_MAILER=log` (parol tiklash xati ketmaydi). Bular
  ataylab: kalitsiz server **ishga tushadi**, lekin halol «namoyish» holatida.
- **Demo hisoblar qulflangan** (`demo:lock`, 2026-08-22): `owner@demo.uz/password`
  endi ishlamaydi; parollar bir marta chop etilgan. Haqiqiy egasi
  `restaurant:create-owner` bilan yaratiladi.
- **P12 oflayn — ikkala tomon ham yopildi.** Serverda oltita ziddiyat turi
  ilgari faqat _so'ralardi_: `ConflictKind` hujjati `ConflictResolution` va
  `POST sync/resolve` ga ishora qilardi, ikkalasi ham mavjud emasdi — ya'ni
  navbat hech qachon bo'shamasdi. Endi o'n beshala javob ishlaydi
  (`Modules/Pos/app/Sync/`), planshetda esa lokal navbat
  (`(pos)/pos/pos-queue.ts`) va savol ekrani (`sync-panel.tsx`) bor.
- **Mehmon va mijoz yuzalari tugadi** — `(customer)` yettala ekrani
  (bosh sahifa, menyu, savat, to'lov, kuzatuv, sodiqlik, profil) va `(guest)`
  beshtasi (QR kirish, menyu, holat, hisob, baho).
- **Dizaynga tekislash (2026-08-21).** Handoff paketiga qarshi to'liq audit
  o'tkazildi va **frontend tomonidagi bloklovchi farqlar yopildi**. Eng katta
  saboq qoidada: `README.md` aynan shunday deydi — «hujjat bilan fayl
  ziddiyatga tushsa, **fayl g'olib**, hujjat esa xato». `specs/01-os.md` yon
  panelda 22 qator va 3 guruh deydi, `files/Smart Restaurant OS.dc.html` esa
  **24 qator va 4 guruh** chizadi; men bir marta `specs`dan qurib `Katalog`
  guruhini va `board` · `cases` modullarini yo'qotdim. Endi hammasi fayldan
  o'qilgan va `apps/web/src/lib/design-fidelity.test.ts` buni qulflaydi.
- **Yangi yuzalar:** `(telegram)` mini ilova (menyu · savat · kuzatuv ·
  ballar), `(marketplace)` iste'molchi tomoni (bosh sahifa · do'kon · savat ·
  kuzatuv), `(merchant)` sotuvchi paneli (90 soniyalik navbat · katalog),
  `settings/site` — sayt va PWA sozlagichi. **02 · Hujjatlar ham qurildi**
  (2026-08-21): yettala chop etiladigan hujjat bitta marshrutda, `?d=` bilan
  tanlanadi (`(documents)/documents`). Yuza yon panelda yo'q — dizayn 24 qator
  chizadi, 25-chisi yo'q — unga kirish hujjatni tug'dirgan ekrandan: kassadan Z,
  daftardan faktura, ombordan sanoq varag'i. Ruxsat ikki qavat: `middleware`
  eshikni (`SURFACE_ACCESS.documents`), sahifa esa `?d=` ni
  (`DOCUMENT_ACCESS`, spec §7 dan). Backend hali yo'q: fiskal QR, chop etish
  agenti, A4 quvuri — hammasi `TODO(api)` bilan belgilangan.
- **Code:** Monorepo tayyor — Laravel API (12 modul), web/admin (Next.js),
  AI xizmatlari (FastAPI), Telegram botlar (aiogram, 50 bot), Docker/K8s/monitoring
- **Testlar (2026-08-22, tun):** 2139 PHP testi / 12 060 assertion + **1105
  frontend testi** (web 1105 · qolgan paketlar alohida) + 24 Playwright E2E (jonli saytga qarshi 22 o'tadi, 2 tasi
  `OTP_TEST_CODE` faqat local bo'lgani uchun ataylab skip) — barchasi yashil. `pnpm type-check`, `pnpm lint`, `pnpm test`,
  `pnpm build`, `pnpm format:check`, `vendor/bin/pint --test`,
  `vendor/bin/phpstan` — hammasi toza. PHPStan 2026-08-21 gacha umuman ishga
  tushmasdi (baseline o'chirilgan `PosPin.php` ni nomlardi); tuzatilgach 9
  yashirin xato topildi va yopildi — `CHANGELOG.md` da.
- **Dizayn `docs/design/source/` da, va u yagona manba (2026-08-21).** O'n to'rtta
  `.dc.html` + uchta runtime skripti repoda commit qilingan.
  **Ilgari bu boshqacha edi va aynan «dizayner ikki xil bo'lib qolgan» muammosini
  keltirib chiqargan:** `source/` da **bekor qilingan v1.0** turardi (konsolning
  `NAV_ALL` i **19** modul), joriy o'n to'rttasi esa `.gitignore` dagi eksport
  papkasida (`NAV_ALL` **24**). Ekranlar muallif qaysi nusxani ochganiga qarab
  qurilgan. `GAPS.md` v1 haqida: «That package is superseded. **Discard any copy
  of it.**»
- **Dizayn qamrovi mexanik tekshiriladi va endi CI'da ham ishlaydi:**
  `design-coverage.test.ts` `docs/design/source/` ni o'qiydi (eksport papkasi
  mavjud bo'lsa uni afzal ko'radi) va e'lon qilingan har bir ekranga marshrut
  borligini tekshiradi: oltita fayldan **40 ekran**, xodimlar ilovasidan
  **20 ichki ekran**, konsolning **24 moduli**, super-adminning **12 ekrani** va
  xodimlar ilovasining yuqori darajali marshrutlari. Ataylab birlashtirilgan
  ikkitasi (`checkout`, `item`) sababi bilan `MERGED` ro'yxatida.
- **Token qatlami ham mexanik qulflangan:** `apps/web/src/lib/design-tokens.test.ts`
  dizayn faylining `:root` va `[data-theme="dark"]` bloklarini parse qiladi va
  **115 yorug' + 36 qorong'i** tokenning har birini `tokens.css` bilan solishtiradi.
  Birinchi ishga tushishda uchta nuqson topdi: `--pos-idle` yo'q edi,
  `--danger-400` o'ylab topilgan edi, `--text-7xl` mapped emas edi.
- **Motion qatlami:** `packages/ui/src/styles/motion.css` — dizaynning o'n bitta
  `@keyframes` i va ularning bog'lanishlari. Ilgari repoda **nol** `@keyframes`
  bor edi, dizaynda esa 38 ta qo'llash. Toast ham dizaynникi:
  `flash()` / `flash.problem()` (`@restaurant/ui`), pastda-o'rtada, 2.8s, bittadan.
- **Telefon qatlami — 2026-08-23 da butun mahsulot bo'ylab o'lchandi.** 160
  marshrut (`apps/web` 114 + `apps/admin` 46) oltita kenglikda (320 · 360 · 414
  · 768 · 1024 · 1440) Playwright bilan supurildi; sweep `hasTouch` bilan
  ishlaydi, ya'ni `pointer: coarse` qoidalari ham o'lchanadi. Topilgan naqshlar takrorlanadi, shuning uchun qoida sifatida
  yozilgan:
  - **Grid elementi `min-w-0` siz qisqarmaydi.** Uning avtomatik minimumi —
    `min-content`, ya'ni eng uzun so'z. Ikkala ustunga ham qo'yiladi: bitta
    ustunli trek eng keng elementning min-content'i bo'ladi, shuning uchun
    bittasini tuzatish hech narsani tuzatmaydi.
  - **`repeat(auto-fit, minmax(320px, 1fr))` — 292px konteynerda ham 320px
    trek.** To'g'ri shakli `minmax(min(320px, 100%), 1fr)`; 57 joyda tuzatildi.
  - **`overflow-hidden` karta ichidagi jadval — qirqiladi, ko'chmaydi.** Karta
    burchaklari uchun `overflow-hidden` qoladi, jadval esa o'z
    `overflow-x-auto` konteynerida (konsolda `[data-table]` buni allaqachon
    qiladi; qo'lda yozilgan 9 ta jadval tuzatildi).
  - **`h-screen` / `100vh` emas, `h-dvh`.** Mobil brauzer `vh` ni manzil paneli
    yig'ilgan holatda o'lchaydi — dok tugmasi birinchi skroll davomida panel
    ostida qoladi. `responsive-shell.test.ts` `className` ichida `vh` ni rad
    etadi.
  - **Yon panel `display: none` bo'lmaydi — tortmaga aylanadi.** Konsolda bu
    ilgari tuzatilgan edi, **platforma konsolida esa yo'q** (820px dan pastda
    `apps/admin` navigatsiyasi umuman yo'q edi), **sotuvchi panelida** esa
    246px yon panel 320px ekranda 74px joy qoldirardi. Uchalasi ham endi bitta
    xulq-atvordan o'qiydi: `packages/ui/src/console/nav-drawer.tsx`
    (`useNavDrawer` · `NavBackdrop` · `NavDrawer`). Sotuvchi paneli o'z
    `[data-mrail]` atributi bilan — u konsol stylesheet'ini import qiladi va
    `[data-nav]` 1200px dan pastda 76px ikonka reykasiga yig'iladi, uning
    qatorlari esa ikonkasiz so'zlar. `responsive-shell.test.ts` uchalasini ham
    tekshiradi.
  - **Qirquvchi qobiqda yuqori chiziq skroll qilmaydi — u shunchaki yo'q
    bo'ladi.** Uchala konsol ham `h-dvh overflow-hidden`: 320px da yuqori
    chiziqdagi filial tanlagichi, til qutisi va hisob menyusi ekran chetidan
    o'tib, umuman bosib bo'lmas edi. Yechim — balandlik: `[data-topbar]` 820px
    dan pastda ikkinchi qatorga o'tadi. Sotuvchi panelida esa u qo'shimcha
    ravishda **yopishishni to'xtatadi** — to'rt qatorli sarlavha telefon
    ekranining uchdan birini doimiy egallab turardi.
  - **`flex-1` yonida `min-h-0`, qatorlarda `flex-none`.** Ustun flex'da bola
    o'z kontentidan pastga qisqarmaydi; shuning uchun yon panel skroll
    qilish o'rniga 24 qatorni 40px dan **23px** ga siqib turgan edi.
  - **44px qayerda majburlanadi, qayerda yo'q.** Dizayn telefon uchun
    **chizmagan** yuzalarda (konsol, platforma, sotuvchi paneli, marketing
    sarlavhasi) platforma qoidasi ishlaydi — 44px. Dizayn telefonda chizgan
    yuzalarda (`(customer)`, `(telegram)`, `(guest)`, `(marketplace)`,
    xodimlar ilovasi) chizilgan o'lcham qoladi: u yerda fayl g'olib, va
    xodimlar ilovasida 44px dan kichik bitta ham boshqaruv yo'q edi.
  - **`data-press` endi ikki narsani olib yuradi.** Dizaynda u faqat bosish
    javobini bildiradi; bu repoda esa `pointer: coarse` ostida **44px minimal
    balandlik** ham beradi. Shuning uchun uni dizayn telefonda ataylab kichik
    chizgan boshqaruvga qo'shmang — masalan mijoz menyusidagi «+» tugmasi
    dizayn faylida 34×34 va `data-press="1"` bilan chizilgan; belgini qaytarish
    uni 34×44 qilib, kvadratni buzadi. Hozirgi holat to'g'ri: telefon
    yuzalarining birorta boshqaruvida `data-press` yo'q.
  - **`pointer: coarse` — kenglik emas.** Barmoq uchun ikki qoida shu so'rov
    ortida (`motion.css`, `tokens.css`): `[data-press]` uchun 44px minimal
    balandlik va maydonlar uchun 16px shrift. Ikkinchisi iOS Safari'ning
    fokusda kattalashtirishini to'xtatadi — `maximum-scale=1` esa hech qachon
    javob emas, u barmoq bilan kattalashtirishni hammadan tortib oladi.
  - **`sr-only` pozitsiyalangan ajdodsiz scroller'dan qochib chiqadi.** `/pricing`
    da taqqoslash jadvalining `sr-only` belgilari hujjatning o'ziga nisbatan
    joylashib, sahifani 274px kengaytirgan edi; konteynerga `relative`.
  - **Qulf: `apps/web/src/lib/responsive-shell.test.ts`** — uchala qobiqning
    tortmasi, `className` ichidagi `vh` va `auto-fit` treklarining `min()`
    poli. Har uchala tekshiruv ataylab buzib sinaldi va yiqildi.
- **Yordamchi fidelity tekshiruvlari:** `site-fidelity`, `guest-fidelity`,
  `pages-fidelity`, `more-fidelity` — dizayn fayllaridan olingan sanoqlar va
  raqamlar (to'qqiz rol, 12 imkoniyat, 10 savol, 5% oltin karta, 2–12 bo'lish)
  ular orqali qulflangan. `pages-fidelity` endi tarif **narxlarini** ham
  qulflaydi: u sanoqlarni tekshirib raqamlarni tekshirmagani uchun
  `/pricing` sahifasi tarifni yuz barobar arzon ko'rsatib turaverdi.
- **Kanonik modul:** `apps/api/Modules/Menu` — to'liq implementatsiya (model,
  migratsiya, factory, request, resource, controller, RBAC route, seeder, testlar).
  Qolgan 9 modul aynan shu shaklni takrorlaydi.
- **Pending (2026-08-24 da qayta baholandi):** ekranlarni API'ga ulash **tugadi**
  — pastdagi «uch toifa» ro'yxati yopilgan. Qolgani: 1-modulni chuqurlashtirish,
  fiskal modul integratsiyasi (P11: OFD drayveri va PLU), production secret
  manager, K8s overlay'lari

### Poydevor (tugallandi)

| Qism                | Nima                                                                | Qayerda                                     |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Auth                | register / login (email yoki telefon) / logout / me / context       | `app/Http/Controllers/AuthController.php`   |
| Multi-tenancy       | `BelongsToTenant` + `ResolveTenant` + middleware priority           | `bootstrap/app.php`                         |
| Filiallar           | `BelongsToBranch` + `ResolveBranch` + `X-Branch`; `null` = barchasi | `app/Models/Branch.php`                     |
| Til (uz/ru/en)      | `X-Locale` → user → `Accept-Language` → restoran → default          | `app/Support/Localization/`                 |
| Modul reyestri      | `GET /api/v1/modules`, restoran bo'yicha yoqish/o'chirish           | `app/Support/Modules/`                      |
| Audit               | `GET /api/v1/audit` — kim, nimani, qachon o'zgartirdi               | `app/Http/Controllers/AuditController.php`  |
| Hodisalar shinasi   | Tranzaksion outbox + relay + idempotentlik                          | `app/Support/Events/`                       |
| Core shartnomalar   | `MenuCatalog` — modullar bir-birini import qilmaydi                 | `app/Contracts/`                            |
| Arxitektura testlar | Modul chegaralari, `tenant_id`, hodisa nomlari — CI'da tekshiriladi | `tests/Architecture/`                       |
| Salomatlik          | `/api/health`, `/health/live`, `/health/ready` + `health:check`     | `app/Http/Controllers/HealthController.php` |
| O'rnatish           | `db:seed` → 11 hisob; `restaurant:create-owner` → real restoran     | `database/seeders/UserSeeder.php`           |

### POS rejasi (`docs/PLAN-POS-FIRST.md`)

| Bosqich | Nima                                                                                                                                                       | Holat                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **P1**  | Shartnoma qatlami: bitta xato konverti, idempotentlik, 13 holatli zinapoya, `business_date`, `branch_counters`, **RLS**, `TENANCY_REQUIRE_TENANT`, OpenAPI | ✅                                    |
| **P2**  | Terminal juftlash (8 belgi), qurilma tokeni, **kutish ekrani**, `PosDatabaseSeeder`                                                                        | ✅                                    |
| **P3**  | Kassada kim turibdi: xodim kartalari, PIN, smena                                                                                                           | ✅                                    |
| **P4**  | Savat: sakkiz belgili menyu, modifikator varag'i, `seat_no`, to'rt hisob                                                                                   | ✅                                    |
| **P5**  | Oshxonaga yuborish: `TicketWriter`, jonli KDS, `branch.{id}.kitchen` va `.orders`                                                                          | ✅                                    |
| **P6**  | Stop-list: filialga bog'langan 86 varag'i, `branch.{id}.stoplist`                                                                                          | ✅                                    |
| **P7**  | To'lov: tender, 1000 ga yaxlitlash, choypuli, ekvayring ulushi, qaytim                                                                                     | ✅                                    |
| **P8**  | Qog'oz va uskuna: `printers`, sex marshruti, chidamli navbat, 80 mm chek                                                                                   | ✅ (agent qolgan)                     |
| **P9**  | Tasdiqlar: summaga bog'langan imzo, foiz tanlagich, uzoqdan tasdiqlash                                                                                     | ✅                                    |
| **P10** | Kunni yopish: nominal sanoq, X va Z, farq zinapoyasi, smena qulfi                                                                                          | ✅                                    |
| **P11** | Fiskallashtirish: proba, navbat, 24 soatlik oyna, `NUSXA` dublikati                                                                                        | 🚧 haqiqiy OFD drayveri va PLU qolgan |
| **P12** | Oflayn: `sync/batch`, `sync/resolve`, `offline/bootstrap`, olti konflikt turi va o'n beshta javob                                                          | ✅ (lokal menyu do'koni qolgan)       |
| **P13** | Qarzga sotish: mijoz balansi, limit, `credit` tenderi, Z tushuntiruvchi qatori                                                                             | ✅                                    |

**Uchta hisob ma'lumoti, uchta cookie** — ataylab aralashtirilmaydi:

| Cookie                           | Nima deydi                         | Qancha yashaydi                     |
| -------------------------------- | ---------------------------------- | ----------------------------------- |
| `restaurant-campus-session`      | konsolga kirgan odam               | 8 soat                              |
| `restaurant-campus-terminal`     | **qaysi** kassa (qurilma tokeni)   | 1 yil                               |
| `restaurant-campus-shift`        | **kim** kassada turibdi            | 12 soat (server 15 daqiqada yopadi) |
| `restaurant-campus-crew-device`  | **qaysi** telefon (qurilma tokeni) | 1 yil                               |
| `restaurant-campus-crew-tenant`  | o'sha telefon qaysi restoranniki   | 1 yil                               |
| `restaurant-campus-crew-session` | **kim** telefonni ushlab turibdi   | 12 soat                             |

Oxirgi uchtasi xodimlar ilovasi uchun va kassanikidan ataylab alohida: bitta
odam ham kassada, ham o'z telefonida bo'lishi mumkin, va telefondan chiqish
kassadagi smenani yopmasligi kerak.

`/pos` uchta holatni cookie'lardan hal qiladi: token yo'q → juftlash paneli;
token bor, smena yo'q → kutish ekrani; ikkalasi ham bor → ish ekrani.

## To'qqiz rol (dizayn handoff §1.2–1.4)

Konsol dizayni **to'qqiz** ishchi rolni nomlaydi — bu jadval sakkiztasini
yozardi va to'qqizinchisi, **Operator**, umuman yo'q edi. Yagona manba —
[`apps/web/src/lib/roles.ts`](apps/web/src/lib/roles.ts): faqat id va tuzilma,
matn i18n katalogida (`console.roles`).

| Rol          | Server nomi      | Yon panel          | Ish maydoni       | Chegirma shifti |
| ------------ | ---------------- | ------------------ | ----------------- | --------------- |
| `super`      | `super-admin`    | yo'q → `/platform` | platforma konsoli | —               |
| `owner`      | `owner`          | 24 bo'lim          | konsol + POS      | 100%            |
| `manager`    | `branch-manager` | 21 bo'lim          | konsol + POS      | 20%             |
| `accountant` | `accountant`     | 10 bo'lim          | konsol            | 0%              |
| `waiter`     | `waiter`         | 2 bo'lim           | POS               | 0% (so'raydi)   |
| `cashier`    | `cashier`        | 3 bo'lim           | POS + kassa       | 5%              |
| `kitchen`    | `chef`           | 1 bo'lim (KDS)     | KDS               | —               |
| `warehouse`  | `storekeeper`    | 6 bo'lim           | konsol            | —               |
| `operator`   | `order-operator` | 7 bo'lim           | qabul navbati     | 5%              |

- **Operator — menejerning kichik nusxasi emas.** U stolga tegmaydi, to'lov
  olmaydi va smena yopmaydi; telefon, Telegram, sayt va uchta agregatorga
  javob beradi va javob tezligi bo'yicha o'lchanadi. Shuning uchun uning uy
  ekrani `/calls` — kutayotgan navbat, boshqaruv paneli emas.

- **Chegirma shifti — bitta manba, `Terminal.settings.discount_limits`.** Yuqoridagi
  ustun shuning nusxasi va u drift qildi: bu jadval menejerga 30% va kassirga 10%
  berardi, `apps/web/src/lib/roles.ts` menejerga 20% va ofitsiantga 5%,
  `TerminalFactory` esa yana uchinchi to'plamni. Ya'ni konsol chizadigan chipni
  server rad etardi va kassir tizimni buzuq deb o'ylardi. Hammasi
  `docs/PLAN-POS-FIRST.md` §P9 ga tekislandi: **ofitsiant 0 · kassir 5 ·
  menejer 20 · ega 100**. **2026-08-22 dan — haqiqat serverda:**
  `PUT /api/v1/roles/{role}` `discount_limit_percent` ni
  `App\Contracts\Pos\DiscountLimits` orqali `Terminal.settings.discount_limits`
  ga yozadi — `ApprovalGate` o'qiydigan o'sha joy. Bu jadval, `roles.ts`,
  `TerminalFactory`, `PosDatabaseSeeder` endi faqat **boshlang'ich** qiymat;
  restoran konsolda o'zgartirsa, to'rttasi ham eskiradi va bu to'g'ri.
- **Yon panel — ko'rinish, ruxsat emas.** Haqiqiy chegara ikki joyda:
  `apps/web/src/middleware.ts` (route qo'riqchisi) va serverdagi Spatie
  ruxsatlari. `DesignRoleMatrixTest` ikkalasining mos kelishini tekshiradi —
  ayniqsa **inkor** tomonini (ofitsiantda `pos.void` yo'q, buxgalterda
  `orders.*` umuman yo'q).
- **Rol ruxsati va marshrut qo'riqchisi — ikki alohida narsa.** Rolda ruxsat
  bo'lishi, marshrut uni so'rashini anglatmaydi. `ModuleRouteGuardTest` har bir
  `api/v1/*` marshrutini tekshiradi: yo ruxsat/rol middleware'i bor, yo
  hujjatlashtirilgan ro'yxatda sababi bilan yozilgan. `module:make` yaratgan
  marshrut avtomatik ravishda testni yiqitadi — 11-modulda aynan shu bo'lgan.
- **Sessiya — server tomonida.** Brauzer Laravel'ga emas, `POST /api/auth/session`
  (Next route handler) ga murojaat qiladi; u Node'dan `POST /api/v1/auth/login`
  ni chaqiradi va tokenni **httpOnly** cookie'ga yozadi. `lib/session.ts` shu
  token bilan `GET /api/v1/auth/context` ni o'qiydi — ism, filial va rol
  serverdan keladi (`session.live === true`). API javob bermasa fixture rejimiga
  qaytadi.
  - Nega Node orqali: server komponenti brauzerdagi tokenni ko'ra olmaydi, va
    brauzerdan Laravel'ga so'rov `SANCTUM_STATEFUL_DOMAINS` tufayli sessiyali
    hisoblanib **CSRF talab qiladi (419)**. Node'dan kelgan so'rovda Origin ham,
    cookie ham yo'q — oddiy token so'rovi.
  - Handler **ikkala** cookie'ni yozadi: token (httpOnly) va rol. Rol cookie'siz
    `middleware.ts` egani deb o'ylaydi va ofitsiantga hamma ekranni ochib
    yuboradi — shu xato bo'lgan, `route.test.ts` uni ushlaydi.
  - Konsolda ekrani yo'q rol (marketolog, oshpaz-cook) → `no_surface`, cookie
    yozilmaydi. `roleFromServer()` server nomini konsol roliga aylantiradi.
- **Demo almashtirgich** faqat `NEXT_PUBLIC_DEMO_ROLES=1` bo'lganda ko'rinadi
  (`apps/web/.env.local`). Production'da yo'q — u hech qachon avtorizatsiya emas.
- **Operator dashboardlari — `super-admin` roli bilan.** Horizon va Telescope
  Laravel yaratgan bo'sh email ro'yxati bilan kelgan edi (production'da hech
  kimga ochilmasdi). Ikkalasi ham endi `super-admin` rolini so'raydi; restoran
  rollari — egasi ham — o'tolmaydi. `OperatorDashboardGateTest` tekshiradi.
- **Kirish — bitta karta, uchta yorliq** (§3.12): pochta, PIN, platforma.
  `src/components/sign-in-panel.tsx` ikki joyda ishlatiladi — marketing sahifada
  namoyish sifatida, `/login`da `live` bilan. Faqat pochta eshigi haqiqiy
  (`POST /login` Sanctum'da bor); PIN va TOTP endpointlari hali yozilmagan,
  shuning uchun ikkala rejimda ham namoyish bo'lib qoladi. `/register` yo'q —
  restoran `#contact` orqali keladi, tenant'ni operator ochadi.
- **Platforma eshigi ulangan:** `POST /api/v1/admin/login` — pochta + parol +
  TOTP, faqat `super-admin` va faqat restoranga tegishli bo'lmagan hisob;
  token 30 daqiqada tugaydi, eski tokenlar o'chiriladi, kirish audit jurnaliga
  yoziladi. Bir kod **ikkinchi marta ishlamaydi** (`two_factor_last_window`).
  Demo kalit: `JBSWY3DPEHPK3PXP` (UserSeeder, faqat local).
- **PIN yadroda, kassada emas: `App\Support\Auth\PinCredentials` +
  `public.user_pins`.** Ilgari `pos.pins` edi. Ko'chirishning sababi qulaylik
  emas, **qulflanish**: xodimlar ilovasi ham o'sha odamdan o'sha to'rt raqamni
  so'raydi, ikkita hisoblagich esa to'rt raqamli sir uchun beshta emas, o'nta
  urinish degani — telefon esa o'g'irlanishi mumkin bo'lgan yuza.
  `config('auth.pin.*')` — yagona manba; `pos.pin` da faqat
  `session_idle_minutes` qoldi.
- **Xodimlar ilovasiga kirish — ikkita hisob ma'lumoti, shu tartibda.**
  Qurilma tokeni _qaysi telefon_ ekanini aytadi (menejer sakkiz belgili kod
  o'qiydi, `POST /api/v1/staff/devices/pair`), PIN esa _uni kim ushlab
  turganini_ (`POST /api/v1/staff/auth/pin`). Tartib muhim: telefon odamni
  aniqlaydi, shuning uchun PIN bitta ma'lum odamni tasdiqlaydi.
  - **Nega filialga emas, odamga biriktiriladi.** Filialga biriktirsak, server
    PIN'dan odamni topishi kerak: har urinishda o'sha filialning 10–30 xodimiga
    qarshi bcrypt — sekin va bepul DoS. Bundan yomoni: to'rt raqamli maydonda
    30 ta PIN yashasa, taxminan har uch yuz urinishdan bittasi **kimgadir**
    tushadi va har safar boshqa hisob bo'lgani uchun qulflanish hech qachon
    ishlamaydi.
  - **`staff.devices` RLS'dan ozod** — `public.users` va `pos.terminals` kabi.
    Sanctum qurilma qatorini tenant aniqlanishidan **oldin** o'qiydi; siyosat
    uni yashirsa, har bir telefon 403 oladi. `RowLevelSecurityTest` uchala
    istisnoni ham nomma-nom biladi.
  - **`auth/pin` `tenant` guruhi ichida.** Ko'rinishidan kerak emas —
    qurilmada foydalanuvchi yo'q — lekin ikki sababdan shart: `ResolveTenant`
    juftlashdan qaytgan `X-Tenant` slugini o'qiydi, va `public.user_pins`
    RLS ortida, ya'ni tenant'siz siyosat **nol qator** qaytaradi va har bir
    to'g'ri PIN "noto'g'ri" bo'lib chiqadi.
- **SEO va PWA poydevori — ommaviy yuzalar uchun.** Bu platforma ochiq
  internetdan topilishi kerak, shuning uchun quyidagilar kod emas, mahsulot
  talabi:
  - **`<html lang>` endi o'quvchiniki.** Ilgari `"uz"` qat'iy yozilgan edi —
    ruscha sahifa o'zini o'zbek deb e'lon qilardi, ekran o'quvchi esa ruschani
    o'zbek fonetikasi bilan o'qirdi. Til `middleware.ts` da hal qilinadi
    (`DOC_LANG_HEADER`), chunki `?lang=ru` `searchParams` da yashaydi va root
    layout'da `searchParams` yo'q.
  - **JSON-LD: `(site)/venue-schema.ts` va `(marketing)/marketing-schema.ts`.**
    Restoran uchun `@graph` — har filial alohida `Restaurant`, chunki soat,
    telefon va manzil filialga qarab boshqacha; bittaga o'rtacha hisoblash
    beshtasi haqida ham xato bo'lardi. Menyuda har taomda narx — «Osh Xona da
    osh qancha» degan savolga natijaning o'zi javob beradi. Marketingda
    `FAQPage` — natijadagi ochiladigan savol-javob bloki.
  - **`asScriptJson()`, hech qachon `JSON.stringify()` emas.** Restoran nomi
    API'dan keladi va `<script>` ichiga tushadi; `</script>` — JSON uchun oddiy
    olti belgi, HTML parseri uchun blokning oxiri. Bu saqlangan XSS bo'lardi.
  - **`faqPageFrom()` sof funksiya.** Birinchi variant katalogni to'g'ridan
    o'qirdi va testi yiqila olmasdi — bugun `FAQ` ro'yxati va katalog bir xil.
    Yiqila olmaydigan test — test emas. Endi tartib parametr, va katalogda
    ortiqcha kalit bo'lsa belgilash uni tashlab ketishi tekshiriladi. Google buni
    «sahifada yo'q javobni belgilash» deb jarima soladi.
  - **Service worker ataylab tor: `public/sw.js`.** Hech qanday HTML
    saqlanmaydi va `/api/` umuman ushlanmaydi — kesh qatlami bir kassaning
    hujjatini keyingi odamga qaytarishi mumkin. Saqlanadigan yagona sahifa —
    `/offline`, chunki unda hech narsa yo'q. Nega umuman bor: Chrome manifest
    yolg'iz turganda o'rnatish taklifini **ko'rsatmaydi**, ya'ni ilova
    «o'rnatiladi» deb da'vo qilib, o'rnatilmasdi.
  - **Har yuzaning o'z manifesti.** Platformaniki `/dashboard` dan boshlanadi —
    restoran saytidan o'rnatgan mehmon xodimlar konsolini ochardi. Endi
    `/r/{slug}/manifest.webmanifest` restoran nomi bilan, `/manifest-customer.json`
    esa mijoz ilovasi uchun.
  - **Sayt uchun sitemap `/r/{slug}/sitemap.xml` da, platformanikida emas.**
    Tenant bo'yicha ro'yxatlash — butun mijozlar ro'yxatini doimiy URL'da chop
    etish; slug'ni bilgan odam esa faqat o'zinikini oladi.
- **07 · Restoran sayti qurildi: `(site)/r/[restaurant]`.** Repodagi yagona
  **indekslanadigan** yuza — qolganini `robots.ts` yopadi, chunki ular kimningdir
  sessiyasi yoki bitta stolning sahifasi. Bu esa restoranning vitrinasi.
  - **Matn allaqachon bor edi.** `guest-copy.ts` dagi `site.*` daraxti — 121
    kalit, o'nta bo'lim — yozilgan-u, ishlatilmagan turardi. Ikkinchi katalog
    yaratmadim: `locale-bridge.ts` orqali qayta eksport, chunki bir xil gaplar
    ikki faylda birinchi tuzatishdayoq ajraladi.
  - **«Stol bandlash» tugmasi haqiqiy ish qiladi.** Buning uchun
    `POST /api/v1/public/reservations` yozildi — platformadagi begona odam
    yozadigan **ikkinchi** narsa. Uchta kamar: har bron `pending` bo'lib tushadi
    va hech qanday stolni ushlab turmaydi; mehmon stol, holat va manbani
    tanlay olmaydi; bitta raqamga kuniga bitta tirik bron. To'rtinchisi —
    daqiqasiga beshta.
  - **Saytda sitemap yo'q va bu qaror.** `/r/{restaurant}` tenant bo'yicha
    o'zgaradi, ya'ni uni ro'yxatlash — platformaning butun mijozlar ro'yxatini
    doimiy URL'da chop etish. Restoran o'z domeni va o'z havolalari orqali
    topiladi.
  - **`whereDate()` taqiqlangan.** `ModuleBoundaryTest` uni nom bilan rad etadi:
    u ustunni funksiyaga o'raydi va indeksni o'ldiradi — ochiq endpointda bu
    boshqa odam buyurtma qilgan ketma-ket skan. Lekin `BusinessDay` ham to'g'ri
    javob emas: u **zalning** soatida hisoblaydi, `starts_at` esa ilova soatida
    saqlanadi, va besh soatlik farqda 19:00 dagi bron oynaning chetiga tushib,
    dublikat tekshiruvi umuman ishlamay qoldi. Diary uchun to'g'ri asos —
    qiymatning o'z kuni, o'z ramkasida.
- **Xodimlar ilovasining ikkita ekrani jonli: `crew-server.ts`.** Ofitsiantning
  stollari (`GET tables/tables` + `orders/orders?filter[waiter]&filter[open]`
  qo'shilmasi) va menejerning tasdiq navbati (`GET pos/approvals`). Qolgani
  hali fixture va buni **ekranda aytadi** (`live: false` → «Namunaviy stollar»).
  - **Jami va vaqt stolda emas, ochiq buyurtmada.** Konsolning o'z
    `tables-server.ts` fayli aynan shu TODO'ni qoldirgan; ofitsiant ekrani esa
    busiz ishlay olmaydi — «qaysi stolim nimadir so'rayapti» degan savolga
    mebel emas, hisob javob beradi.
  - **`zone` uchta qat'iy so'z emas.** `ZAL / VIP / KABINA` — dizayn chizilgan
    joyning eshiklaridagi yozuv; jonli zalda esa hall id va restoranning o'z
    nomi keladi. Qat'iy union chiroyli kompilyatsiya qilinardi va har to'rtinchi
    zalni jimgina yo'qotardi.
  - **Mapping sof funksiyada: `floorFrom()` va `queueFrom()`.** Fetch —
    quvur, mapping esa xato bo'lsa hech kim sezmaydigan qism: boshqa
    ofitsiantning jamlari, yoki chegirma deb tasdiqlangan qaytarish. Soat
    parametr, shuning uchun testlar «taxminan» emas, aniq daqiqani tekshiradi.
- **Taom rasmi — bitta quvur, uch o'lcham, hech narsa kelgan holida saqlanmaydi
  (2026-08-23).** `App\Support\Media\ImagePipeline` har yuklangan faylni
  o'qiydi, EXIF bo'yicha to'g'rilaydi, `thumb` 160 · `card` 640 · `full` 1600
  ga kichraytiradi (hech qachon kattalashtirmaydi), WebP qilib, 16px xira
  placeholder yasaydi. `MediaStore` kalitlari
  `dish/{xx}/{yy}/{tenant}/{dish}/{hash}-{size}.webp` — ikki shard darajasi
  (65 536 chelak) va kontent xeshi: manzil hech qachon ma'nosini
  o'zgartirmaydi, shuning uchun nginx/CDN/telefon bir yil `immutable` saqlaydi.
  - **Qatorda manzil yo'q, faqat fakt.** `menu.menu_items.image` (jsonb):
    hash, o'lchamlar, renditions, placeholder. URL o'qish vaqtida diskdan
    quriladi (`ImageSet::fromRecord`) — lokal disk → MinIO → CDN ko'chishi
    config, `UPDATE` emas. `image_url` qoladi: bitta manzil istaganlar uchun
    va qo'lda kiritilgan tashqi URL uchun.
  - **Har o'quvchi to'plamni oladi.** `MenuItemResource`, `Dish` shartnomasi
    (kassa, Telegram bot, oflayn bundle), marketplace vitrinasi — hammasida
    `image: {src, width, height, placeholder, sizes}`. Frontend'da yagona
    tarjimon `@restaurant/surfaces/media/image`: web `srcset` quradi, telefon
    `pick(image, cssWidth, density)` bilan o'lcham tanlaydi. Yuzada rasm
    chizish — `apps/web/src/components/dish-photo.tsx` orqali, har yuza o'z
    `fallback`ini beradi (`.site-shot`, `.c-shot`, `.tg-shot`, kassada
    dizaynning monogrammasi).
  - **Disk `public`, nginx diskdan beradi.** `MENU_IMAGE_DISK` standarti
    `public` (FILESYSTEM_DISK emas — u private). `/storage/dish/` nginx'da
    `try_files` + bir yillik kesh; ilgari har rasm php-fpm orqali `no-store`
    bilan kelardi. `srcp-apply` snippet'ni o'rnatadi; www-data `srcp`
    guruhida, shuning uchun `g=rX` yetadi.
  - **Konsolda kesish/burish:** `(dashboard)/menu/photo-cropper.tsx` — har
    yangi rasm avval shu oynadan o'tadi (standart shakl «Asl» = hech narsa
    kesilmaydi), mavjud rasm `full` rendition'dan qayta kesiladi. Geometriya
    `crop-math.ts` da (sof, testli); preview ham, eksport ham o'sha
    `cropRect` dan o'qiydi — ikki model yo'q. `react-hooks/set-state-in-effect`
    qoidasi sababli zoom _nisbat_ sifatida saqlanadi (`floor × zoom`), shunda
    ramka o'zgarganda effect'da sinxronlash kerak emas.
  - **Rad etish 422 va kod bilan:** `menu.image_unreadable` ·
    `image_unsupported_format` · `image_too_many_pixels` · `image_missing`.
    Chegara 12 MB va 25 megapiksel (xotirani piksel chegaralaydi: dekodlangan
    rasm har pikselga 4 bayt). Konsol yuklashdan oldin brauzerda 2000px ga
    kichraytiradi (`lib/shrink-photo.ts`) — bu yuklash tezligi uchun, server
    baribir o'zi o'lchaydi. Soft-delete rasmni saqlaydi, `forceDeleted`
    o'chiradi.
- **Pul arifmetikasi brauzerda bir joyda: `apps/web/src/lib/pricing.ts`.** U
  `App\Support\Orders\BillTotals::of()` ning aynan nusxasi va mehmon/mijoz
  yuzalarining to'rttala ekrani undan o'qiydi. Nusxa kerak, chunki mehmonga
  jamini aytadigan endpoint yo'q — `GET /api/v1/public/menu` dan boshqasi
  nashr qilinmagan. **`pricing.test.ts` dagi kutilgan raqamlar PHP'ning o'zidan
  olingan**, qo'lda hisoblanmagan: shuning uchun ikkalasi ajralsa test yiqiladi.
  Qoida: bu faylni o'zgartirsangiz, PHP'ni ishga tushirib raqamlarni qayta
  oling — «ikkalasi amalda mos keladi» degan taxmin aynan drift boshlanadigan
  joy. Telefon bitta raqamni, chek boshqasini ko'rsatsa — kassir aybdor bo'ladi.
- **Shartnoma va implementatsiya birga ko'chadi.** `App\Contracts\*` ga metod
  qo'shib, implementatsiyalarni keyinroq yozish PHP'da butun repo'ni yiqitadi:
  interfeysini bajarmaydigan klass yuklanmaydi. Bu seansda ikki marta kerak
  bo'ldi — `TillLedger::amendClosedShift()` (ikkita implementatsiya) va
  `BillRegistry::addLine($servedBeforeStop)` (ikkita). Ikkalasi ham bitta
  o'zgarishda yozildi.
- **Oflayn navbat — planshetda, server unutadi.** Ziddiyatli yozuv serverda
  saqlanmaydi: `IdempotencyGuard::run()` ish yiqilganda o'z qatorini o'chiradi.
  Shuning uchun `POST sync/resolve` yozuvni **mijozdan** oladi. Bu ishonch
  muammosi emas — o'sha `local_id` o'sha qo'riqchiga boradi, ya'ni uzilgan
  ulanishdan keyin qayta yuborilgan javob ikkinchi marta yozmaydi.
  - **Ikkita kalitni planshet hech qachon o'zi qo'ya olmaydi:**
    `served_before_stop` va `merged_into_bill_id`. Ikkalasi ham
    `SyncBatchRequest::DEVICE_MAY_NOT_SET` da va ikkala yo'lda ham kesib
    tashlanadi. Birinchisi stop-listni chetlab o'tish yo'li bo'lardi.
  - **Javob berishda ziddiyat qayta tekshirilmaydi.** `apply()` hech qachon
    tekshirmagan, `resolve` esa `conflictsFor()` ni chaqirmaydi — shuning uchun
    «stop-listdagi taomni qoldirish» o'tadi, aks holda u abadiy qaytarilardi.
    Qayta tekshirish yana bir sababdan xato: savol bilan javob orasida dunyo
    yana o'zgarishi mumkin, va kassir **boshqa** savolga javob bergan bo'lardi.
- **API'ga ulangan ekranlar: `menu`, `orders`, `tables`, `inventory`, `kitchen`,
  `finance/till`, `staff/shifts`.**
  `lib/api-server.ts` sessiya cookie'sidan token oladi va `apiGet<T>()`
  qaytaradi; xato, 401 yoki sessiya yo'qligida `null` — ekran fixture'ga
  qaytadi va API o'chganda ham ishlashda davom etadi. `translate()` jsonb
  `{uz,ru,en}` ustunini o'qiydi.
  - **Diqqat:** `tables-data.ts` ni POS terminali (client komponent) import
    qiladi, `api-server.ts` esa `next/headers` ishlatadi. Shuning uchun tikuv
    alohida `tables-server.ts`da. **Qoida:** tip va fixture — `*-data.ts`da,
    serverga murojaat — faqat server komponentlari import qiladigan qo'shni
    `*-server.ts`da. 2026-08-16 dan boshlab bu bo'linish yettala jonli
    ekranda ham bajarilgan — endi istalgan `*-data.ts`ni client komponent
    bemalol import qila oladi.
- **KDS chiptalari `KitchenTicketSeeder` bilan yaratiladi** — mavjud
  buyurtmalardan, sex bo'yicha guruhlab (bitta buyurtma → har bir sexga bitta
  chipta). `DatabaseSeeder`da **eng oxirida** turadi, chunki u
  `OrdersDatabaseSeeder` yozgan narsani o'qiydi; `KitchenDatabaseSeeder` esa
  faqat besh sexni yaratadi va oldinda qoladi.
- **To'lov va xarajatlar `FinancePaymentSeeder` bilan** — yopilgan
  buyurtmalardan hosil qilinadi, shuning uchun kassadagi pul cheklardagi pulga
  teng. To'lov usuli qat'iy tsikl bo'yicha taqsimlanadi (tasodifiy emas):
  bir xil seed → bir xil baza. **Faqat naqd kassani qimirlatadi** — karta
  tushum, lekin quti orqali o'tmaydi; uni harakatlar ro'yxatiga qo'shish
  kutilgan summani aynan karta jamiga xato qilardi.
- **Rota `StaffShiftSeeder` bilan** — bugundan uch kun oldin va uch kun keyin.
  O'tmish — davomat, kelajak — reja; kelmagan smenaga davomat yozilmaydi.
  Har bir lavozimning o'z vaqti bor (barmen 14–00, omborchi 07–15), chunki
  hammani 09–18 ga tiqish hech bir restoranda bo'lmagan jadval chizadi.
- **Ombor daftari `StockMovementSeeder` bilan** — har bir ingredientning
  hozirgi qoldig'idan **orqaga** hisoblanadi, so'ng vaqt tartibida oldinga
  o'ynatiladi. Ikki qoida: `balance_after` **soat bo'yicha** boradi (kod
  tartibi bo'yicha emas — birinchi variantda chiqindi keyingi kungi sarfdan
  keyin qo'llanib, daftar qayta o'ynatilganda boshqa javob berardi), va
  **javon daftarga ergashadi** — kelishmovchilikda daftar haq.
  `PurchaseOrderSeeder` — to'rt holat (qoralama, yuborilgan, tasdiqlangan,
  qabul qilingan); ariza jamisi qatorlar yig'indisiga teng.
- **Menyu matritsasi — Kasavana–Smith usuli.** Yulduz / ot / topishmoq / it:
  o'rtachadan ko'p sotilgan — ommabop, o'rtachadan yuqori marja — foydali.
  Buni hisoblash mumkin, chunki bu **e'lon qilingan usul**, mijoz segmenti kabi
  biznes egallaydigan tasnif emas: qoida kodda yozilgan va oshpaz rozi
  bo'lmasa nima sabab bo'lganini ko'radi. Analitika hisobotlari sahifalanmagan
  — har biri o'z shaklidagi hisobot, shuning uchun `Paginated<T>` emas, alohida
  tiplangan (`analytics-server.ts`).
- **Hisoblanadigan ustunlar saqlanmaydi.** Yetkazib beruvchining sarfi, ochiq
  arizalari va o'z vaqtida yetkazish foizi xarid arizalaridan chiqadi; xodimning
  bugungi smenasi, ish soati va savdosi smena, davomat va buyurtmalardan.
  Saqlangan foiz — o'zi umumlashtirgan arizalardan ajralib ketadigan foiz, va
  buni birinchi bo'lib «kechikdingiz» deb aytilgan yetkazib beruvchi sezadi.
  Yetkazib beruvchida bazaga faqat **ikkita** ustun qo'shildi: `category` va
  `lead_time_days` — bularni hech qanday arizadan chiqarib bo'lmaydi.
- **`clockedIn` — davomatdan, bandlik holatidan emas.** `status = active`
  «shu yerda ishlaydi» degani, «hozir shu yerda» degani emas; ikkinchisi deb
  o'qish tunda soat 3 da butun shtatni oshxonada ko'rsatardi.
- **«Hali fixture» ro'yxati yopildi (2026-08-24 da tekshirildi)** — to'rttala
  toifa ham allaqachon qilingan, ro'yxat esa eskirgan holda turgan edi:
  `crm/feedbacks` va `tables/reservations` `crm-server.ts`/`tables-server.ts`
  orqali o'qiladi; `PurchaseOrderSeeder` va `StockMovementSeeder` yozilgan va
  `DatabaseSeeder` da, ekranlari jonli; `crm.customers` `segment` +
  `last_visit_at` ustunlarini oldi (`a_regular_is_a_pattern_not_a_row`
  migratsiyasi, `crm:segment` tunda yozadi); `analytics` ning o'z
  `analytics-server.ts` i va testlari bor. Saboq: bu faylning holat bo'limi
  bajarilgan ish bilan birga yangilanmasa, keyingi seans ishni qayta
  «rejalashtiradi» — ro'yxatni yopganda sanasi bilan yoping.

## Hujjatlar (Documents in this directory)

| File                             | Purpose                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `docs/RESTAURANT_30_MODULLAR.md` | To'liq spetsifikatsiya — 30 modul, arxitektura, texnologiyalar, roadmap |
| `docs/modules/`                  | Har bir modulning batafsil hujjati                                      |
| `docs/decisions/`                | ADR — qabul qilingan arxitektura qarorlari                              |
| `docs/design/README.md`          | Dizayn handoff — token shartnomasi, brif, Tailwind v4 tuzoqlari         |
| `CLAUDE.md`                      | This file — live working context                                        |

## Phase 1 — 10 modul

| #   | Modul         | Alias       | Maqsad                                                    |
| --- | ------------- | ----------- | --------------------------------------------------------- |
| 1   | **Menu**      | `menu`      | Menyu, taomlar, narxlar, modifikatorlar, stop-list        |
| 2   | **Orders**    | `orders`    | Buyurtmalar: zal, olib ketish, yetkazib berish, agregator |
| 3   | **Kitchen**   | `kitchen`   | Oshxona displey tizimi (KDS), sexlar, tayyorlash vaqti    |
| 4   | **Tables**    | `tables`    | Zallar, stollar, bronlar, QR-menyu                        |
| 5   | **Inventory** | `inventory` | Ombor, ingredientlar, texnologik kartalar, chiqim         |
| 6   | **Suppliers** | `suppliers` | Yetkazib beruvchilar, xarid arizalari, kirim              |
| 7   | **Staff**     | `staff`     | Xodimlar, smenalar, davomat (Face ID/QR), ish haqi        |
| 8   | **Finance**   | `finance`   | Kassa smenasi, to'lovlar, fiskal cheklar, xarajatlar      |
| 9   | **CRM**       | `crm`       | Mijozlar, sodiqlik, aksiyalar, fikr-mulohaza              |
| 10  | **Analytics** | `analytics` | Sotuv, food-cost, ABC tahlil, KPI dashboard               |

Qo'shimcha: **TelegramBots** — 50 botli infratuzilma (gateway modul).

**Pos** — 12-modul: kassa terminali. Ingichka modul — hisob `Orders`da, pul
`Finance`da qoladi; POS ularni `App\Contracts\Orders\BillRegistry` va
`App\Contracts\Finance\TillLedger` orqali chaqiradi. To'rt rejim
(restoran / fast food / bar / kafe), 8 rol uchun ish maydoni, offline sotuv.
Batafsil: [`docs/modules/12-pos.md`](docs/modules/12-pos.md).

> **Interfeys `apps/web` ichida.** Kassa ilgari alohida ilova edi (`apps/pos`,
> 3002). U olib tashlandi: modul — konsolning bir bo'limi, alohida ilova emas.
> Backend `Modules/Pos` o'z joyida — schema, shartnomalar va testlar tegilmagan.

To'liq 30 modullik vizion: [`docs/RESTAURANT_30_MODULLAR.md`](docs/RESTAURANT_30_MODULLAR.md).

## Tamoyillar (Principles — set by user)

1. **Super ultra pro darajada** — production-grade from day one. No toy/MVP code
   that needs rewriting.
2. **Bosqichma-bosqich** — step-by-step. User confirms direction before major
   builds. Don't preemptively scaffold modules they didn't ask for.
3. **Multi-tenant, multi-branch, multi-lingual from start** — uz / ru / en at
   minimum. Bitta tenant = bitta restoran biznesi; filiallar tenant ichida.
4. **Kengaytiriladigan** — Phase 1 arxitekturasi qolgan 20 modulni qayta
   yozishsiz qabul qilishi kerak.
5. **Foydalanuvchi bilan o'zbek tilida** — respond to the user in Uzbek.
   Code/identifiers stay in English.

## Til (Communication)

- **Chat & docs prose:** Uzbek (Latin script)
- **Code, file names, identifiers, comments:** English
- **DB columns, API fields:** English (snake_case)
- **Foydalanuvchiga ko'rinadigan kontent** (taom nomi, kategoriya): jsonb
  `{uz, ru, en}` — `App\Models\Concerns\HasTranslations` orqali

## Tech stack (CONFIRMED)

| Layer             | Choice                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**       | PHP 8.3+ / Laravel 13 (modular monolith, `nwidart/laravel-modules`) / Eloquent                                                   |
| **Auth**          | Laravel Sanctum + Keycloak (SSO, later)                                                                                          |
| **Frontend**      | Next.js 16 (App Router) + React 19 + TypeScript 5 / Tailwind v4 / shadcn/ui                                                      |
| **Dizayn tizimi** | `packages/ui` — 26 primitiv, uchala ilova uchun yagona. Tokenlar: `packages/ui/src/styles/tokens.css`. Jonli galereya: `/design` |
| **Realtime**      | Laravel Reverb — KDS, zal xaritasi, kassa                                                                                        |
| **Mobile**        | React Native 0.87 + Expo SDK 57 + expo-router — `apps/mobile`, to'rt yuza bitta ilovada                                          |
| **AI/ML**         | Python 3.13+ / FastAPI / uv                                                                                                      |
| **Bots**          | Python / aiogram 3 — bitta dispatcher, 50 bot                                                                                    |
| **Database**      | PostgreSQL 16 (primary), Redis 7 (cache/queue), ClickHouse (analytics), MinIO (objects)                                          |
| **Monorepo**      | pnpm workspaces + Composer + Turborepo                                                                                           |
| **Containers**    | Docker + Compose (dev), Kubernetes (prod, later)                                                                                 |
| **Code hosting**  | GitHub + GitHub Actions                                                                                                          |
| **i18n**          | next-intl, languages: uz / ru / en                                                                                               |

❌ Rejected: Prisma (JS-only), Better Auth (JS-only) — incompatible with Laravel.

## Mobil ilova — `apps/mobile`

Native qobiq **qo'shildi** (ilgari bu papka bo'sh edi va README «bu qaror» derdi).
PWA yuzalari o'z joyida qoldi — qobiq ularni almashtirmaydi, `Sayt va PWA`
dizayn faylidagi oltita qatordan beshtasida PWA hamon yutadi. Qobiq qo'shgan
narsa — o'sha oltinchi qator: iOS 16.4 dan pastdagi push, do'konda ko'rinish
(MyPOS iste'molchi mahsuloti), va qurilmaga kirish — stol QR kodini brauzerga
chiqmasdan o'qiydigan kamera.

- **To'rt yuza bitta ilovada:** `(customer)` · `(marketplace)` · `(staff)` ·
  `(guest)`. `app/index.tsx` qaysisini so'raydi — dizaynda bunday ekran yo'q,
  bu bitta binarning narxi (web'da to'rtta manifest bepul edi).
- **Telegram bu yerda yo'q:** mini ilova Telegram'ning o'z WebView'ida ishlaydi,
  native nusxasi odamda allaqachon ochiq narsani takrorlagan bo'lardi. Konsol,
  kassa va KDS ham yo'q — ular planshet va desktop mahsuloti.
- **Marshrutlar web bilan segment-ma-segment bir xil.** `srcp://mp/track`
  push'dan brauzerdagi `/mp/track` tushadigan ekranga tushadi. Ikkala daraxt
  o'xshashligining yagona sababi shu.
- **Dizaynga 1:1 keltirildi (2026-08-23).** Egasi «umuman o'xshamaydi» dedi va
  haq edi. To'rtala yuza dizayn fayllariga qarshi audit qilindi — **540 farq**
  topildi va yopildi (29 agent, uch to'lqin; qolgani qo'lda). Uch poydevor
  nuqsoni hammasini bir vaqtda buzayotgan edi:
  1. **Shrift umuman yuklanmagan.** `family.display`/`family.sans` `undefined`
     edi — ilova tizim shrifti bilan chizardi, dizayn esa Inter + Inter Tight.
     Endi yettala TTF `assets/fonts/` da, `expo-font` bilan birinchi kadrdan
     oldin yuklanadi. **`fontWeight` endi taqiqlangan:** Android runtime'da
     ro'yxatdan o'tgan oilaga qo'shilgan og'irlikni e'tiborsiz qoldiradi, shuning
     uchun og'irlik = oila (`sans(600)`, `display(800)`). 198 joy ko'chirildi,
     `fonts.test.ts` qaytishiga yo'l qo'ymaydi.
  2. **Raqamlar `monospace` bilan chizilardi.** `text.num` oilani almashtirardi;
     dizayn esa `[data-num]{font-variant-numeric:tabular-nums}` deydi — o'sha
     Inter'ning tabular raqamlari. 186 joy: har narx, har vaqt, har sanoq.
  3. **Qorong'i palitra konsolniki edi.** `tokens.css` ning `[data-theme=dark]`
     bloki — desktop konsolining bloki; telefon dizayn fayllari boshqasini
     aytadi (`--bg:#0B0E16` va h.k.). Generator endi **telefon fayllaridan**
     o'qiydi va MyPOS uchun alohida palitra chiqaradi (`mp-theme.ts`) — u
     boshqa mahsulot: kulrang `page`, o'z `ok/warn/bad` tonlari, qorong'ida
     yorug'roq brend.
     Yana: soyalar umuman yo'q edi (RN 0.76+ `boxShadow` CSS satrini oladi),
     `hairlineWidth` @3x da chizilgan chiziqning uchdan biri — hammasi `1`,
     bosish esa so'nish emas, dizaynning `scale(.97)` i. Ikkalasini
     `design-metrics.test.ts` mexanik ushlaydi.
- **`src/theme.ts` va `src/mp-theme.ts` generatsiya qilinadi** (`pnpm theme`) —
  yorug' palitra `packages/ui/src/styles/tokens.css` dan, **qorong'isi telefon
  dizayn fayllaridan**. Qo'lda tahrirlanmaydi va `theme.test.ts` xotiraga qayta
  generatsiya qilib solishtiradi. Bu testni yozganda darhol haqiqiy xato
  topildi: generator `@custom-variant` qatoridagi `[data-theme='dark']`
  substringiga tushib, **qorong'i palitra o'rniga yorug'ini** o'qigan edi — 87
  rangning hammasi bir xil chiqardi va hech qayerda xato bermasdi.
- **Hisob ma'lumotlari `expo-secure-store` da**, `AsyncStorage` da emas:
  Keychain va Keystore. Telefon — o'g'irlanadigan qurilma, va web'dagi httpOnly
  cookie'ning bu yerda ekvivalenti yo'q.
- **API mijozi xato tashlaydi.** `apps/web` `null` qaytarib fixture'ga qaytadi —
  server render uchun to'g'ri. Telefonni ushlab turgan odamga esa «restoranga
  ulanib bo'lmadi, qayta urining» degan halol javob qarzdormiz.
- **`packages/ui` hech qachon import qilinmaydi** — u DOM va Tailwind.
  `src/ui/primitives.tsx` — native to'plam, ataylab kichik.
- **Native bog'liqlik versiyasi — `expo/bundledNativeModules.json` dan, `npm view`
  dan emas.** Birinchi urinishda RN 0.87.0 (eng yangisi) olingan edi; Expo 57
  esa 0.86.2 ustiga qurilgan. `tsc` toza o'tdi, Metro esa umuman ishga
  tushmadi — `@expo/metro-config` RN paketidan `rn-get-polyfills` ni so'raydi va
  u ko'chgan. `expo-versions.test.ts` endi Expo'ning o'z ro'yxati bilan
  solishtiradi, `pnpm build` esa `expo export` (Android + iOS Hermes bundle) —
  chunki bu xatoni faqat bundle ko'radi.
- **APK saytning o'zidan tarqatiladi: `/download`, `srcp-apk`.** Do'kon emas —
  restoran egasi onboarding qo'ng'irog'ida o'rnatib oladi. Asbob JDK 17 va
  Android SDK'ni `~/.srcp-android/` da kutadi (root emas, `/opt` emas); kalit
  `release.keystore` + `signing.env` o'sha yerda va **qayta yaratib bo'lmaydi** —
  Android ilovani paket + kalit bo'yicha taniydi, boshqa kalitli yangilanish rad
  etiladi. Birinchi APK sakkizinchi urinishda chiqdi: OOM ×5 (har RN C++ fayli
  ~700 MB, JVM 1 GB, 8 GB quti), `babel-preset-expo` pnpm izolyatsiyasida
  ko'rinmasdi. Shuning uchun: **6 GB swap** (`/swapfile2`, `fstab` da `pri=-3` bilan —
  qayta yuklashda ham qoladi), ninja `-j1`, `srcp-apk` 5 GB zaxirasiz
  boshlamaydi. iOS fayli yo'q va bo'lmaydi (Apple saytdan o'rnatishga ruxsat
  bermaydi) — App Store nishoni iPhone PWA yo'riqnomasiga olib boradi.
  **Ikkinchi APK (2026-08-22, `335713`) uch urinishda chiqdi** va har biri
  asbobni o'zgartirdi: ilova 4–5-to'lqinlardan keyin kattalashgach D8 1 GB
  heap'da, keyin Kotlin daemon'i 512 MB da yiqildi — endi **bitta 3 GB JVM,
  Kotlin in-process** (`plugins/with-release-signing.js`); uchinchi marta
  qurilish to'liq o'tib, oxirgi qatorda `build-tools/*/apksigner` glob'i ikki
  versiyaga kengaygani uchun yiqildi — endi `sort -V` bilan eng yangisi,
  versiya manifestga `aapt2` orqali APK'ning o'zidan o'qiladi, va
  `srcp-apk --publish-only` qurilgan APK'ni 40 daqiqa kutmasdan nashr qiladi.
  Imtiyozli nusxalash alohida `srcp-apk-publish` (root, `SRCP_TOOLS` da,
  parolsiz) — terminal yo'q sessiya ham nashr qila oladi. versionCode —
  2026-01-01 dan beri o'tgan daqiqa, ya'ni har doim o'sadi.
  **API manzili build'ga kiritiladi, repoda turmaydi:** `src/lib/api.ts`
  `extra.apiBase` ni o'qiydi; birinchi ikki APK busiz chiqib
  `http://localhost:8000` — telefonning o'ziga — murojaat qilgan. Endi
  `app.config.js` `SRCP_API_BASE` ni configga yozadi, `srcp-apk --api`
  (standart — production) uni beradi va APK ichidagi `assets/app.config` dan
  qayta o'qib, yo'q bo'lsa nashr qilmaydi.
- **Xodimlar ilovasining ikki ekrani jonli:** `src/crew/live.ts` —
  `useWaiterFloor()` va `useApprovalQueue()`. Mapping (`floorFrom`, `queueFrom`)
  `packages/surfaces/src/crew/live.ts` da — web'dagi `crew-server.ts` ham
  shundan o'qiydi. Server javob bermasa fixture + **sabab** ko'rsatiladi
  (`demoFloor` / `demoQueue`), bosilsa qayta so'raydi.

## `packages/surfaces` — telefon yuzalarining yagona manbai

Beshta iste'molchi yuzasi ikki marta chiziladi: `apps/web` da marshrut,
`apps/mobile` da ekran. Ularning **shakli, fixture'i, arifmetikasi va matni**
endi shu paketda — bittadan.

Bu tartib emas, drift'dan himoya. `pricing.ts` allaqachon ogohlantirgan edi:
«Telefon bitta raqamni, chek boshqasini ko'rsatsa — kassir aybdor bo'ladi». Native
ilova aynan shu narsaning ikkinchi joyi bo'lardi — har bir narx, har bir taom
nomi va har bir holat so'zi uchun birdan.

- **Sof TypeScript.** React, `next/*`, DOM, `fetch` yo'q —
  `packages/surfaces/src/purity.test.ts` buni mexanik tekshiradi (Metro
  `next/headers` ni yechmaydi, RN'da DOM yo'q).
- **Har faylga bitta subpath**, barrel emas: `crew/data` va `crew/copy` ikkalasi
  ham `TODAY` eksport qiladi va barrel bittasini qayta nomlashi kerak bo'lardi.
- 15 fayl ko'chdi, 111 faylda import yangilandi. Web testlari (447) o'zgarishsiz
  o'tdi — ko'chirish sof mexanik edi.

## Muhim konventsiyalar (binding)

1. **Pul — butun son, tiyinda.** 1 so'm = 100 tiyin. Hech qachon float
   ishlatilmaydi: bir tiyinlik yaxlitlash xatosi bir kunlik buyurtmaga
   ko'paytirilganda kassada real farq bo'lib chiqadi.
2. **Har bir biznes jadvalida `tenant_id`** bor va model `BelongsToTenant`
   trait'ini ishlatadi. Bitta restoran boshqasining ma'lumotini hech qachon
   ko'rmaydi — buni `TenantIsolationTest` tekshiradi.
3. **Manzilda sodir bo'ladigan narsada `branch_id` ham bor** (`BelongsToBranch`):
   stol, buyurtma, oshxona chiptasi, kassa smenasi, xodim va smena. Menyu,
   mijoz va yetkazib beruvchi esa biznesga tegishli — ularda filial yo'q.
   Muhim farq: **bo'sh tenant — teshik, bo'sh filial — yig'indi.** Filial
   ko'rsatilmasa, so'rov restoranning barcha filiallari bo'ylab ishlaydi;
   egasi va buxgalter aynan shunday o'qiydi. `BranchIsolationTest` ikkalasini
   ham tekshiradi.
4. **Tenant `X-Tenant`, filial `X-Branch` header orqali** aniqlanadi
   (`ResolveTenant` → `ResolveBranch`). Production'da
   `TENANCY_REQUIRE_TENANT=true` bo'lishi shart; filial uchun bunday majburlash
   ataylab yo'q.
5. **Har bir modul route'i `auth:sanctum` + `tenant` middleware ostida**, har
   bir amal Spatie permission bilan (`{module}.{action}`).
6. **Mehmonga qaragan endpointlar login talab qilmaydi** (`/api/v1/public/*`),
   lekin baribir tenant bilan chegaralangan va faqat sotuvda bor narsani
   ko'rsatadi.
7. **Buyurtma va to'lovlar hech qachon hard-delete qilinmaydi** — soft delete.
8. **Modul testlari `Modules/*/tests/`da** va `phpunit.xml`dagi `Modules`
   suite'i orqali ishga tushadi.
9. **O'qiladigan har bir sozlama `config/settings.php` da e'lon qilingan
   bo'lishi shart.** Schema `PATCH /settings` va `PATCH /branches/{branch}` ni
   tekshiradi va **e'lon qilinmagan yo'lni jimgina tashlab yuboradi** — yozuv
   200 qaytaradi, lekin hech narsa saqlanmaydi. 2026-08-22 da shu tuzoqdan
   oltita nuqson chiqdi va har biri mehmonga berilgan va'da edi:
   `delivery_fee_tiyin` (vitrina 0 deb ko'rsatardi, hisob esa boshqa summani
   olardi — chunki `PublicBranchController` `delivery.fee_tiyin` ni,
   `PublicOrderController` esa `delivery_fee_tiyin` ni o'qirdi),
   `kitchen_queue_minutes` · `delivery_travel_minutes` · `pickup_wait_minutes`
   (butun mamlakatdagi har oshxona bir xil 10 + 25 daqiqa va'da qilardi),
   `geo.lat` · `geo.lng` (birorta filialni xaritaga qo'yib bo'lmasdi).
   `ModuleBoundaryTest::test_every_setting_the_server_reads_can_be_written`
   endi buni mexanik tekshiradi.
10. **Ommaviy sahifa isbotlab bo'lmaydigan da'vo qilmaydi.** Marketing matni
    mijoz nomini, restoran nomini yoki sotuv raqamini o'ylab topmaydi. Sayt
    ilgari aynan shunday qilardi: uchta uydirma keys (ism, restoran, «+18%»),
    o'sha odamlarning uchta iqtibosi, hero'da «42 restoran, 118 filial» (va u
    har bir ulashilgan havola kartochkasida takrorlanardi), shaharlar bo'yicha
    restoran sanog'i, ROI izohida «42 restorandagi o'rtacha». Hammasi
    **namunaviy stsenariy** deb qayta yozildi — rolga bog'langan, modellashtirish
    ochiq aytilgan — hero'dagi to'rt raqam esa endi mahsulot haqidagi fakt
    (24 bo'lim · 14 modul · 3 til · 4 kassa rejimi).
    `apps/web/src/app/(marketing)/honest-claims.test.ts` ikkala katalogni ham
    (`pages-copy.ts` va `src/i18n/*.ts`) tekshiradi. Mahsulot ichidagi demo
    fixture'lar bunga kirmaydi — ular login ortida va «namunaviy» deb
    belgilangan.

## Working agreements

- Before scaffolding a new module → confirm with user which one and at what depth
- Before adding a new dependency → confirm choice with user
- Before destructive ops (rm, force-push, dropping data) → always confirm
- Memory of project decisions lives in
  `C:\Users\User\.claude\projects\C--Users-User-Desktop-Smart-Restaurant-Campus-Project\memory\`
  — read it at session start, update it when decisions are made

## Local dev gotchas

- **PHP:** `C:\Users\User\php8424\php.exe` (8.4.24) — boshqa PHP o'rnatmalari
  ishlamaydi. `export PATH="/c/Users/User/php8424:$PATH"` qiling.
- **Baza:** PostgreSQL 18, `restaurant_campus` (+ `restaurant_campus_test`).
  Har bir modul o'z schema'sida: `menu`, `orders`, `kitchen`, `tables`,
  `inventory`, `suppliers`, `staff`, `finance`, `crm`, `telegram`, `analytics`,
  `pos`; `public` — core. Batafsil: [ADR-0010](docs/decisions/0010-schema-per-module.md).
- **Testlar:** `php vendor/bin/phpunit` — Unit + Feature + Modules + Architecture.
  **PostgreSQL kerak** (SQLite emas): `restaurant_campus_test` bazasi ishlab
  turishi shart. Schema'lar faqat PostgreSQL'da bor, shuning uchun test ham,
  production ham bir xil dvigatelda ishlaydi.
- **Test ishga tushirishdan oldin `tinker`/`psql` seanslarini yoping.** Test
  to'plami `migrate:fresh` bilan boshlanadi va 54 ta jadvalni `DROP … CASCADE`
  qiladi; ochiq ulanish deadlock beradi va test tasodifan yiqiladi.
  Tekshirish: `select pid, state from pg_stat_activity where datname =
'restaurant_campus_test'`.
- **Yangi modul:** `php artisan restaurant:make-module Nomi --icon=… --uz=… --ru=…
--en=…` — modulni yaratadi va oltita joyda ro'yxatdan o'tkazadi (schema
  migratsiyasi, `search_path`, `ModuleBoundaryTest`, RBAC seeder,
  `modules_statuses.json`, autoload). Natija darhol arxitektura testlaridan
  o'tadi.
- **Realtime edge ortida ishlamaydi — va ekranlar buni biladi.** Ommaviy nom
  `87.237.235.107` dagi proxy'ga boradi, u bu qutiga **HTTP/1.0** bilan gaplashadi
  va `Upgrade` ni tashlab yuboradi: `/app/<key>` handshake 500, pusher-js abadiy
  qayta uradi, ekran «tirik» ko'rinadi (taymer yuradi) va yangi buyurtmani hech
  qachon bilmaydi. Qutining o'z nginx'i to'g'ri (to'g'ridan-to'g'ri 101).
  Javob ikki qavat: `docs/GO-LIVE.md` 14-qator — tarmoq ma'muri uchun proxy
  sozlamasi; va `lib/live-fallback.ts` — soket `connected` bo'lmaguncha
  `router.refresh()` (KDS 10 s, zal va kassa 15 s), ulangach to'xtaydi. Ekran
  server snapshot'ini `adopt()` bilan render paytida qabul qiladi, effect'da
  emas — eski ro'yxatning bir kadri ham chizilmasin.
- **Modul provayderi `ApiModuleServiceProvider` dan meros oladi, nwidart'ning
  `ModuleServiceProvider` idan emas.** Xom asos `loadViewsFrom()` ni shartsiz
  chaqiradi; `resources/views` yo'q modulda `php artisan optimize` (deploy'ning
  5-bosqichi) «directory does not exist» bilan yiqiladi — reliz quriladi,
  yuklanadi, lekin jonli bo'lmaydi. `Board` aynan shunday chiqdi. Shablon
  tuzatildi, `ModuleBoundaryTest` keyingisini rad etadi.
- **Ruxsat — kod; migratsiya uni olib yurmaydi.** Yangi modulning
  `{modul}.view/create/…` ruxsatlari `RolesAndPermissionsSeeder` da; schema
  `migrate` bilan tushadi, ruxsat esa seeder yurmaguncha bazada yo'q — ega
  har ekranda 403 oladi (Board, Marketplace shunday ochildi). `srcp-deploy
--migrate` endi migratsiyadan keyin shu seederni o'zi yuritadi.
- **Demo fixture — `config('{modul}.demo')` orqali, `db:seed --class` emas.**
  Tenant'siz yuritilgan seeder `tenant_id IS NULL` qator yozadi va RLS uni
  hech kimga ko'rsatmaydi. `demo:seed` har modulning `demo.seeders` va
  `demo.tables` ini o'qiydi, yetim qatorlarni tozalaydi, tenant bilan seed
  qiladi; `SeedDemoTenantTest` har e'lon qilingan sinf va jadval mavjudligini
  tekshiradi. Yangi seeder yozsangiz — modul configiga qo'shing.
  **Va u har kuni 04:10 da o'zi yuradi** (`routes/console.php`, faqat
  `demo-restaurant` bor qutida): demo vaqtga bog'liq — rota ±3 kun,
  `DemoTradingSeeder` oxirgi 7 kunning to'langan cheklari (ofitsiant +
  `business_date` bilan, `D250816-03` raqamlar — `A-` hisoblagichga tegmaydi),
  `DemoTakingsSeeder` har kunga yopiq smena va chek boshiga to'lov. Shuning
  uchun to'plamdagi har seeder **idempotent bo'lishi shart** — test ikki marta
  yuritib sanoqlar o'smasligini tekshiradi.
- **Yangi restoran birinchi filial bilan tug'iladi.** `branch_id` stol, xodim,
  smena, chiptada bor — filialsiz tenant hech narsa saqlay olmaydi.
  `TenantProvisioner::create()` biznes nomi bilan bitta filial ochadi
  (`markaziy`), shahar esa formadagi shahar. Va **jonli bo'sh ro'yxat fixture'ga
  qaytmaydi**: `shellState()` da «API javob bermadi» va «API bo'sh javob berdi»
  ikki xil holat — ikkinchisida demo restoranning filiallari ko'rsatilardi.
- **Telegram mini ilova jonli — kalitsiz.** `initData` ni restoranning **o'z
  bot tokeni** imzolaydi, token esa bazada (`telegram.tg_bots.encrypted_token`,
  shifrlangan). `App\Support\Telegram\InitData` HMAC va yoshni tekshiradi,
  `POST /v1/public/telegram/session` SMS bilan bir xil mijoz tokenini beradi.
  Mehmon **qaysi hujjat bilan kelgan bo'lsa, o'sha bilan tanildi**:
  `crm.customers.telegram_user_id`, `phone` esa nullable — Telegram mehmonida
  telefon yo'q. CRM TelegramBots'ni import qilmaydi — `BotDirectory` shartnomasi.
- **Jonli ekranda «bo'sh» — bo'sh, fixture emas.** Qoida uch qismli:
  (1) `*-server.ts` fixture'ga faqat `apiGet()` `null` qaytarganda (sessiya yo'q
  yoki API o'chgan) qaytadi; jonli bo'sh ro'yxat — halol bo'sh holat;
  (2) katalogdagi mock raqam/ism («32 stoldan 14 tasi», «11:24», «Aziza»)
  faqat fixture konsolining sarlavhasi — jonli ekran ICU shablon bilan
  ma'lumotdan so'z yasaydi; (3) yuqori chiziq va yon panel raqamlari
  `GET /v1/dashboard/pulse` dan (`strip.ts`, `navGroupsFor(role, counts)`).
  Birinchi haqiqiy restoran aynan shu uchalasini bir kunda ko'rdi.
- **`'use client'` faylidan konstanta eksport qilinmaydi.** Client modulidagi
  `export const TABS = [...]` server sahifasiga **client reference** bo'lib
  keladi (massiv emas): `TABS.filter is not a function` → butun ekran 500.
  Tip va konstanta — `*-data.ts` da; `*-server.ts` ni client faqat
  `import type` bilan oladi (bitta sof funksiya uchun ham import qilinmaydi —
  `next/headers` brauzer bundle'iga tushib build yiqiladi).
- **`middleware.ts` rewrite qiladi, shuning uchun `skipProxyUrlNormalize` shart
  (2026-08-24).** Ilovada `[locale]` segmenti yo'q: `/uz/x` sahifasiga `/x` ga
  rewrite orqali yetadi. Next esa RSC so'rovidagi rewrite'ni **mijozga
  redirect** qilib javob beradi, va o'sha so'rovda til yo'q — middleware uni
  308 bilan `/uz/x` ga qaytaradi, u yana rewrite bo'ladi, va halqa yopilmaydi.
  Hech qanday xato chiqmaydi: router payload'ni **hech qachon olmaydi**,
  shuning uchun marshrut `loading.tsx` ni chizib turadi. `<Link>` prefetch
  qilgani uchun bu bitta sahifa emas — ko'rinishdagi **har bir havola** o'z
  halqasini boshlaydi, konsolda esa 24 qatorli yon panel bor. O'lchangan:
  brauzer marketing sahifasida qimirlamasdan turib **8 soniyada 56 so'rov,
  40 tasi 3xx**; nginx logida 2251 so'rovdan **1249 tasi 3xx — 55%**, va
  juftlar aynan mos (`/uz/contact` 107 · `/contact` 107).
  - **Nega birinchi tuzatish ishlamadi va bu qoida shundan:** Next `rsc`,
    `next-router-state-tree`, `next-router-prefetch` sarlavhalarini va
    `?_rsc` ni middleware ko'rishidan **oldin olib tashlaydi** — ataylab, RSC
    so'rovini HTML so'rovidan boshqacha ishlatmaslik uchun
    (`node_modules/next/dist/docs/…/proxy.md`, «RSC requests and rewrites»).
    Ya'ni `request.headers.get('rsc')` va `searchParams.has('_rsc')` unit
    testda ishlaydi (so'rovni test o'zi yasaydi) va production'da **hech qachon
    ishlamaydi**. Hujjatdagi kalit — `skipProxyUrlNormalize: true`.
  - **Ikkala yarim ham kerak:** config markerni ko'rinadigan qiladi,
    `middleware.ts` esa unga qarab **redirect qilmaydi** (`softNavigation`).
    Bittasi yolg'iz hech narsa qilmaydi. Marker faqat tilni beradi — quyidagi
    barcha qo'riqchilar o'sha yalang'och yo'lda ishlashda davom etadi.
  - Natija: zanjir `/uz/contact →307→ /uz/contact?_rsc →200` da to'xtaydi;
    o'sha brauzer sessiyasi **18 so'rov, 0 ta 3xx**; toza nginx oynasida
    64 so'rovdan 3xx **1 ta** (u `/` → `/uz`, ataylab).
  - **Yon oqibat, tezlikdan jiddiyroq:** `router.refresh()` ham RSC so'rovi
    yuboradi, ya'ni KDS · zal · kassadagi 10–15 soniyalik polling — Reverb
    proxy ortida ishlamagani uchun qo'yilgan **zaxira** — jimgina o'lik edi.
    Ekran tirik ko'rinardi, yangi buyurtmani bilmasdi.
- **`nginx` `gzip_types` ga `text/x-component` kirishi shart.** Bu Next'ning
  RSC javobining MIME turi, ya'ni har bosishda ketadigan payload. Ro'yxatda
  yo'q edi — HTML siqilardi, navigatsiya payload'i esa xom ketardi. Tashqi
  proxy HTTP/1.1 ga tushirgani uchun (quti o'zi HTTP/2 beradi) brauzerda 6 ta
  ulanish bo'ladi, ya'ni har ortiqcha bayt navbatda turadi.
- **`apiGet` render ichida memoizatsiya qilingan (`cache()`).** Layout va
  sahifa bir xil `/branches` ni so'rasa bitta so'rov ketadi. **Qoida:
  `apiGet` qaytargan obyektni o'zgartirmang** — u o'sha yo'lni so'ragan
  boshqa komponent bilan umumiy.
- **`Intl` natijasi client komponentida render qilinmaydi.** Node va brauzer
  ICU'si «Sha»/«Shan» deb turlicha yozadi → hydration #418. Sana/kun
  yorliqlari serverda hisoblanib prop bilan beriladi (`bookDays()`), pul
  esa `formatNumber` (o'z ajratgichlari bilan) orqali.
- **Har `t('kalit')` katalogda bo'lishi shart — `keys-in-use.test.ts`.**
  Yo'q kalit tsc'da ko'rinmaydi, runtime'da `MISSING_MESSAGE` bilan sahifani
  yiqitadi. Dinamik kalitlar (`t(x.kind)`) test qamrovida emas — ular uchun
  xarita (`APPROVAL_LABEL` kabi) ishlating.
- **i18n kalitlari bir nechta qo'ldan:** `apps/web/scripts/i18n-add.mjs`
  `'{"console.blok.kalit": {"uz","ru","en"}}'` — qulf bilan uchala katalogga
  yozadi va prettier yuritadi. Parallel agentlar kataloglarni to'g'ridan-to'g'ri
  tahrirlasa bir-birining yozuvini yo'qotadi.
- **Yollash hisobni o'zi ochadi — `CrewLogin` (2026-08-23).** `staff.members`
  (HR yozuvi) va `users` (kirish) ikki alohida jadval edi va ularni hech kim
  bog'lamasdi: 8 demo xodimning birortasida `user_id` yo'q edi, ya'ni
  konsoldan **hech kimga** juftlash kodi berib bo'lmasdi — xodimlar ilovasi
  o'rnatilib, birinchi maydondan o'tolmasdi. Endi `POST staff/members`
  xodim bilan birga hisob ochadi (lavozim → rol: `manager` → `branch-manager`,
  qolgani nom-ma-nom), PIN javobda **bir marta** keladi, parol tasodifiy va
  hech kimga ko'rsatilmaydi, email esa `emp-0007@staff.{slug}.invalid` —
  `.invalid` RFC bo'yicha hech qachon hal qilinmaydigan domen, ya'ni xat
  ketmaydi va hech kim haqiqiy deb o'ylamaydi. `POST members/{member}/login`
  eski xodimga hisob ochadi yoki PIN ni yangilaydi (`staff.manage`).
  **Bo'shatish hisobni yopadi:** `destroy` → `is_active=false` + barcha
  tokenlar + juftlangan telefonlar `revoked` — `is_active` faqat parol
  eshigini qo'riqlaydi, mavjud sessiyani emas; PIN eshigi ham endi uni
  tekshiradi. Konsolda bular ism ostidagi uchta havola: «Hisob ochish» →
  «Telefon ulash» · «PIN yangilash»; sirlar toast'da emas (2.8 s — yozib
  ulgurmaysiz), qatorda, yopilguncha turadi.
  **Konsolga kiradigan lavozimlar (menejer · buxgalter · operator) parol ham
  oladi:** `POST members/{member}/password` → tasodifiy 12 belgili parol +
  kirish identifikatori (telefon bo'lsa telefon, bo'lmasa `.invalid` manzil)
  bir marta; ofitsiantga rad etiladi (`staff.not_a_desk_position`). Shu uchun
  konsol kirish maydoni endi «Pochta yoki telefon»: `/api/auth/session`
  raqamni `phone`, qolganini `email` sifatida yuboradi. Lavozim `PATCH` bilan
  o'zgarsa rol darhol sinxronlanadi. Lavozimlar ro'yxati **uch joyda** edi
  (model, forma, proxy) va ajraldi — endi web'da bitta `POSITIONS`
  (`staff-data.ts`), `staff-server.test.ts` uni PHP faylidan o'qib solishtiradi.
- **Metro `apps/api/storage` ni kuzatmasin.** Tunnel `ENOENT …
storage/app/exports/332` bilan yiqildi: PHP testlari u yerda papka yaratib
  o'chiradi, kuzatuvchi esa ko'rgan papkasini kuzatolmay qoladi. `blockList`
  kuzatuvga ham ta'sir qiladi — `storage/`, `vendor/`, `.venv/` unda.
- **Dizayn faylining `[data-toolbar]` i — ilova emas, dizaynerning pulti.**
  `Smart Restaurant Xodimlar ilovasi.dc.html` da til tanlagichi va kun/tun
  tugmasi `[data-phoneframe]` dan **tashqarida** turadi, yonida esa Pin/Lock
  ko'rinish tanlagichi — mock'ni ko'zdan kechirish uchun. Ya'ni «dizaynda bor,
  bizda yo'q» degan xulosani chiqarishdan oldin element ramka ichidami — shuni
  tekshiring; aks holda ilovaga hech qachon mavjud bo'lmagan ekran qo'shiladi.
  Kun/tun baribir qo'shildi, lekin **egasi so'ragani uchun** va ilovaning o'z
  joyiga (`More` etagidagi Kun · Tun · Tizim), pultning joyiga emas.
- **Dokdagi qidiruv endi haqiqiy — va faqat ikki narsani qidiradi.** Dizayn
  pillani chizadi, uning ishlovchisi esa «order, table, guest, item» degan
  toast; to'rttadan ikkitasida qismli qidiruv bor (`filter[search]` menyuda
  ilgaridan, stolda — shu ish uchun qo'shildi), qolgan ikkitasida endpoint yo'q.
  Shuning uchun maydon ikkalasini qidiradi va **qamrovini maydon ostida o'zi
  aytadi** (`SHARED.searchScope`). Ikkala o'qish alohida hal qilinadi: oshpazda
  `tables.view` yo'q, ya'ni yarmi qonuniy rad etiladi — butun qidiruvni yiqitish
  «hech narsa topilmadi» degan yolg'on bo'lardi. Qidiruv **hech qachon fixture'ga
  qaytmaydi**: namunaviy taom ko'rsatish — restoran sotmaydigan narsani sotadi
  deb aytish.
- **`ConsoleQueriesTest` yashil edi, chunki tekshirmasdi (2026-08-23).**
  `RefreshDatabase` butun testni bitta tranzaksiyaga o'raydi; PostgreSQL esa
  birinchi xato bilan tranzaksiyani **bekor qiladi** va undan keyingi har bir
  buyruq `25P02` beradi. `QueryException` esa `InvalidQuery` emas, ya'ni u
  pastdagi `catch (Throwable)` ga tushardi — natijada **160 so'rovdan faqat
  birinchi bir nechtasi** haqiqatan sinalgan, qolgani o'lik tranzaksiyaga
  qarshi «o'tgan». Endi har so'rov o'z savepoint'ida (`DB::beginTransaction()`
  … `finally { DB::rollBack(); }`), va skaner `apiGet` bilan birga **`crewGet`**
  ni ham o'qiydi — xodimlar ilovasining o'n sakkizta o'qishi ilgari umuman
  qamrovda emasdi, holbuki ularning yiqilishi eng jimi: `400 → null → fixture`.
  Tuzatilgach mutatsiya bilan tekshirildi: buzuq filtr endi testni yiqitadi.
- **`ActionButton` = hali qurilmagan tugma.** U faqat `flash()` qiladi. Agar
  ekranda shunday tugma bo'lsa — u ish qilmaydi; qolganlari:
  `orders` (2), `finance` (2), `tables`, `menu`, `analytics/control`. Xodim
  qo'shish shundan chiqarildi (`staff/add-staff.tsx` + `api/staff/members`).
- **Sana — soat, katalog emas.** Dizayn mock'idagi «Seshanba, 11-avgust»
  kataloga matn sifatida tushgan va jonli dashboard har kuni 11-avgust deb
  turgan. Endi `lib/today-label.ts` o'quvchi tilida bugunni yozadi; greeting
  ostidagi lede esa faktlardan (`Lede`: KPI deltasi + e'tibor kartalari soni,
  ICU plural bilan) — server «bilmayman» degan deltani gap qilib aytmaydi.
  Shunga o'xshash qat'iy raqam/sana kataloga tushsa — u fixture'ga tegishli
  bo'lib, jonli rejimda almashtirilishi shart.
- **Konsol yuboradigan har bir so'rov — `ConsoleQueriesTest` da.** Web
  `apiGet('/x?filter[y]=1')` yozadi, API `allowedFilters` bilan rad etadi, va
  drift jim o'tadi: 400 → `null` → fixture. `/calls` aynan shunday
  `filter[available]` bilan dizayn plitkalarini ko'rsatib turgan. Test web
  manbasini skanerlab har so'rovni haqiqiy routerga yuboradi
  (`withoutExceptionHandling`, faqat `InvalidQuery` ushlanadi).
- **Bu qutida repo `.env` production bazasiga (`srcp`) qaragan.** Ya'ni
  repo'dagi `php artisan demo:seed` / `db:seed` / `migrate` — jonli bazaga
  yozish, mashq emas. Mashq uchun lane: `DB_DATABASE=restaurant_campus_test_a
DB_USERNAME=restaurant_campus DB_PASSWORD=… php artisan …` (phpunit.xml
  dagi foydalanuvchi), yoki umuman yuritmaslik.
- **psql/pgAdmin'da qo'lda so'rov yozganda** schema'ni ko'rsating —
  `select * from menu.menu_items` — chunki `search_path` faqat ilovada o'rnatiladi.
- **Va endi tenant'ni ham ko'rsating.** RLS yoqilgan (**49 jadval**, `FORCE` — `pg_class.relrowsecurity` bilan tekshirilgan), shuning
  uchun `app.tenant_id` ham, `app.bypass_tenancy` ham qo'yilmagan seansda har bir
  so'rov **nol qator** qaytaradi — jadval bo'sh emas, siz ko'rmaysiz. Boshida:
  `set app.bypass_tenancy='on';` (hammasi) yoki `set app.tenant_id='1';` (bitta
  restoran). «Jadval bo'sh» degan xulosaga bormang — avval shuni tekshiring.
- **Parallel test lane'lari:** `restaurant_campus_test_a…g` — har agent/seans
  o'zinikida: `DB_DATABASE=restaurant_campus_test_b php vendor/bin/phpunit …`
  (faqat `DB_DATABASE`; foydalanuvchi/parolni `phpunit.xml` beradi). **Lane'ga
  qarshi `artisan migrate` yuritmang** — artisan `.env` dagi `srcp` bilan
  ulanadi va schema egaligini buzadi (`permission denied for schema crm`); bu
  2026-08-22 da ikki agentda takrorlandi. Tiklash: egasi rol bilan modul
  schema'larini `drop`, phpunit qayta quradi.
- **Python:** `uv run pytest` — `apps/telegram-bots` va `apps/ai-services` uchun.
