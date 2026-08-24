# Lokal print agenti — dizayn

> Holat: **kelishilmoqda**. Til va joy tanlandi (10-bo'lim); kod yozilmagan va
> foydalanuvchi yangi ilova ochishni tasdiqlagunicha yozilmaydi.
> Server tomoni (`kitchen.printers`, `kitchen.print_jobs`, navbat va render)
> allaqachon tayyor va bu yerda tasvirlangan protokolni gapiradi.

## 1. Nima uchun umuman agent kerak

Printer restoran ichidagi lokal tarmoqda, `10.20.0.11:9100` kabi **xususiy**
manzilda turadi. Laravel esa ma'lumot markazida. Ular orasida NAT bor, ya'ni
server printerga hech qachon ulana olmaydi — yo'nalish faqat bitta tomonga
ochiq.

Ikkinchi sabab birinchisidan muhimroq: **printer o'lganda u veb-ishchini ushlab
turmasligi kerak**. Qog'ozi tugagan printerga ochilgan TCP soket 20–120 soniya
osilib turadi. Agar chek bosish `TenderService::settle()` ichida sinxron
bo'lsa — u butunlay `DB::transaction` ichida — bu tranzaksiya o'sha 120 soniya
ochiq qoladi va oxirida yiqilsa **to'lov orqaga qaytadi**. Karta terminalda
allaqachon o'tkazilgan bo'lsa ham. Mehmondan pul yechilgan, restoranda yozuv
yo'q, sababi esa hech kim ulamagan printer.

Shuning uchun qoida qat'iy: **ilova hech qachon printerga ulanmaydi.** U faqat
`kitchen.print_jobs` ga qator yozadi. Qolganini agent qiladi.

## 2. Agent nima emas

- **Renderer emas.** Sahifa kengligi, so'z ko'chirish, kod sahifasi, kesish
  buyrug'i — hammasi serverda (`Modules/Kitchen/app/Printing/`). Agent
  tayyor baytlarni oladi va qurilmaga yozadi. Sababi: chek matnini o'zgartirish
  uchun yuzta kassadagi dasturni yangilash kerak bo'lmasin.
- **Biznes mantiq emas.** U nima bosilayotganini bilmaydi va bilishi shart emas.
- **Server emas.** Hech qanday kiruvchi ulanishni qabul qilmaydi. Faqat chiquvchi
  HTTPS. Bu restoran tarmog'ida port ochish kerak emasligini anglatadi.

## 3. Autentifikatsiya

**Hozirgi holat (server tayyor):** agent oddiy Sanctum tokeni bilan kiradi va
filialga bog'langan **xizmat hisobi** (service account) sifatida ishlaydi.
Marshrutlar `auth:sanctum` + Spatie ruxsati bilan qo'riqlangan:

| Marshrut                                    | Ruxsat           |
| ------------------------------------------- | ---------------- |
| `POST print-jobs/claim`                     | `kitchen.update` |
| `POST print-jobs/{id}/printed` \| `/failed` | `kitchen.update` |
| `POST printers/{id}/heartbeat`              | `kitchen.update` |

Nega shunday: yadroga bitta ham o'zgarish kerak emas, `ModuleRouteGuardTest` va
`ModuleBoundaryTest` ikkalasidan ham o'tadi, `X-Tenant`/`X-Branch` allaqachon
ishlaydi va RLS ham.

**Ochiq kamchilik, ataylab yozib qo'yilgan:** `kitchen.update` ayni paytda
chiptani `ready` ga o'tkazishga ham ruxsat beradi. Ya'ni o'g'irlangan agent
tokeni oshxona taxtasini qimirlata oladi. Bu qabul qilingan xavf emas —
kelishilgandan keyin tuzatiladi:

> **Taklif ADMIN ga:** `printing.agent` degan alohida ruxsat va uni yagona
> ruxsat sifatida ushlaydigan `print-agent` roli. Uchta agent marshruti o'sha
> ruxsatga ko'chadi. Bu `RolesAndPermissionsSeeder` ga tegadi, ya'ni senda.

**Token boshqaruvi.** Har bir agent o'rnatilishi uchun alohida token; konsolda
bir marta ko'rsatiladi va qayta ko'rsatilmaydi. Bekor qilish — tokenni o'chirish.
Bitta filialda ikkita agent bo'lsa (zaxira kassa) ikkalasi ham o'z tokeni bilan
ishlaydi; navbat `for update skip locked` tufayli ularni to'qnashtirmaydi.

## 4. Protokol

Uchta chaqiruv va bitta puls. Hammasi JSON, hammasi HTTPS.

### 4.1 Ish so'rash

```http
POST /api/v1/kitchen/print-jobs/claim
{ "branch_id": 1, "agent": "chilonzor-till-1", "limit": 10 }
```

```json
{ "jobs": [ {
    "id": 4181,
    "kind": "docket",
    "reference": "ticket:912",
    "title": "A-0118 · grill",
    "copies": 1,
    "attempts": 0,
    "printer": { "id": 1, "code": "pass", "connection": "agent", "target": "10.20.0.11:9100" },
    "document": { "columns": 48, "blocks": [ ... ] },
    "escpos": "G0AbdBE..."
} ] }
```

- `escpos` — base64. ESC/POS boshqaruv belgilaridan iborat va UTF-8 emas
  (CP866), shuning uchun JSON satri sifatida omon qolmaydi.
- `document` ham yuboriladi: agent nima bosganini **odam o'qiy oladigan** shaklda
  jurnalga yozsin. Qo'llab-quvvatlash qo'ng'irog'ida so'raladigan narsa aynan shu.
- `branch_id` — agent o'zi aytadi, header'dan olinmaydi. Agent bir marta
  o'rnatiladi va umr bo'yi bitta filialga xizmat qiladi; noto'g'ri header bir
  restoranning buyurtmasini boshqasining oshxonasida bosib chiqarardi.

**Ijara, sovg'a emas.** `claim` ish topshirmaydi — **muddat bilan qarzga
beradi**. `kitchen.printing.claim_seconds` (60 s) o'tsa, navbat uni boshqa
agentga beradi. Agent o'lgan bo'lsa docket baribir bosiladi.

### 4.2 Natijani aytish

```http
POST /api/v1/kitchen/print-jobs/4181/printed
POST /api/v1/kitchen/print-jobs/4181/failed   { "error": "Qog'oz tugadi" }
```

`failed` — yakun emas. Qator saqlanadi, `attempts` oshadi, `available_at`
kechiktiriladi (5 → 10 → 30 → 60 → 120 → 300 s) va navbatga qaytadi. Faqat
`max_attempts` (8) tugagandan keyin `failed` bo'lib qoladi — **va o'chirilmaydi**,
chunki «bugun nima bosilmadi» yomon smenadan keyingi birinchi savol.

### 4.3 Tiriklik

```http
POST /api/v1/kitchen/printers/1/heartbeat
```

Har **15 soniyada**, har bir printer uchun. Server `last_seen_at` ni yozadi;
90 soniya jim qolsa printer `offline` bo'ladi (besh o't kazib yuborilgan puls —
xizmat vaqtidagi wifi uzilishi holat qatorini qizartirmasligi uchun).

