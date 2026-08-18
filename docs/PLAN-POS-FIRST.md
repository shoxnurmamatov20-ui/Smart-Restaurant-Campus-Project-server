# Smart Restaurant Campus — POS'dan boshlab qurish rejasi

**Sana:** 18-avgust 2026 · **Versiya:** 2 (POS-first, Apple yo'nalishi)
**Oldingi hujjat:** `docs/PLAN-2026-08.md` — umumiy tashxis va 13 qadamli
yo'l xaritasi.

### Ikki hujjat qanday bog'lanadi

Ikkalasini ham ochiq qoldirish chalkashtiradi — shuning uchun aniq
aytaman: **POS fazasida shu hujjat yagona bajarish tartibi.**

| `PLAN-2026-08.md` qadami               | Bu yerda                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------- |
| 0 · Xavfsiz maydon                     | **P0** — bir xil                                                            |
| 1 · API umurtqasi                      | **P1**                                                                      |
| 2 · Schema umurtqasi                   | **P1** ichida (`business_date`, `branch_counters`) va **P4** (menyu, savat) |
| 3 · Kanonik lug'at va dizayn qoidalari | **P1** (13 holat) + **P4** (44px daraja, `AsyncList`, `stateLabel`)         |
| 5 · Katalog va realtime                | **P4** + **P6**                                                             |
| 6 · Buyurtma va POS yozish yo'li       | **P4** + **P5**                                                             |
| 7 · KDS                                | **P5**                                                                      |
| 8 · To'lov, kassa, fiskal              | **P7** + **P10** + **P11**                                                  |
| 11 · Oflayn                            | **P12**                                                                     |

**POS tugagandan keyin `PLAN-2026-08.md` dan qoladigan ish** — ular bu
yerda qamralmagan:

- **Qadam 4** · kimlik va huquqlar chuqurligi (`people`/`person_identities`,
  tenant bo'yicha huquq matritsasi, impersonation) — POS uchun faqat PIN va
  smena qismi kerak edi
- **Qadam 9** · ombor, retsept va avtomatik yechilish
- **Qadam 10** · buxgalteriya, provodkalar, hisobotlar va qolgan hujjatlar
  (POS faqat chek va Z ni qamraydi)
- **Qadam 12** · mehmon kanallari
- Undan keyin · marketplace

`PLAN-2026-08.md` **tashxis va poydevor qarorlari uchun** o'qiladi (§1–§4,
ayniqsa **§3 — o'n bitta qaror**); bajarish tartibi uchun emas.

---

## 0 · Nima o'qildi

**Topshiriq paketi — to'liq.** 10 hujjat (START-HERE, CLAUDE, DECISIONS,
DATABASE, API, ENGINEERING, FOUNDATIONS, README, GAPS, CHANGELOG), 12 spets,
va **14 dizayn faylining o'zi** — jumladan `Smart Restaurant OS.dc.html` ning
POS, KDS, kassa va terminal bo'limlari qatorma-qator.

**Loyihaning o'z auditlari — to'liq.** Ekotizim auditi A–Z, Interaktivlik
auditi, Ishlamayotgan joylar ×2, ZimZim tahlili ×4, Qarorlar.

**Repo — to'liq.** 1 064 fayl `apps/` da, 70 ta `packages/` da, 51 ta
`infrastructure/` da, 45 ta `docs/` da. O'nta domen auditi + o'n to'rtta
sohа o'qishi.

---

## 1 · POS haqida asosiy xulosa: **qayta qurmaymiz, kengaytiramiz**

Bu meni ijobiy hayron qoldirdi. POS orqa tomoni kutilganidan ancha to'liq:

| Bor                                                                                                           | Qayerda                                                                     |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Terminal juftlash + qurilma tokeni                                                                            | `TerminalController::pair`, 10 daqiqalik kod                                |
| PIN bilan kirish + xodimlar ro'yxati                                                                          | `PosAuthController`, `PinAuthenticator`                                     |
| Chek: ochish, qator, bekor, chegirma, xizmat haqi, yuborish, bo'lish, birlashtirish, ko'chirish, bekor qilish | `BillController` — **11 amal**                                              |
| To'lov va kassa                                                                                               | `TenderService`, `App\Contracts\Finance\TillLedger`                         |
| Tasdiq reyestri                                                                                               | `pos.approvals` — bir martalik, 5 daqiqa, o'z-o'zini tasdiqlash rad etiladi |
| **Idempotentlik**                                                                                             | `IdempotencyGuard` — ishdan **oldin** da'vo qiladi                          |
| **Oflayn qayta yuborish**                                                                                     | `replayBatch()` — tartiblangan, qismli qo'llash bilan                       |

`IdempotencyGuard` ning izohi shartnomadagidan yaxshiroq o'ylangan:

> _"The row is claimed before the work runs, not after: claiming afterwards
> would leave a window in which two concurrent copies both find nothing and
> both charge the guest."_

`replayBatch()` esa `API.md §12` talab qiladigan qismli qo'llashni allaqachon
bajaradi — _"An entry that fails does not stop the rest — one unsellable line
must not strand a night's takings."_ Faqat **HTTP endpointi yo'q**.

### Nima yetishmaydi

| Yo'q                               | Oqibati                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `seat_no`                          | Mehmon bo'yicha bo'lish printsipial ishlamaydi (Q4)  |
| Modifikatorlar                     | Butun repoda "modifier" so'zi **yo'q**               |
| To'rt hisob + buyurtma raqamlari   | Bitta stolda bitta chek                              |
| `business_date`, `branch_counters` | Hisobotlar va uzluksiz raqamlash (Q3)                |
| Choypuli, 1000 ga yaxlitlash       | Q6, Q7                                               |
| Fiskal modul                       | Qonuniy majburiy                                     |
| Printerlar                         | O'zbekistonda oshxona **qog'oz chek** bilan ishlaydi |
| Realtime                           | Kodda bitta ham `ShouldBroadcast` yo'q               |
| **Frontend yozish yo'li**          | `apps/web` da `apiGet` dan boshqa hech narsa yo'q    |

Va to'rtta aniq nosozlik:

1. **`EloquentBillRegistry::send()` oshxona chekini yaratmaydi** — faqat
   `placed → in_kitchen` holatini yozadi. Chek alohida `POST /kitchen/dispatch`
   chaqiruvi bilan yaratiladi.
2. **Repoda beshinchi holat lug'ati** — `in_kitchen` na dizaynda, na
   `DATABASE.md` da bor.
3. **`PosDatabaseSeeder` ro'yxatdan o'tmagan.** `DatabaseSeeder.php` da u
   chaqirilmaydi, va **jonli bazada tekshirdim**:

   ```
   pos.terminals            0
   pos.pins                 0
   pos.terminal_sessions    0
   pos.sync_entries         0
   pos.approvals            0
   pos.drawer_movements     0
   ```

   Ya'ni **bironta ham terminal hech qachon juftlanmagan**. 35 ta POS
   endpointi yozilgan, testlari o'tadi, lekin bu deploy'da ular hech qachon
   real ma'lumot bilan ishlamagan.

4. **Smena terminalga emas, foydalanuvchiga tegishli.**
   `TillLedger::openShift(int $userId, int $openingCash)` va
   `finance.cash_shifts` da `terminal_id` **yo'q**. Shartnomada esa smena
   terminalniki. Bu eng chuqur schema farqi — X/Z hisoboti, nominal sanash
   va kun yopish hammasi shunga tayanadi.

---

## 2 · Apple yo'nalishi

### 2.1 Bu burilish emas — yakunlash

`FOUNDATIONS.md §2` ning o'zi shunday deydi:

> _"Intended target was SF Pro; Inter / Inter Tight are the open-licence
> stand-ins. If an SF Pro webfont licence exists, swap families and keep every
> other value."_

Dizayn **allaqachon Apple tipografiyasiga qarab** yozilgan.

### 2.2 Tipografika — cheklov va yechim

Aniqlashtirdim: Apple SF Pro'ni **Apple Font License Agreement** ostida
tarqatadi (OFL emas). U litsenziya **Apple platformalarida ishlaydigan
dasturlar interfeysini loyihalash va ishlab chiqish** uchun ruxsat beradi va
**qayta tarqatishga ruxsat bermaydi** — brauzerga shrift faylini yuborish
esa aynan qayta tarqatish. Hech bir foundry SF Pro'ning web litsenziyasini
sotmaydi, ya'ni `FOUNDATIONS §2` dagi shart — _"if an SF Pro webfont licence
exists"_ — **hech qachon bajarilmaydi**.

Ruxsat etilgani: stack'da `-apple-system` / `BlinkMacSystemFont` /
`system-ui` ni **nomlash**. OS shriftni o'zi beradi, hech qanday fayl
yuborilmaydi.

**Va dizayn fayllari buni allaqachon qilgan** — ikkalasida ham Inter'dan
keyin darhol `-apple-system,BlinkMacSystemFont` turadi. **Repo ularni
tashlab yuborgan.** Ya'ni bu qadam yangilik emas, **regressiyani
qaytarish**:

```css
/* dizayn faylining o'z tartibi — Inter BIRINCHI, OS shrifti keyin */
--font-ui: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif;
--font-display: 'Inter Tight', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
```

**Nega SF birinchi emas — POS'da bu ataylab.** Savat ustuni qat'iy 392px va
jamlanma raqamlari iPad bilan Android planshet o'rtasida **siljimasligi**
kerak. Kassada **metrik aniqlik** "mahalliy his"dan muhimroq. SF birinchi
bo'lishi marketing saytida to'g'ri, kassada emas.

Ya'ni Inter va Inter Tight **doimiy** qoladi (OFL 1.1, `next/font` bilan
o'zimizda hostlanadi), `-apple-system` esa ulardan **keyin** — aynan dizayn
faylida yozilganidek.

**Bitta yangi token:** `--tracking-display: -0.032em`, faqat 30px dan
yuqorida. POS'da bu ikki joy — to'lov drawer'idagi 38px jami va kutish
ekranidagi soat. (Shartnoma `-.022em` da to'xtaydi, dizayn esa literal bilan
`-.03em` va `-.04em` ga chiqadi — bu uchinchi mexanizm emas, bitta token.)

**Uch mayda kelishmovchilik ham shu yerda yopiladi:** `Inter Tight` og'irliklari
uch joyda uch xil (hujjat 600/700/800 · dizayn fayli 500/600/700 · repo
500/600/700/800 — 800 esa faqat POS kutish ekranidagi brend belgisida
ishlatiladi); va OS dizayn faylining `--font-mono` sida **JetBrains Mono
yo'q** (`ui-monospace, 'SF Mono', Menlo`), garchi qolgan 11 faylda bor.
POS uchun fayl yutadi — SF Mono birinchi.

Shrift qanday bo'lishidan qat'i nazar qo'llanadigan Apple xatti-harakatlari:

| Nima           | Qiymat                                                              |
| -------------- | ------------------------------------------------------------------- |
| Optik tracking | 24px+ `-.022em` · 15–20px `-.012em` · 13px `0` · 11px caps `+.08em` |
| Og'irlik       | UI urg'usi **600**; 700 faqat raqam va display                      |
| Minimum        | tana 15px · KDS 18px · chek 12pt                                    |
| Raqamlar       | `font-variant-numeric: tabular-nums` har bir pul va vaqt ustunida   |
| Kichik harf    | **hech qachon** letterspacing                                       |

### 2.3 Material — dizayn uni deyarli ishlatmaydi, biz ham ishlatmaymiz

Bu yerda ham dastlabki taklifimni toraytiraman. `backdrop-filter` 17 547
qatorda **atigi besh marta** uchraydi:

- `blur(2px)` — to'lov, PIN va modifikator oynalarining orqa fonida
- `blur(3px)` — POS qulfini ochish ekranida

**Boshqa hech qayerda.** Va yagona shaffof **sirtlar** — POS kutish ekranida,
gradient ustida: `rgba(255,255,255,.06)` to'ldirish, `.18` hoshiya, `.05`
statistika kataklari, matn `.72/.62/.6/.5`.

**Qoida:** o'sha ekranni aynan shu qiymatlar bilan quramiz va blur'ni
**boshqa joyga qo'ymaymiz**. 60 ta taom kartasi aylanayotgan to'r ustidagi
muzlatilgan sarlavha — o'rta darajadagi Android planshetni sekin his
qildirishning eng ishonchli yo'li.

**Balandlik — hoshiya bilan, soya bilan emas.** Tinch sirt: 1px
`var(--border)` va boshqa hech narsa. Hover (faqat sichqoncha — POS'da
umuman yo'q): `--border-strong` + `--shadow-md`. `--shadow-xl` faqat
**to'rt narsa** oladi: to'lov drawer'i, PIN oynasi, modifikator varag'i,
toast.

**KDS'da soya umuman yo'q** — bu yerda hujjat faylni yengadi. Balandlikni
4px chap holat chizig'i beradi.

### 2.4 Burchak — squircle'dan voz kechamiz

Apple uzluksiz burchak chizadi. Brauzerda buni hoshiyali, fokuslanadigan va
matn ko'taradigan qutida chizishning ishonchli yo'li yo'q: SVG/clip-path
squircle hoshiyani ham, fokus halqasini ham, chekka silliqlashni ham buzadi.

**Doiraviy yoyni olamiz.** iOS bo'lib o'qiladigan narsa — egrilik emas,
**nisbat**, va shartnomada u allaqachon bor: 36–44px boshqaruvda 10px
(~25%), kartada 14px, oynada 20px, chipda 999px.

Bitta tartib: barcha klaviaturalar **14px** ga keltiriladi (dizaynda POS
qulfi 58px tugmada 14px, PIN oynasi esa 56px da 10px ishlatadi).
`--radius-2xl 28px` dizaynda **nol marta** ishlatilgan — uni olib tashlaymiz.

### 2.5 To'r — bu yerda 8pt qoidasini **qo'llamaymiz**

Dastlab men 4px asos va Apple'ning 8pt to'ri mos keladi deb yozgan edim.
Dizayn faylini o'lchab, buni **qaytarib olaman**.

`var(--sp-N)` 17 547 qatorlik faylda **nol marta** ishlatilgan. Har bir
`--sp-1 … --sp-10` faqat bir marta — o'z e'lonida — uchraydi. Ya'ni
tokenlar e'lon qilingan va **hech qachon chaqirilmagan**: har bir masofa
literal px bo'lib yozilgan, va taqsimot 4px to'riga ham tushmaydi:

```
gap: 12px ×201 · 10px ×145 · 14px ×140 · 8px ×106 · 16px ×105
     20px ×54  ·  7px ×51  ·  9px ×47  · 11px ×36 ·  6px ×32
```

7, 9, 11, 13, 18 — bular **optik sozlangan** qiymatlar, panjara emas.
Ularni 8pt ga tortish dizaynni **qayta yozish** bo'ladi, aniqlashtirish emas.

**Qaror:** dizayn masofalarini borligicha olamiz. Apple'dan olinadigan narsa
to'r emas — **nishon o'lchami**: 44px POS/KDS/mobil, 32px desktop, 56–58px
raqamli klaviatura. Bu HIG bilan aynan bir xil va dizaynda ham shunday
(44px **47 marta**, 48px ×9, 52px ×8).

⚠️ **Va bu yerda POS'ni bloklaydigan aniq bo'shliq bor:**
`packages/ui` dagi **hech bir boshqaruv 44px ga yetmaydi**.
`buttonVariants` eng kattasi `h-10` = **40px**. Ya'ni bugungi tugmalar
qo'lqopli barmoq uchun kichik. P4 da bitta 44/52px teginish darajasi
qo'shiladi.

### 2.6 Harakat va fokus

- **Bosish** — dizayn faylida global `scale(.985)`, POS va KDS'da
  `scale(.97)` 100 ms `--ease-out` bilan (repo buni to'g'ri ajratgan:
  `app-shell.css` .985, `pos.css` .97; KDS'da esa **umuman yo'q** — qo'shiladi).
- **Kirish va holat o'zgarishi uchun turli egri chiziq — bu Apple naqshi va
  dizayn allaqachon shunday qilgan.** `--ease-out cubic-bezier(0,0,.2,1)`
  har bir **kirish** uchun, `--ease-standard cubic-bezier(.4,0,.2,1)` esa
  **holat o'zgarishi** uchun. Yagona bo'shliq: `--ease-out` e'lon qilingan,
  lekin Tailwind'ga **xaritalanmagan** — ya'ni POS'ga eng kerak bo'lgan
  egrilikni klass sifatida yozib bo'lmaydi. `--dur-fast/med/slow` bilan
  birga xaritalanadi.
- To'lov drawer'i `--dur-slow` 320 ms `sheetIn` bilan (`translateY 14px`,
  `scale .99`) — planshetda tiniq. Apple'ning o'z 350–500 ms i bu yerda
  cho'zilib ketadi.
- ⚠️ **Puls haqida fikrimni o'zgartirdim.** Dizayn fayli `softPulse …
infinite` ni yetti joyda ishlatadi va men "KDS'da aylansin" degandim.
  Noto'g'ri: **1920×1080 devor ekranida yettita pulsatsiya qiladigan nuqta —
  bu liniya o'qishni to'xtatadigan ekran.** `FOUNDATIONS §4` haq.
  **Qaror:** 10 daqiqa chegarasini kesib o'tganda **bir marta** pulsatsiya,
  keyin qizil hoshiya **turib qoladi**. Amber 6 daqiqada.
- **Fokus — uchta ta'rif bittaga yig'iladi:** `outline: 3px solid
var(--focus-ring); outline-offset: 2px`. `button`, `input` va `badge` dagi
  `focus-visible:ring-[3px] ring-ring/50` **o'chiriladi** — brend rangi bilan
  to'ldirilgan tugmada u brendni brend ustiga chizadi, ya'ni **ko'rinmaydi**.
  POS va KDS raqamli klaviatura bilan boshqarilgani uchun fokus halqasi
  kassirning **yagona yo'l ko'rsatkichi**.

### 2.7 Rang — palitra o'zgarmaydi

Token shartnomasi mijozniki. Apple'dan olinadigan narsa rang emas, **intizom**:
bitta urg'u, semantik rang faqat ma'no uchun, rang hech qachon bezak emas,
material ustidagi matn bir pog'ona to'yingan.

### 2.8 Nimani KO'CHIRMAYMIZ — bu yarmi muhimroq

| Apple pattern                                              | Nega bu yerda zarar                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Large-title navigatsiya**                                | 1024px POS'da 60px vertikal joyni yeydi. Har bir qator — taom. Rad etiladi.                                                                   |
| **Keng bo'sh joy**                                         | POS xizmat vaqtida zich asbob. `minmax(178px,1fr)` to'r va 132px karta to'g'ri — uch ustunga "Apple'lashtirish" xato.                         |
| **Hamma joyda shaffoflik**                                 | KDS va quyosh tushadigan kassada kontrastni yeydi.                                                                                            |
| **Uchinchi darajali kulrang matn**                         | Qo'lqopli qo'l, lyuminestsent yorug'lik. `--fg-muted` dan pastga tushmaymiz.                                                                  |
| **Faqat imo-ishora** (swipe to delete)                     | Ho'l qo'l, tez xizmat. Har bir amalda ko'rinadigan tugma.                                                                                     |
| **SF Symbols**                                             | Litsenziya Apple platformalari bilan chegaralangan. Lucide 1.75px stroke — SF ga yaqin o'qiladi.                                              |
| **Emoji**                                                  | FOUNDATIONS Telegram'dan tashqarida taqiqlaydi.                                                                                               |
| **Varaq ustida varaq** (ota ekran orqaga kichrayadi)       | To'lov yo'li — 480px to'liq balandlikdagi o'ng drawer. Ota kichraymaydi, yumaloq yuqori burchak jamini yemaydi.                               |
| **Pastki tab paneli**                                      | Landshaftda bu bosh barmoq zonasidagi 49pt tasma — uni savat futeri allaqachon egallagan. POS navigatsiyasi — 172px chap rels.                |
| **Pull-to-refresh**                                        | POS realtime. Optimistik chek ustida yangilash imo-ishorasi **qatorlarni yo'qotadi**.                                                         |
| **`prefers-color-scheme` bilan avtomatik qorong'ilashish** | Dizayn kassaga 44px oy tugmasini beradi va KDS'ni shartsiz qorong'i qiladi. Avtomatik almashinuv terminalni **smena o'rtasida** o'zgartiradi. |
| **Haptika tasdiq sifatida**                                | Dokdagi planshetda uni hech kim sezmaydi. Tasdiq **ko'rinadigan** (.97 bosish) va pul uchun **matnli** bo'lishi kerak.                        |
| **Raqam ko'taradigan narsada prujina**                     | Sakraydigan jami — **hal bo'lmagan jami** bo'lib o'qiladi. `--ease-spring` faqat muvaffaqiyat belgisi uchun.                                  |
| **Noaniq halokatli tugma**                                 | Bekor, qaytarish va sovg'a — uchta alohida hodisa. Hech qachon bitta qizil "O'chirish" tugmasi.                                               |

### 2.9 POS uchun teginish asoslari — hozir yo'q, qo'shiladi

Bular kichik, lekin ularsiz planshet POS'ga o'xshamaydi:

```css
[data-pos] {
  touch-action: manipulation; /* ikki marta bosish zoom qilmasin */
  user-select: none; /* uzoq bosishda taom nomi belgilanmasin */
  -webkit-touch-callout: none;
  height: 100dvh; /* h-screen emas — iPad Safari chrome'i
                                       futerni yutib yuboradi */
}
```

Ustiga `viewportFit: cover`, `safe-area` paddingi va `maximumScale` —
ikki marta bosish kassani kattalashtirmasligi uchun.

**Tugma o'lchamlari `packages/ui` ga qo'shiladi**, 200 ta chaqiruv joyida
`className` bilan ustidan yozilmaydi: `touch` (h-11 = 44px), `pos`
(h-13 = 52px, `text-md`), `key` (h-14 = 56px, 14px radius, display shrifti,
`text-xl`). Ko'tarilishi kerak bo'lgan zaif joylar: **24px buyurtma
chiplari** va **36×36 savat stepperlari**.

**Modifikatorsiz taom bir teginishda qo'shiladi.** Hozir har bir karta
modifikator varag'ini ochadi — ya'ni har bir Coca-Cola uchun ikki teginish
va bitta yopish. Modifikator guruhi yo'q taom to'g'ridan-to'g'ri savatga
tushadi; varaq esa uzoq bosish bilan ochiladi (dizaynning bo'sh holat matni
buni allaqachon va'da qiladi).

### 2.10 KDS — devor ekrani uchun aniq qiymatlar

- **Eng katta narsa — chek raqami** (30px mono, 700), stol emas: oshpaz
  **raqamni chaqiradi**.
- Taom nomlari 15px; besh ustun, har biri kamida 288px.
- Konsol mavzusidan qat'i nazar **shartsiz `data-theme="dark"`**.
- Kechikish **uchta bir vaqtdagi rang almashinuvi** bilan: hoshiya, yosh
  raqami va raqam chipi — **6 daqiqada amber, 10 daqiqada qizil**.
- Soya yo'q. Hover yo'q — hech kim sichqoncha ushlab turmaydi.
- `aria-live="polite"` chiptalar ro'yxatida.
- Tanlov halqasi: `box-shadow: 0 0 0 3px var(--focus-ring)` + brend hoshiyasi.

### 2.11 Apple bu mahsulotni haqiqatan ko'taradigan uch joy

**1 · Xato dizayni.** Dizayndagi POS holat qatori allaqachon Apple darajasida.
Qizil nuqtaga bosasiz → nima buzilgan, nimani anglatadi, nima qilish kerak,
va amal tugmasi:

> _"Printerni tekshiring: quvvat, qog'oz, tarmoq kabeli. Qog'oz tugagan bo'lsa
> almashtiring — navbatdagi cheklar o'zi chiqadi. Shoshilinch bo'lsa taomni
> og'zaki aytib qo'ying."_

Bu naqsh **butun tizimga** yoyiladi.

**2 · Deference.** POS ekrani deyarli butunlay menyu va chek: 172px rail →
taomlar → 392px savat. Qo'shimcha panel qo'shmaymiz.

**3 · Bitta asosiy amal.** POS'da "Oshxonaga yuborish", KDS'da 52px to'liq
kenglikdagi holat tugmasi, kassada "To'lovni qabul qilish". Qolgani ghost.

---

## 3 · POS'ning aniq shakli — dizayndan o'qilgan

Bular taxmin emas, `Smart Restaurant OS.dc.html` dan olingan aniq qiymatlar.

### 3.1 Ishga tushish ketma-ketligi

```
idle  →  who (xodim kartalari)  →  PIN  →  floor
```

- **Xodim kartalari** — smenadagi xodimlar filtri, har birida: bosh harflar,
  ism, rol chipi (rol bo'yicha rang), nechta stoli va bugungi sotuvi.
  Bu ZimZim #23 ning bajarilgan ko'rinishi.
- **PIN** — 4 raqam, to'rtinchi raqamdan **180 ms** keyin avtomatik yuboriladi,
  xato → tozalanadi va qizil, **uch xatodan keyin qulflanadi**.
- Muvaffaqiyatda → _"smena ochildi"_. Ya'ni PIN **smenani ham ochadi**
  (`API.md §2.2` aynan shuni talab qiladi).
- `posLock` va `posSwitchUser` — terminalni qulflash va foydalanuvchi
  almashtirish (ZimZim #21).
- ⚠️ `0000` — demo master kod. **Ishlab chiqarishda olib tashlanadi.**

### 3.2 Zal ekrani

- Chapda **168px zona relsi**: har bir zona 42px tugma, o'ng tomonida band
  stollar soni; pastida **legenda** — yashil = meniki, amber = boshqa
  ofitsiantniki.
- O'ngda `repeat(auto-fill, minmax(150px,1fr))` to'r, har bir stol **118px**:
  yuqorida ofitsiant ismi (10px caps) va ochilish vaqti (mono), keyin stol
  raqami (`--text-xl`/600), holat glifi, holat yozuvi (10px caps), pastida
  meta (mehmon soni · hisob summasi).
- **3px chap qirra**: yashil (meniki) yoki amber (boshqasiniki) —
  ZimZim #9 ning "o'g'irlikka qarshi" mantig'i.
- Oxirida **punktir "Olib ketish"** kartasi.

### 3.2a POS uch bosqichi va ramkasi

```
posIdle  →  posWho (xodim + PIN)  →  posWork
```

`posWork` — vertikal flex ustun: **64px sarlavha** → ixtiyoriy **amber oflayn
tasmasi** → tana → **38px holat qatori**. Tana esa ikki holatda: stol
tanlanmagan (`posNoTable` — buyurtma turi va zal) yoki sotuv ekrani
(`posHasTable` — uch ustun).

Responsiv zinapoya ham aniq: ≤1200px savat **326px** ga tushadi · ≤1024px
zona relsi gorizontal skrollerga aylanadi · ≤820px POS **vertikal** yig'iladi
va kategoriya relsi yuqoriga chiqadi · ≤560px to'lov drawer'i to'liq kenglik.

### 3.3 POS uch ustuni

| Ustun            | Kenglik   | Ichida                                                                                                                      |
| ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Kategoriya relsi | **172px** | 56px tugmalar, ostida taom soni                                                                                             |
| Taomlar          | `flex:1`  | `minmax(178px,1fr)` to'r, karta **132px**: 34px monogramma kvadrati, tur tegi, nom (`--text-md`/600), tavsif, narx + qoldiq |
| Savat            | **392px** | bill tablari → sarlavha → buyurtma raqamlari → qatorlar                                                                     |

### 3.4 To'rt hisob va buyurtma raqamlari

- Savat tepasida **4 ta bill tabi** (36px, 3px paddingli `--bg-muted`
  konteynerda, 11px radius). Faol tab oq fon + `--shadow-xs`.
  Bo'sh bo'lmagan tabda **badge** — nechta pozitsiya.
- Tab almashtirilganda joriy savat `billStash` ga saqlanadi.
- **Buyurtma raqamlari** — har bir "yuborish" o'z raqamini oladi va savat
  tepasida 24px mono pill sifatida to'planadi, holati bo'yicha rangli nuqta
  bilan (`sent` ko'k · `cooking` amber · `ready` yashil · `served` kulrang).
  Bosilganda tafsilot. Bu ZimZim #6 — _"71-buyurtma tayyor"_ tili.
- To'lovdan keyin: shu stolda boshqa to'lanmagan bill bo'lsa, POS **avtomatik
  o'shanga o'tadi**, stolni yopmaydi.

### 3.5 Hisob-kitob — va undagi ikki nuqson

Dizayndagi formula:

```js
sub     = Σ (narx × miqdor + qo'shimcha × miqdor)
service = round(sub × 0.10)
disc    = chegirma ? −round(sub × 0.10) : 0
total   = sub + service + disc
vat     = round(total × 0.12 / 1.12)
```

QQS to'g'ri (Q1). Lekin ikkita nuqson bor va ikkalasini ham biz tuzatamiz:

1. **Matn to'g'ri qoidani aytadi, arifmetika unga ergashmaydi.**
   Buyurtma turi tanlanganda ekran shunday yozadi:

   | Tur         | Ekrandagi matn                          |
   | ----------- | --------------------------------------- |
   | Zal         | _"Xizmat haqi 10% qo'shiladi"_          |
   | Olib ketish | _"Xizmat haqi olinmaydi"_               |
   | Yetkazish   | _"Xizmat haqi o'rniga yetkazish narxi"_ |

   `cartTotals()` esa `posType` ni umuman o'qimaydi va **uchala holatda ham**
   `round(sub × 0.1)` qo'shadi. Ya'ni dizayn so'zda rost, hisobda yolg'on.
   `DECISIONS Q2` matn tomonida.

2. **Hammasi brauzerda hisoblanadi.** `API.md §19` buni taqiqlaydi:
   _"A tablet that can post its own total can post any total."_
   Serverga ko'chiriladi.

**Yetkazish zonalari** ham dizaynda bor va ma'lumot modeliga kiradi:
Chilonzor 8 000 (25 daq) · Yunusobod 12 000 (35 daq) · Sergeli 15 000
(45 daq) · Zangiota — **zonadan tashqarida**, buyurtma boshlanmaydi.
Ya'ni `delivery_zones` jadvali: nom, narx, vaqt, chegara.

Va bitta soliq qoidasi — uni o'tkazib yuborish oson:

> _"Yetkazish narxi hisobga alohida qator bo'lib qo'shiladi va **QQS'ga
> tortilmaydi**."_

Ya'ni yetkazish narxi `items_total` ga kirmaydi va `vat_amount`
hisobidan **chetda** qoladi.

### 3.5a Savatda ko'rinadigan qatorlar — va nima ko'rinmaydi

Savat jamlanmasi aynan shu tartibda: **Oraliq jami → Xizmat haqi 10% →
Chegirma → Jami**. Chegirma o'chiq bo'lsa qiymat `—` bo'lib turadi
(qator yo'qolmaydi).

**QQS savatda ko'rsatilmaydi** — u faqat to'lov drawer'ida chiqadi. Chekda
esa bor. Uchala joyda uch xil ko'rinish — bu ataylab.

⚠️ **Chegirma dizaynda qat'iy 10% kalit** — foiz tanlagich ham, summa
kiritish ham yo'q. Lekin `01-os §4.3` rol shiftlarini belgilaydi:
ofitsiant 0% · katta ofitsiant 5% · menejer 20%. Ikkalasi mos kelmaydi —
P5 da **foiz tanlagich + sabab + rol shifti** quriladi, chunki tasdiq oqimi
aynan shunga tayanadi.

⚠️ **Menejer PIN oynasi dizaynda har qanday to'rt raqamni qabul qiladi** —
kod tekshirilmaydi va jurnalga yozilmaydi. Repoda esa `pos.approvals`
allaqachon to'g'ri qurilgan; frontend shunga ulanadi.

⚠️ **Bo'lish, birlashtirish va ko'chirish dizaynda zal ekraniga tegishli**,
POS'ga emas. Repo API'si ikkalasidan ham chaqirilishi mumkin — P5 da zal
ekranidan ulaymiz, P6 dan keyin POS'dan ham.

### 3.6 Mehmon raqami — chek uni chop etadi, POS uni so'ramaydi

Bu eng qiziq topilma va u to'g'ridan-to'g'ri qurish tartibiga ta'sir qiladi.

**Oshxona cheki mehmon raqamini chop etadi.** `Hujjatlar.dc.html` dagi
80 mm oshxona chekida har bir qator ostida `mehmon 1`, `mehmon 2`,
`mehmon 3` turadi, va hujjatning o'z izohi buni tushuntiradi:

> _"Mehmon raqami Q4 qaroriga mos, taomni to'g'ri odamga berish uchun."_

**Lekin POS ekranida uni kiritish joyi yo'q.** `seat` bo'yicha butun
`Smart Restaurant OS.dc.html` ni qidirib chiqdim — `seats` faqat **stol
sig'imi** ma'nosida ishlatiladi. Kiritish qatlami chop etish qatlami
kutayotgan ma'lumotni **hech qachon yig'maydi**.

Bu auditlar ogohlantirgan naqshning o'zi — _"tugma bor, lekin ma'lumot yo'q,
ya'ni tugma yolg'on gapiradi"_ (yozuv 29.1). Shuning uchun P5 da mehmon
segmenti **majburiy**, ixtiyoriy emas.

Qaror hujjati uning shaklini ham aytib qo'ygan:

> _"Mehmon raqami yuqorida doim ko'rinib turadigan segment bo'lishi kerak
> (1 2 3 4 5 · Umumiy), bosish bir marta."_

Shuning uchun: savat sarlavhasi ostida, buyurtma raqamlari yonida —
**segment boshqaruv**, mehmon soniga qarab 1..N va `Umumiy` (0). Tanlangan
mehmon keyingi qo'shilgan qatorlarga yopishadi. Oshxona chekida ham chiqadi.

### 3.7 To'lov varag'i

Usullar: **Naqd** (1-kassa) · **Karta** (Uzcard/Humo) · **Click** (telefonga QR)
· **Payme** (telefonga QR) · **Qarzga** (mijoz tanlanadi).

Qarzga sotishda: mijoz ro'yxati, har birida joriy qarz va limit; limitdan
oshsa → _"menejer tasdig'i kerak"_. To'langanda: _"balansiga yozildi ·
pul kelmadi"_ — ya'ni kassaga tushmaydi.

⚠️ Dizaynda **Uzum yo'q**, **choypuli maydoni yo'q**, **yaxlitlash yo'q**.
Uchalasini ham biz qo'shamiz (Q6, Q7) — chunki **chek ularni kutadi**:
mijoz chekida `Choypuli 25 000` qatori allaqachon chizilgan.

### 3.7a Chek nimani kutadi — bu POS ma'lumot modelini belgilaydi

`Hujjatlar.dc.html` dagi 80 mm mijoz cheki quyidagilarni chop etadi, ya'ni
POS ularni **yig'ishi shart**:

| Qator                                                                                    | Qayerdan keladi                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| `Chek № 004 812`                                                                         | uzluksiz raqam, filial bo'yicha           |
| `Sana 15.08.2026 21:14` va **`Ish kuni 15.08.2026`**                                     | alohida ikki maydon — Q3                  |
| `Stol · mehmon 12 · 4`                                                                   | stol va mehmonlar soni                    |
| **`Hisob 1 / 2`**                                                                        | to'rt hisobning qaysi biri                |
| **`Buyurtmalar 25 69 70 74`**                                                            | shu hisobda to'plangan buyurtma raqamlari |
| **`Buyurtma turi Zalda`**                                                                | uch turdan biri                           |
| `Ofitsiant` va `Kassir`                                                                  | ikkalasi alohida                          |
| Qator + modifikator (`m1 · qo'shimcha go'sht`)                                           | modifikatorlar                            |
| `Taomlar` → `Xizmat haqi 10%` → **`Taomlar + xizmat`** → `Chegirma` → `JAMI`             | oraliq summa ZimZim #11                   |
| `shundan QQS 12%`                                                                        | ma'lumot uchun — Q1                       |
| `Karta · Uzcard ···4417`                                                                 | to'lov usuli va oxirgi 4 raqam            |
| **`Choypuli 25 000`**                                                                    | Q6                                        |
| `Fiskal modul FM 7742 1180` · `Fiskal belgi 1904 8827 3315` · **QR**                     | fiskal modul                              |
| _"Chekni soliq.uz saytida tekshirish uchun QR kodni skanerlang. Chek 30 kun saqlanadi."_ | qonuniy matn                              |
| Ikkita telefon + _"Shikoyat va takliflar uchun"_                                         | ZimZim #11                                |

**Oshxona cheki** esa: **narx yo'q**, taom nomi **13 pt** (2 metrdan
o'qiladi), modifikator **qizil va katta** (_"eng ko'p xato shu yerda"_),
mehmon raqami, `Me'yor 18 daqiqa` (tayyorlash normasi), va pastda
ramkali `3 POZITSIYA · 4 PORTSIYA`.

### 3.8 Klaviatura — to'qqiz yorliq

**Global:** `?` yorliqlar varag'i · `Esc` yopish · `⌘K` global qidiruv ·
`⌘\` yon panelni yig'ish · `⌘⇧L` mavzu · `g` keyin `d/o/t/i/f` (1200 ms oyna)

**POS:** `Enter` oshxonaga yuborish · `P` to'lov · `1–9` stol yoki kategoriya ·
`+`/`=` oxirgi qatorni oshirish · `−`/`Backspace` kamaytirish

**KDS:** `1–9` chek tanlash · `←/→` cheklar orasida · `Enter` holatni surish ·
`Tab` sexni almashtirish · `S` stop-list paneli

### 3.9 POS holat qatori — bu ekotizimning eng yaxshi detali

Pastki qatorda: **Aloqa** (websocket) · **Internet** · keyin **har bir printer
alohida**. Yonida terminal nomi (`POS-3 · Chilonzor`), versiya, soat.

Har bir nuqta bosiladi va **to'rt narsani** aytadi: nima buzilgan · nimani
anglatadi · nima qilish kerak · va amal tugmasi (_Qayta urinish_ /
_Sozlamalarga o'tish_ / _Navbatni ko'rish_).

Printer modeli: `nom · IP · port 9100 · turi (kitchen|bar|till|pass) ·
nusxa soni · kesish · holati · oxirgi chop etish`.
Marshrutlash: menyu kartasidagi `printer` maydoni, bo'lmasa sex→printer
xaritasi.

---

## 4 · Tizim to'liq ishlashi uchun nima ULANISHI kerak

Siz aynan shuni so'radingiz: _"tizim to'liq ishlashi uchun nimalar to'liq
ulanish kerak, misol: api, yana nima narsalar bo'ladi?"_

API — bu zanjirning **bitta bo'g'ini**. To'liq ro'yxat:

### 4.0 Avval — o'lchangan haqiqat

Bu raqamlar taxmin emas, shu qutida o'lchangan:

| O'lchov                  | Qiymat                                                            | Nimani anglatadi                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API o'tkazuvchanligi** | **~37 so'rov/sekund**                                             | `php artisan serve` — bitta oqimli **ishlab chiqish serveri**. O'nta parallel so'rov 0.27 s, bittasi 27 ms. Olti terminalli bitta filial + KDS buni to'ldiradi. |
| `opcache.enable_cli`     | **Off**                                                           | har bir so'rov freymvorkni qaytadan kompilyatsiya qiladi                                                                                                        |
| PostgreSQL               | 18.4, `shared_buffers` **128 MB**, `archive_mode` **off**         | PITR yo'q — eng yomon holatda **24 soatlik chek** yo'qoladi                                                                                                     |
| Redis                    | parol **yo'q**, `maxmemory 0`, `noeviction`, `appendonly no`      | qayta ishga tushsa **bir soatlik navbat yo'qoladi** — jumladan yuborilmagan fiskal cheklar va chop etilmagan chiptalar                                          |
| Zaxira nusxa             | kuniga, tekshirilgan — lekin **shu diskda**                       | disk yo'qolsa restoranning butun moliyaviy tarixi yo'qoladi                                                                                                     |
| Tashqi HTTPS             | telegram · soliq.uz · eskiz · paycom — hammasi **ochiq**, < 0.5 s | integratsiyalarni boshlashga to'siq yo'q                                                                                                                        |
| Vaqt                     | Asia/Tashkent, NTP faol, PG sessiyasi UTC'ga qadalgan             | **to'g'ri** — `business_date` va fiskal vaqt shunga tayanadi                                                                                                    |

**TLS — muhim operatsion tafsilot.** Sertifikat bu qutida emas, chekka
proxy'da tugatiladi; bu mashina LAN ichida (`40.47.1.225`). Venue
planshetlari `https://40.47.1.225` ga **ichki CA** bilan kiradi
(`/home/pos/mypos-setup/tls`, 2036 gacha). **Bu CA har bir planshetga
o'rnatilishi shart** — aks holda sessiya cookie'si `Secure` bo'lgani uchun
brauzer uni **jimgina tashlab yuboradi** va kirish ishlamaydi, hech qanday
xato ko'rsatmasdan. Bu POS'ni venue'ga chiqarishning birinchi qadami.

### 4.1 Ma'lumot va ish qatlami

| #   | Nima                          | Nega kerak                                           | Bugun                                                                     | Qilinadi                                                                        |
| --- | ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | **PostgreSQL 18.4**           | yagona haqiqat manbai                                | ✅ ishlayapti (baza `mypos`)                                              | RLS, `business_date`, ~40 yangi jadval, **WAL arxivi (PITR)**, `shared_buffers` |
| 2   | **Redis 7**                   | kesh, sessiya, navbat, rate-limit, pub/sub           | ⚠️ ishlayapti, **parolsiz va chidamsiz**                                  | parol, `maxmemory` + siyosat, `appendonly`                                      |
| 3   | **Navbat ishchisi** (Horizon) | fiskal qayta urinish, chop etish, eksport, push      | ⚠️ oddiy `queue:work`; Horizon **ko'rinmaydi** (nginx'da `/horizon` yo'q) | Horizon uniti + marshrut — aks holda yiqilgan fiskal ish **ko'rinmas** bo'ladi  |
| 4   | **Rejalashtiruvchi**          | `events:relay` har daqiqada                          | ❌ **umuman ishlamaydi** — yagona timer eski `/var/www/mypos` ga qaraydi  | P0 da tuzatiladi                                                                |
| 5   | **Obyekt saqlash** (S3/MinIO) | taom rasmlari, eksport, PDF                          | ⚠️ `flysystem-aws-s3` o'rnatilgan, ishlatilmagan                          | drayver ulanadi                                                                 |
| 6   | **Reverb (websocket)**        | stop-list 1 soniyada, KDS, tasdiqlar                 | ❌ sozlangan (port 8020, real kalit), **jarayon yo'q**                    | unit + nginx `Upgrade` + Echo mijozi                                            |
| 6b  | **`/metrics` endpointi**      | Prometheus konfiglari uni **so'raydi**, lekin u yo'q | ❌                                                                        | monitoring uchun birinchi qadam                                                 |

### 4.2 Venue ichidagi qurilmalar

| #   | Nima                         | Nega kerak                                                           | Qilinadi                                                                                              |
| --- | ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 7   | **POS planshetlari**         | ofitsiant ish joyi                                                   | juftlash bor; oflayn do'kon kerak                                                                     |
| 8   | **KDS devor ekrani**         | oshxona                                                              | ekran bor, realtime yo'q                                                                              |
| 9   | **Termal printerlar (80mm)** | O'zbekistonda oshxona qog'oz chek bilan ishlaydi                     | printer jadvali, marshrutlash, navbat                                                                 |
| 10  | **Lokal print agenti**       | **arxitektura talabi** — brauzer 9100-portga TCP socket ocha olmaydi | kassada kichik demon: API/websocket'dan ish oladi, ESC/POS gapiradi, printer o'chsa navbatda saqlaydi |
| 11  | **Naqd yashigi**             | printer orqali `ESC p` impulsi bilan ochiladi                        | print agentida                                                                                        |
| 12  | **Shtrix skaner**            | qabul qilish, chakana                                                | HID klaviatura — drayver kerak emas, faqat fokus mantiqi                                              |
| 13  | **Tarozi**                   | vazn bo'yicha sotiladigan tovar                                      | serial/USB — 2-fazada                                                                                 |
| 14  | **Mijoz displeyi**           | ixtiyoriy                                                            | 2-fazada                                                                                              |
| 15  | **Tarmoq**                   | printerlarga statik IP, planshetlarga Wi-Fi                          | **UPS** (kassa + router + printer) va 4G zaxira — kuchlanish uzilishi real                            |

### 4.3 Pul yo'llari

| #   | Nima                                             | Tashqi bog'liqlik                                                               | Bloklaydimi                                       |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| 16  | **Fiskal modul (onlayn-kassa) + SERTIFIKATSIYA** | qonuniy majburiy, tashqi tomondan boshqariladi, **eng uzun ustun**              | **HA** — sertifikatsiyasiz qonuniy chek chiqmaydi |
| 17  | **Click**                                        | merchant hisobi, API kaliti, imzo tekshiriladigan webhook, qaytarish API'si     | qisman                                            |
| 18  | **Payme**                                        | shu                                                                             | qisman                                            |
| 19  | **Uzum**                                         | shu                                                                             | yo'q                                              |
| 20  | **Uzcard/Humo ekvayring**                        | bank terminali — **qaror kerak**: integratsiya qilinganmi yoki alohida turadimi | qisman                                            |

### 4.4 Qonuniy va soliq

| #   | Nima                          | Izoh                                        |
| --- | ----------------------------- | ------------------------------------------- |
| 21  | **Didox** — EHF               | e-hisob-faktura, yetkazib beruvchilar bilan |
| 22  | **soliq.uz** — QQS            | deklaratsiya oynasi, rejalashtirilgan ish   |
| 23  | **1C eksport**                | ko'p restoran hisobini o'sha yerda yuritadi |
| 24  | **STIR/INN, kassir ro'yxati** | fiskal modul talab qiladi                   |

### 4.5 Xabar yuborish

| #   | Nima                                 | Nega                                                       |
| --- | ------------------------------------ | ---------------------------------------------------------- |
| 25  | **SMS shlyuz** (Eskiz / Play Mobile) | OTP, bron eslatmasi, kampaniya                             |
| 26  | **Telegram Bot API**                 | mehmon boti + **admin bildirishnoma Chat ID** (ZimZim #17) |
| 27  | **Push** (FCM/APNs)                  | xodimlar ilovasi — tasdiq **30 soniyada** yetishi shart    |

### 4.6 Kanallar

| #   | Nima                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------- |
| 28  | **Agregator webhooklari** — Yandex Eats, Uzum Tezkor, Wolt: har biriga adapter, bitta ichki buyurtma shakli |
| 29  | **O'z sayti / PWA** — tenant subdomeni, TLS                                                                 |

### 4.7 Operatsion

| #   | Nima                                                                                                                                                                       | Bugun                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 30  | **TLS + DNS** (tenant subdomenlari uchun wildcard)                                                                                                                         | ⚠️ bitta domen                                  |
| 31  | **Zaxira nusxa** — `pg_dump` + PITR, tashqi joyda, va **sinovdan o'tgan tiklash**                                                                                          | ⚠️ cron bor, tiklash sinalmagan                 |
| 32  | **Monitoring va ogohlantirish** — uptime, API kechikishi, navbat chuqurligi, sinxron qoldiq, **printer o'chdi**, fiskal navbat, har bir terminal heartbeat'i → Telegram'ga | ⚠️ Prometheus/Grafana konfiglari bor, ulanmagan |
| 33  | **Log yig'ish va saqlash muddati**                                                                                                                                         | ⚠️ journald                                     |
| 34  | **Vaqt sinxronizatsiyasi (NTP)**                                                                                                                                           | chek vaqti va `business_date` shunga tayanadi   |
| 35  | **Xato kuzatuvi** (Sentry-ga o'xshash)                                                                                                                                     | ❌                                              |
| 36  | **Staging muhiti + CI darvozasi**                                                                                                                                          | ⚠️ CI bor, staging yo'q                         |

**POS'ni real smenada bloklaydiganlar:** 1, 2, 3, 4, 6, 9, 10, 11, 15, 16.
Qolganlari mahsulotni to'liq qiladi, lekin birinchi smenani to'smaydi.

### 4.8 Ikkita arxitektura qarori — bu yerda hal bo'ladi

**1 · Har bir integratsiya — chidamli navbat + ko'rinadigan holat chipi,
sotuv yo'lidagi sinxron chaqiruv emas.** `ENGINEERING.md §4.4` ning qoidasi:

> _"A restaurant with a dead fiscal module still serves dinner; the system
> queues the paperwork and says so."_

Fiskal, chop etish, Click/Payme webhooklari, Didox, SMS — hammasi bitta
naqsh. **Bitta mexanizm quriladi va olti marta ishlatiladi.**

**2 · Venue uskunasi `pos.terminals.settings` da yashaydi, `.env` da emas.**
Bu ustun allaqachon bor va migratsiyada izohi ham yozilgan: _"printer
routing, drawer, fiscal serial, rounding, per-role discount limits"_.
Bu multi-tenant jihatdan **to'g'ri joy** — har bir restoranning o'z uskunasi,
o'z merchant ID'si va o'z fiskal seriyasi bor. `config/services.php` da
hozir faqat Postmark/Resend/SES/Slack bor; birinchi real provayder
qo'shilishidan oldin **har bir tenant uchun ma'lumot saqlash joyi**
loyihalanishi kerak.

### 4.9 Fiskal — eng kichik haqiqiy qadam

Sertifikatsiya uzoq, lekin **birinchi yetkazib beriladigan qism kichik**:
sozlash ustasida ulanish tekshiruvi allaqachon chizilgan — modul raqami
kamida 8 raqam, va muvaffaqiyatda _"Fiskal modul ulandi · soliq.uz javob
berdi"_. Bu **probe** chek yuborishdan oldin ham chiqariladi.

Oflayn qoidasi ham dizaynda yozilgan va u qonuniy o'zak:

> _"Oflayn holatda chek baribir chop etiladi, fiskal belgi aloqa qaytganda
> qo'shiladi. Bu qonuniy — chek fiskal modulga 24 soat ichida yetishi kerak."_

Ya'ni fiskal navbatning SLA'si aniq: **24 soatlik shift**, ko'rinadigan
navbat chuqurligi, backoff bilan qayta urinish, va oyna yopilishidan oldin
**ogohlantirish**.

### 4.10 Xabar berish kanali — Telegram, pochta emas

Dizayn Sozlamalar → Bildirishnoma tabida **Telegram guruh chat ID** so'raydi
(`/^-?\d{6,}$/`) va oltita hodisa kalitini beradi: kassa farqi 50 000 dan
oshsa · xomashyo 2 kundan kam qolsa · chegirma 15% dan oshsa · yuborilgandan
keyin bekor qilinsa · kunlik reja bajarilmasa · smena ochilib-yopilsa.

Bu **eng arzon haqiqiy ogohlantirish yo'li** — faqat bot tokeni kerak, SMS
shartnomasi ham, SMTP ham kerak emas. Va u operatsion ogohlantirishlarni ham
ko'tarishi kerak: hozir `MAIL_MAILER=log`, ya'ni salomatlik va zaxira nusxa
xabarlari **hech qayerga bormaydi**.

---

## 4A · Har bir qatlam qanday quriladi

Siz _"frontend, backend, api, database qanday qilinadi"_ deb so'radingiz.
Mana aniq usul — har bir kesimda shu naqsh takrorlanadi.

### Database — migratsiya, keyin hech qachon tahrir emas

```
apps/api/Modules/{Modul}/database/migrations/YYYY_MM_DD_HHMMSS_*.php
```

- Har bir jadval **o'z schema'sida** (`orders.orders`, `menu.menu_items`) —
  ADR-0010.
- Ustun tartibi: `id` → `public_id` (tashqi ko'rinadigan bo'lsa) → `tenant_id`
  → `branch_id` → biznes ustunlari → `business_date` → vaqt belgilari.
- Pul — `unsignedBigInteger`, izohda **doim** `Amount in tiyin (1 UZS = 100 tiyin)`.
- Ko'rinadigan matn — `jsonb {uz,ru,en}` + `HasTranslations`.
- Har bir tenant jadvaliga RLS siyosati va `force row level security`.
- Migratsiya **oldinga ham, orqaga ham** toza yuradi; `down()` yozilmagan
  migratsiya qabul qilinmaydi.
- Chiqqan migratsiya **hech qachon tahrirlanmaydi** — yangisi yoziladi.
- Har bir jadvalga `factory` va seeder — CI seeder'ni ham yuritadi.

### Backend — modul, shartnoma, servis

```
Modules/{Modul}/app/
  Models/          Eloquent, BelongsToTenant + BelongsToBranch traitlari
  Services/        biznes mantiqi — kontroller emas
  Http/Controllers/  yupqa: validatsiya → servis → resurs
  Http/Requests/   validatsiya va ruxsat
  Http/Resources/  javob shakli
  Providers/       binding va route
```

**Uchta qat'iy qoida:**

1. **Modul boshqa modulning jadvaliga tegmaydi.** Faqat
   `app/Contracts/{Modul}/**` interfeysi orqali. `ModuleBoundaryTest` buni
   CI'da yiqitadi. POS shu sababli `App\Contracts\Orders\BillRegistry` va
   `App\Contracts\Finance\TillLedger` orqali gapiradi — va biz uchinchisini
   qo'shamiz: `App\Contracts\Kitchen\TicketWriter`.
2. **Hosila raqam faqat serverda.** Jami, QQS, xizmat haqi, yaxlitlash,
   ball, marja — hech qachon mijozdan qabul qilinmaydi.
3. **To'rtta amal bitta tranzaksiyada:** oshxonaga yuborish · to'lovni olish ·
   bo'lish/birlashtirish · smenani yopish.

### API — shartnoma birinchi

```
POST   /api/v1/pos/bills                      yaratish
GET    /api/v1/pos/bills/{bill}               o'qish
POST   /api/v1/pos/bills/{bill}/lines         qator qo'shish
POST   /api/v1/pos/bills/{bill}/actions/send  holat o'zgarishi
```

- Holat **hech qachon** `PATCH {status}` bilan o'zgarmaydi —
  `POST /actions/{name}`.
- Har bir mutatsiyada `Idempotency-Key` **majburiy** (yo'q → 400; bir xil
  kalit boshqa tana bilan → 409).
- Bitta xato konverti: `code` + `message_uz/ru/en` + `field` + `retryable`.
- Kursor sahifalash oqim ro'yxatlarida: `{data, next_cursor, has_more}`.
- Har bir marshrutda Spatie ruxsati yoki hujjatlashtirilgan istisno —
  `ModuleRouteGuardTest` tekshiradi.
- **OpenAPI hujjati.** Repoda hozir hech qanday mashina o'qiydigan
  shartnoma yo'q (`docs/api/` da faqat `README.md`), `ENGINEERING.md §3.1`
  esa `packages/api-client` ni **OpenAPI'dan generatsiya qilish**ni aytadi.
  P1 da `docs/api/openapi.yaml` tug'iladi va CI uni marshrutlar bilan
  solishtiradi — shunda mijoz tiplari qo'lda yozilmaydi va drift bo'lmaydi.
- Har bir endpoint uchun Feature testi: muvaffaqiyat · ruxsat rad etilishi ·
  tenant izolyatsiyasi · **xato yo'li**.

### Realtime — hodisa, kanal, mijoz

```php
class StopListChanged implements ShouldBroadcast {
    public function broadcastOn(): Channel {
        return new PrivateChannel("branch.{$this->branchId}.stoplist");
    }
}
```

- Yozish **faqat REST orqali** — validatsiya va idempotentlik bitta joyda.
  Websocket faqat server→mijoz.
- Kanal darajasi **filial**, tenant emas.
- Mijozda `packages/realtime` — obuna, qayta ulanish, va uzilganda
  POS holat qatoridagi _Aloqa_ nuqtasi qizaradi.

### Frontend — server qobiq, klient asbob

```
apps/web/src/app/(pos)/pos/
  page.tsx          server komponent — sessiya, terminal, boshlang'ich ma'lumot
  pos-server.ts     apiGet — server tomonda
  pos-data.ts       tiplar va fixture — klient xavfsiz
  terminal.tsx      klient komponent — butun interaktivlik
```

- **Hozirgi bo'linish saqlanadi** (`*-data.ts` / `*-server.ts`) — u ishlaydi
  va sabab bilan qurilgan.
- Yozish yo'li **yangi**: `packages/api-client` — tiplangan mutatsiyalar,
  `Idempotency-Key` avtomatik qo'yiladi, xato konvertini tushunadi.
  TanStack Query allaqachon o'rnatilgan va provayderi ulangan — faqat
  ishlatilmagan.
- Optimistik yangilanish: amal → lokal holat → navbat → server → solishtirish.
- Har bir ro'yxat **to'rt holatda**: skelet · bo'sh · xato · yuklangan.
  Bu `AsyncList` primitivida majburlanadi, har bir ekranda emas.
- Holat yorlig'i **hech qachon** ekranda yozilmaydi —
  `stateLabel(state, audience)` orqali.

**Diqqat — i18n hozir noto'g'ri joyda.** Haqiqiy katalog
`apps/web/src/i18n/{uz,ru,en}.ts` da (har biri ~1 320 qator), umumiy
`packages/i18n/messages/*.json` da esa atigi **71 qator** — ya'ni u
amalda ishlatilmaydi. Holat satrlari `uz.ts` da **14 marta** takrorlanadi,
va `tables-server.ts` da yana bitta 10 yozuvli `TABLE_STATE` xaritasi bor.
P1 da katalog `packages/i18n` ga ko'chadi va `stateLabel()` yagona manba
bo'ladi — aks holda POS, KDS va mehmon uch xil so'z aytadi.

### Test — har bir kesimda to'rt daraja

| Daraja       | Nima tekshiradi                                               |
| ------------ | ------------------------------------------------------------- |
| Unit         | hisob-kitob: QQS, xizmat haqi, yaxlitlash, chiqim foizi       |
| Feature      | endpoint: muvaffaqiyat, ruxsat, tenant, **xato yo'li**        |
| Architecture | modul chegarasi, `tenant_id`, marshrut himoyasi, RLS siyosati |
| E2E          | ofitsiantning o'n qadamli oqimi, brauzerda                    |

---

## 5 · POS qurish rejasi — o'n to'rt vertikal kesim

Har bir kesim **baza → API → realtime → frontend → qurilma** bo'ylab kesadi,
ya'ni har birini **ko'rsatib bo'ladi**. Qatlam-qatlam emas.

Har bir kesim **odam bajaradigan ish** bilan tugaydi — tekshiruv ro'yxati
bilan emas. Tartib ataylab shunday: **to'rtinchi kesimda ofitsiant haqiqiy
buyurtma oladi**, ettinchisida pul harakat qiladi, sakkizinchisida qog'oz
chiqadi.

### P0 · Xavfsiz ish maydoni

Kodi yozilgan, hech qachon yurgizilmagan. `provision.sh` trafikka tegmaydi
va 13 ta crash-loop qilayotgan unitni o'chiradi.

```bash
sudo bash /home/pos/srcp/infrastructure/server/provision.sh
sudo srcp-deploy --build --migrate
sudo srcp-health
```

Ustiga: **php-fpm** (hozirgi `artisan serve` ~37 so'rov/sekund), Horizon va
uning marshruti, rejalashtiruvchi timeri, `srcp-reverb.service`, Redis
paroli va `appendonly`, WAL arxivi, zaxira nusxaning **tashqariga**
chiqarilishi.

**Ko'rsatiladi:** repo daraxtini tahrirlash jonli tizimga tegmaydi ·
`php artisan test` mahalliy ishlaydi · `systemctl --failed` bo'sh.

---

### P1 · Shartnoma qatlami _(UI yo'q)_

Bitta xato konverti (kod + uz/ru/en + `field` + `retryable`).
`IdempotencyGuard` `Modules/Pos` dan yadroga ko'chadi va **har bir yozish
marshrutida** ishlaydi + arxitektura testi. 13 holatli `OrderStateMachine`,
`PATCH {status}` o'chadi. `business_date` (filial sozlamasi bilan),
`branch_counters`. RLS. `TENANCY_REQUIRE_TENANT` yopiq holatga. OpenAPI
hujjati tug'iladi.

**Ko'rsatiladi:** _Yuborish_ ni uch marta bosish — **bitta** chek; noto'g'ri
o'tish uch tilda 409 qaytaradi.

---

### P2 · Planshet kassaga aylanadi

Terminal juftlash (8 belgili kod), qurilma tokeni, **kutish ekrani** —
jonli soat, filial nomi, `POS-3 · Chilonzor`. `PosDatabaseSeeder`
ro'yxatdan o'tadi. Ichki CA planshetga o'rnatiladi.

**Ko'rsatiladi:** yangi planshet sakkiz belgi teradi va **haqiqiy API'ga**
qarshi, php-fpm ustida, rejalashtiruvchi ishlab turgan holda kassaga
aylanadi.

---

### P3 · Kassada kim turibdi

Xodim kartalari (smenadagilar, ism, rol chipi, stollari, sotuvi) → PIN
(4 raqam, 180 ms da avtomatik, **3 xato → menejer**) → zal.
PIN **smenani ham ochadi**, nominal bo'yicha sanash bilan. Smena endi
**terminalga** biriktiriladi (`terminal_id` + `business_date`).
Qulflash va foydalanuvchi almashtirish. `0000` olib tashlanadi.

**Ko'rsatiladi:** ofitsiant kartasini bosadi, to'rt raqam teradi, pulni
nominal bo'yicha sanaydi — va holat qatorida uning ismi va smena boshlanishi
turadi.

---

### P4 · Ofitsiant haqiqiy buyurtma oladi _(loyihaning pulini qaytaradigan kesim)_

Zal (zona relsi, stol kartalari, 3px chap qirra), buyurtma turi (zal / olib
ketish / yetkazish + zona), menyu (kategoriya relsi, taom to'ri, **bir
teginishda qo'shish**), modifikator varag'i (porsiya, modifikator, izoh),
savat (**mehmon segmenti**, to'rt hisob, stepper), jamlanma **serverda**
(QQS, xizmat haqi faqat zalda, yetkazish narxi QQS'dan tashqarida).
`packages/api-client` shu yerda tug'iladi.

**Ko'rsatiladi:** ofitsiant `Zal` ni tanlaydi, 12-stolni bosadi, **ikki
mehmon va ikki hisob** bo'ylab olti qator qo'shadi — va ikkala hisob ham
to'g'ri jamlanma bilan **serverda mavjud**. Yo'lda birorta fixture yo'q.

---

### P5 · Oshxonaga yuborish — bitta tranzaksiya, jonli KDS

`App\Contracts\Kitchen\TicketWriter`. `send()` ichida bitta tranzaksiyada:
qator holatlari, sex bo'yicha guruhlangan cheklar, **uzluksiz raqam aynan
shu yerda** ajratiladi, audit qatori. Repoda **birinchi broadcast**:
`branch.{id}.kitchen` va `branch.{id}.orders`, Echo mijozi. KDS ekrani
server komponentidan obuna bo'lgan klient taxtaga aylanadi — sex tablari,
`accepted`, pozitsiya bo'yicha `ready`, 6/10 daqiqa kechikish, to'liq
raqamli klaviatura.

**Ko'rsatiladi:** ofitsiant 1-hisobni yuboradi, **№25** bir vaqtda hisobda
chip bo'lib va grill taxtasida karta bo'lib paydo bo'ladi — va oshpazning
_Qabul qildim_ i planshetdagi chipni **sahifa yangilanmasdan** amber qiladi.

---

### P6 · Stop-list — oshxonada 86, bir soniyada hamma planshetda

Filialga bog'langan `stop_list` (`stopped_by`, `reason`, `cleared_at`,
`stopped_until` saqlanadi), `branch.{id}.stoplist`, `MenuCache` broadcast
bilan bir vaqtda versiyalanadi, KDS'dagi 86 varag'i.

**Ko'rsatiladi:** oshpaz devor ekranida Mantini belgilaydi va **ikki
ofitsiant smena o'rtasida** kartaning punktirga aylanishini hech narsaga
tegmasdan ko'radi.

---

### P7 · To'lov — tender, yaxlitlash, choypuli, qaytim

Usullar ajratiladi (Uzcard·Humo 1.2% / Visa·MC 2.4% / Click 1.5% /
Payme 1.5% / naqd / kompaniya), `tip`, naqdga **1000 ga yaxlitlash** va
farqning saqlanishi, qismli to'lov, qaytim.

**Ko'rsatiladi:** hisob naqd va karta bilan, 10% choypuli bilan yopiladi;
kassadagi kutilgan summa **aynan yaxlitlangan naqd miqdoriga** siljiydi va
smena jamlari **tiyingacha** to'g'ri keladi.

---

### P8 · Qog'oz va uskuna

`printers` jadvali, sex→printer marshrutlash (`kitchen_stations` ga
`printer_id` va `branch_id` migratsiyasi), **lokal print agenti**, chidamli
chop etish navbati, naqd yashigi impulsi (`ESC p 0`), serverda render
qilinadigan 80 mm mijoz cheki va oshxona cheki, va §3.9 dagi holat qatori.

**Ko'rsatiladi:** oshpaz **qog'ozdan** ishlaydi va mehmon chek bilan
chiqadi; printer o'lsa, ofitsiant buni **oshxonadan emas, holat qatoridan**
biladi.

---

### P9 · Tasdiqlar — bekor, chegirma, sovg'a

Foiz tanlagich + sabab + rol shifti (ofitsiant 0% · katta 5% · menejer 20%),
`voided` / `refunded` / `comped` uchta alohida hodisa, noaniq tokenlar
summaga bog'langan, va **binoda bo'lmagan menejer**: tasdiq marshruti
`pos.session` ortidan chiqadi.

**Ko'rsatiladi:** ofitsiant chegirma so'raydi, menejer **avtostoyankadan**
tasdiqlaydi, va hisob planshetda o'zgaradi — hech kim hech qayerga
yurmaydi.

---

### P10 · Kunni yopish

Nominal bo'yicha sanash, inkassatsiya, X-hisobot (yopmaydi), Z-hisobot
(aylanma → to'lov turlari → naqd kassa → tuzatishlar), farq nolga teng
bo'lmasa **yopilmaydi**, 20 000 da menejer PIN'i, 50 000 da egaga xabar,
smena qulfi va topshirish.

**Ko'rsatiladi:** kassir pulni sanaydi, ekran **tiyingacha** rozi bo'ladi,
va Z ikkita imzo joyi bilan chop etiladi.

---

### P11 · Fiskallashtirish — chek qonuniy bo'ladi

Ulanish probasi (modul raqami ≥ 8 raqam, _"soliq.uz javob berdi"_), fiskal
drayver + bitta haqiqiy OFD, backoff bilan navbat va **24 soatlik oyna**,
`fiscal_pending` kassada, korreksiya va dublikat (`NUSXA` muhri bilan),
menyu kartasida **PLU kodi**.

**Qoida:** o'lik fiskal modul buyurtmani **hech qachon to'smaydi**.

**Ko'rsatiladi:** mehmon cheki tekshirib bo'ladigan fiskal belgi bilan
chiqadi, va restoran **qonuniy ravishda** smenani yopa oladi.

---

### P12 · Oflayn — Wi-Fi o'chsa ham sotiladi

Lokal do'kon (menyu, narx, stol, stop-list), navbat — mijoz UUID'si ham
lokal id, ham idempotent kalit. `POST /v1/sync/batch` → allaqachon yozilgan
`replayBatch()`. Olti konflikt turi bitta `ConflictException` ortida →
409 + `conflict_kind` + `options[]`. Sinxron drawer va konflikt ekranlari.

**Ko'rsatiladi:** ofitsiant **o'lik tarmoqda** stolni yakunlaydi va router
qaytganda kassa o'zini solishtiradi — **hech narsa yo'qolmaydi va hech
narsa ikkilanmaydi**.

---

### P13 · Qarzga sotish va filial solishtiruvi

Mijoz balansi, limit, limitdan oshsa menejer tasdig'i, _"balansiga yozildi ·
pul kelmadi"_, va Z-hisobotda sotuv bilan naqd o'rtasidagi farqni
**ekranda tushuntiruvchi** qator.

**Ko'rsatiladi:** doimiy mijoz tushlik uchun imzo qo'yadi, Z farqni
o'zi tushuntiradi, va **buxgalter parallel Excel yuritishni to'xtatadi**.

## 6 · POS'dan keyin

`docs/PLAN-2026-08.md` dagi tartib davom etadi: ombor va retsept →
buxgalteriya va kun yopish → hujjatlar → konsolning qolgan modullari →
mehmon kanallari → marketplace.

POS tugagach **bitta filialda bir hafta ishlatiladi**, keyin davom etamiz —
`ENGINEERING.md §7` ning maslahati ham shu.

---

## 7 · Halol muddat

| Blok                                       | Muhandis-hafta |
| ------------------------------------------ | -------------: |
| P0 — xavfsiz maydon                        |            0.5 |
| P1 — shartnoma qatlami                     |          2.5–3 |
| P2–P3 — terminal, PIN, smena               |            2–3 |
| **P4 — ofitsiant buyurtma oladi**          |        **4–5** |
| P5–P6 — oshxonaga yuborish, KDS, stop-list |            4–5 |
| P7 — to'lov                                |          2.5–3 |
| P8 — qog'oz, print agenti, uskuna          |            4–5 |
| P9–P10 — tasdiqlar, kunni yopish           |            3–4 |
| P11 — fiskal                               |            2–3 |
| P12 — oflayn                               |            3–4 |
| P13 — qarz va solishtiruv                  |          1.5–2 |
| **POS jami**                               |      **29–37** |

Bitta tajribali full-stack muhandis uchun. Parallel ishlansa (backend /
frontend / print agenti) — **3–4 kalendar oy**.

**Fiskal sertifikatsiya P10 da emas, P1 da boshlanadi** — u eng uzun ustun
va uni muhandislik qisqartirmaydi.

---

## 8 · Boshlashdan oldin kerak bo'lgan qarorlar

### 8.1 Ma'lumot modeliga yoziladi — keyin o'zgartirish qimmat

1. **O'n bitta poydevor qarori** — `docs/PLAN-2026-08.md §3`. Eng muhimi
   to'rttasi: tiyin qoladi · bigint qoladi · RLS qo'shiladi · holat zanjiri
   shartnomadan olinadi. _(3-kesimdan oldin hal bo'lishi shart.)_

2. **Xizmat haqi va QQS hokimiyati.** Tasdiqlang: 10% faqat zalda, olib
   ketish va yetkazishda **nol**; QQS 12% narx ichida; **yetkazish narxi QQS
   bazasidan tashqarida**. Va alohida savol: raqobatchidagi qo'lda
   qo'shiladigan `XIZMAT XAQI` menyu qatori avtomatik foiz bilan **birga**
   yashaydimi? Bu chek qatorlari jadvalini o'zgartiradi.

3. **Chakana tovarlar** (sigaret, zajigalka, salfetka) — ular 10% xizmat
   haqini ko'taradimi va oziq-ovqat bilan bir xil QQS rejimidami? Hozir
   ular **bir xil savat, bir xil xizmat haqi, bir xil QQS** dan o'tadi, va
   real venue uchun bu deyarli aniq noto'g'ri. Hech bir qaror hujjatida yo'q.

4. **Naqd yaxlitlash.** Shartnoma: **jami** summa 1 000 ga yaxlitlanadi,
   farq `Payment.rounding` ga yoziladi va kutilgan naqdga qo'shiladi. Kod:
   **qaytim** 1 so'mgacha pastga yaxlitlanadi. Shartnoma yutadimi?
   Va ikki chegara: **20 000** (menejer PIN'i) va **50 000** (egaga xabar).

5. **Chek raqamlash.** Filial va ish kuni bo'yicha uzluksiz ketma-ketlik,
   **yuborish paytida** ajratiladi (tashlab ketilgan qoralama raqamni
   yoqmasligi uchun). Va soft-delete bilan qanday kelishadi — hozir u
   raqamni **butunlay yoqib yuboradi**, soliq auditi esa uzluksizlikni
   talab qiladi.

6. **Idempotentlik sarlavhasi nomi** — repo `X-Pos-Local-Id` / `X-Pos-Seq`
   yoki shartnoma `Idempotency-Key` / `X-Terminal-Id`? G'olib qaysi bo'lsa,
   u **POS'dan tashqaridagi har bir yozish marshrutiga** ham tarqaladi —
   u yerda hozir idempotentlik **umuman yo'q**. Hozir arzon, keyin har bir
   mijoz uchun buzuvchi o'zgarish.

7. **Ko'p filial manzillari.** Stol yorliqlari **tenant** bo'yicha noyob,
   filial bo'yicha emas — ya'ni Chilonzor ham, Yunusobod ham `A-1` stoliga
   ega bo'la olmaydi. Zallarda ham shu. Ikki venue jonli bo'lgandan keyin
   tuzatish — yuk ostidagi ma'lumot migratsiyasi. Bog'liq savol: **wildcard
   sertifikat yo'q**, ya'ni tenant subdomenlari chekkada bloklangan —
   **ikkinchi restoranning URL'ini birinchisi ochilishidan oldin** hal
   qilish kerak.

### 8.2 Tashqi shartnoma va uskuna

8. **Fiskal provayder** — qaysi OFD, qanday tijorat shartlari bilan, har bir
   kassaga bitta modulmi yoki har bir filialga? Sertifikatsiya munosabatini
   kim yuritadi? **Ro'yxatdagi yagona narsa muddati oylar bilan o'lchanadi**
   va u 10-kesimda emas, **1-kesim davomida** boshlanishi kerak.

9. **Ekvayring** — kassa yonida turadigan **alohida** bank terminali (bu
   repoda PCI qamrovi yo'q, tender qo'lda qayd etiladi) yoki **integratsiya
   qilingan** terminal (tezroq, xato kamroq — lekin PCI-DSS majburiyatini
   shu repoga tortadi, `SECURITY.md` esa loyihani unga allaqachon
   bog'lagan)? Bu 6-kesimdagi qurilma ishini belgilaydi va keyin arzon
   o'zgarmaydi.

10. **Printer parki** — qaysi model? ESC/POS 80 mm, tarmoq porti 9100 —
    Epson TM-T20/T88 yoki Xprinter mos keladi. Har bir printerga statik IP
    yoki DHCP rezervatsiyasi kerak.

11. **PIN siyosati** — uch xato + menejer tiklashi (dizayn va shartnoma) yoki
    besh xato + 15 daqiqada o'zi ochilishi (hozirgi kod)? Va **PIN o'zi
    odamni aniqlaydimi**, yoki avval xodim kartasi bosiladimi? Hozir server
    `user_id` talab qiladi; yalang'och PIN esa har bir urinishda **har bir
    xodimga qarshi bcrypt** solishtirishni anglatadi.

12. **Menejer telefondan tasdiqlaydimi?** Bugun tasdiq **faqat juftlangan
    kassadan** berilishi mumkin — ya'ni telefondagi menejer roli
    **imkonsiz**. Telefon juftlangan terminalga aylanadimi, yoki tasdiq
    marshrutlariga `method=remote` uchun parallel yo'l qo'shamizmi?

### 8.3 Operatsion

13. **P0 uchun `sudo`** — uchta buyruq, trafikka tegmaydi.

14. **24 soatlik RPO va sinovdan o'tmagan tiklash bilan ochamizmi?**
    Zaxira nusxa ishlaydi va tekshiriladi, lekin **baza bilan bir xil
    diskda** turadi. Disk yo'qolsa tushum ham, zaxira ham birga ketadi.

15. **Birinchi venue** — POS'ni qaysi real restoranda sinaymiz? Bir haftalik
    ishlatish rejaning bir qismi, qo'shimcha emas.