**Puls xatoni tozalamaydi.** Qog'ozi tiqilgan printerning agenti bemalol puls
yuboraveradi. Faqat haqiqatan bosilgan ish (`printed`) `failing_since` ni
tozalaydi.

### 4.4 Ritm

| Holat                   | Harakat                                             |
| ----------------------- | --------------------------------------------------- |
| Navbat bo'sh            | 2 soniyada bir marta `claim`                        |
| `claim` ish qaytardi    | darhol keyingi `claim` (navbatni to'liq bo'shatish) |
| Server javob bermayapti | eksponensial: 2 → 5 → 15 → 30 s, maksimum 30 s      |
| Har 15 soniya           | har bir printer uchun `heartbeat`                   |

## 5. Qurilmaga yozish

`printer.connection` kim ulanishini emas, **qanday** ulanishini aytadi — ulanish
har doim agentdan chiqadi.

| `connection` | `target` shakli                        | Agent nima qiladi                                          |
| ------------ | -------------------------------------- | ---------------------------------------------------------- |
| `network`    | `10.20.0.11:9100`                      | Xom TCP soket (JetDirect). Baytlarni yozadi, yopadi.       |
| `agent`      | `/dev/usb/lp0`, `\\.\COM3`, `Kassa-80` | Agent turgan mashinaning o'zidagi qurilma yoki OS navbati. |

Har bir ish uchun yangi ulanish. Uzoq ushlab turilgan soket — restoran
tarmog'ida yarim soatda o'ladigan narsa va o'lganini hech kim bilmaydi.

`copies` > 1 bo'lsa agent bir xil baytlarni shuncha marta yozadi.

## 6. Kod sahifasi — `oʻ` va `gʻ` masalasi

Bu hech bir hujjatda yozilmagan va hammani chalg'itadi, shuning uchun bu yerda.

Termal printer bir vaqtda **bitta 256 belgilik sahifani** ushlaydi va u `ESC t n`
bilan tanlanadi. Hozirgi o'zbek lotin yozuvidagi `oʻ` va `gʻ` U+02BB
(MODIFIER LETTER TURNED COMMA) ishlatadi — bu Unicode davri tinish belgisi va
**hech qanday kod sahifasida yo'q**.

Ya'ni hech narsa qilinmasa, `Choyxona "Oʻzbegim"` qog'ozda `O?zbegim` bo'lib
chiqadi, va `gʻoz`, `qoʻy`, `shoʻrva` — platforma bosadigan har bir chekda
savol belgisi bilan.

Yechim serverda, `Modules/Kitchen/app/Printing/Charset.php` da, ikki bosqichda:

1. **Normalizatsiya.** `ʻ` va `ʼ` → `'`, qo'shtirnoqlar, tire, `№`, uzilmaydigan
   probel — hammasi ASCII juftiga aylanadi. `qoʻy` va `qo'y` bir xil so'z, va
   ulardan biri bosiladi.
2. **Kodlash.** Qolgani sahifaga o'tadi: `cp866` (`ESC t 17`) yoki `cp1251`
   (`ESC t 46`) kirillni saqlaydi; `ascii` (`ESC t 0`) da kirill lotinga
   o'giriladi, chunki kirill sahifasi yo'q printer real narsa va `Ko'k choy`
   savol belgilari ustunidan yaxshiroq.

Normalizatsiyadan keyin har bir belgi aynan bitta bayt egallaydi — bu muhim,
chunki so'z ko'chirish belgi soni bo'yicha ishlaydi va ikkalasi mos kelishi shart.

**Agent bunga umuman aralashmaydi.** U base64 dan chiqqan baytlarni yozadi.

## 7. Nosozliklar va ular nima bilan tugaydi

| Nima bo'ldi                                | Nima ko'rinadi                                | Nima bilan tugaydi                               |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------ |
| Qog'oz tugadi                              | `failed` + `last_error`, holat qatori `error` | Rulon almashtiriladi, keyingi urinishda bosiladi |
| Printer o'chirilgan                        | Yozish xatosi, orqaga chekinish               | Yoqilganda navbat bo'shaydi                      |
| Agent yiqildi                              | `claimed` ishlar 60 soniyada qaytadi          | Boshqa agent yoki qayta ishga tushgan o'zi oladi |
| Internet uzildi                            | `heartbeat` yo'q → 90 soniyada `offline`      | Ishlar navbatda kutadi, hech narsa yo'qolmaydi   |
| Server yiqildi                             | Agent 30 soniyalik ritmga o'tadi              | Ko'targanda davom etadi                          |
| Agent bosdi, lekin `printed` yubora olmadi | Ish qaytadi va **ikkinchi marta bosiladi**    | Ikkita qog'oz                                    |

Oxirgi qator — ataylab qabul qilingan kelishuv. **At-least-once**, exactly-once
emas. Oshxonada ikkita bir xil docket — oshpaz uchun bir soniyalik chalkashlik;
umuman bosilmagan docket — ovqatlanmagan stol. Arzonroq xato tanlandi.

Chek uchun buni `idempotencyKey` yumshatadi: `PrintSpooler::receipt()` ga
kalit berilsa, takrorlangan `settle()` ikkinchi chekni navbatga qo'ymaydi.

## 8. O'rnatish

Bitta ikkilik fayl, konfiguratsiya fayli, xizmat sifatida ro'yxatdan o'tadi
(Windows Service yoki systemd).

```toml
base_url  = "https://api.example.uz"
token     = "..."            # bitta filialga bog'langan xizmat hisobi
branch_id = 1
name      = "chilonzor-till-1"
```

Printerlar ro'yxati **yo'q** — u serverdan `claim` javobida keladi. Yangi printer
qo'shish uchun agentga tegish shart emas.

**Til: Go.** Bitta statik fayl, runtime kerak emas, va kross-kompilyatsiya
Windows/Linux/ARM (Raspberry Pi) ga bitta buyruq — bu ish uchun asosiy talab,
chunki agent kassaning ostidagi har xil mashinalarda turadi. Rust ham bo'lardi,
lekin ustunlik bermaydi: agent I/O va navbat, hisoblash emas. Node yoki Python
o'rnatuvchini og'irlashtiradi va versiya to'qnashuvi beradi.

**Joyi: `apps/print-agent/`.** Turborepo quvuriga tushmasligi muammo emas —
`apps/ai-services` va `apps/telegram-bots` (ikkalasi Python) ham tushmaydi.
Alohida repo esa versiyani kod bilan bog'lashni yo'qotardi: protokol
o'zgarganda server va agent birga chiqishi kerak.

## 9. Keyingi bosqichda (hozir emas)

- **`DLE EOT` real vaqt holati** — qog'oz tugashini _oldindan_ bilish. Klonlarda
  ishonchsiz, shuning uchun birinchi versiyada yo'q: holat yozish muvaffaqiyatidan
  o'qiladi.
- **Avtomatik yangilanish** — imzolangan ikkilik fayl.
- **Lokal qayta bosish tugmasi** — internet uzilganda oxirgi chekni qayta bosish.
- **Fiskal modul (P11)** — fiskal chek nomeri chekda paydo bo'lishi kerak;
  hozircha `Document` da unga joy bor va to'ldirilmagan.

## 10. Qaror holati

| Savol                    | Holat                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Til                      | ✅ **Go** — 8-bo'lim                                                                 |
| Repoda joyi              | ✅ **`apps/print-agent/`** — 8-bo'lim                                                |
| `printing.agent` ruxsati | 🚧 ADMIN yozadi; kelganda to'rtta agent marshruti o'sha ruxsatga ko'chadi (3-bo'lim) |
| Kod yozish               | ⛔ Foydalanuvchi tasdig'i kutilmoqda — bu yangi ilova                                |
