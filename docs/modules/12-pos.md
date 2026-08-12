# 12. Kassa terminali (Pos)

> **Alias:** `pos` · **Schema:** `pos` · **Marshrut:** `/api/v1/pos/*` ·
> **Interfeys:** `apps/web` ichida (12-modul bo'limi)

> **Eslatma (2026-08-11).** Kassa interfeysi ilgari alohida ilova edi —
> `apps/pos`, Next.js PWA, port 3002. U olib tashlandi: modul konsolning bir
> bo'limi bo'lishi kerak, alohida ilova emas ([ADR-0011](../decisions/0011-pos-boundary.md)).
> Backend qismi — schema, shartnomalar, marshrutlar, testlar — o'zgarmadi.
> Quyidagi ekran va rol talablari ham o'zgarmadi; ular endi `apps/web` ichida
> qurilishi kerak.

Restoran, kafe, bar va fast food shaxobchalari uchun kassa. Modul **ingichka**:
hisob `Orders`da, pul `Finance`da qoladi — POS ularni `App\Contracts\*`
shartnomalari orqali chaqiradi va faqat terminalga tegishli narsalarga egalik
qiladi.

## Nega ingichka

Agar POS o'z `pos_orders` va `pos_payments` jadvallarini yaratganida, pul uchun
ikkita haqiqat manbai paydo bo'lardi: kunlik sotuv POS'da va Analytics'da har
xil chiqar edi, Z-hisobot qaysi jadvaldan hisoblanishi noaniq bo'lardi.
Batafsil: [ADR-0011](../decisions/0011-pos-boundary.md).

## Egalik chegarasi

| Tushuncha              | Egasi     | POS nima qiladi                                       |
| ---------------------- | --------- | ----------------------------------------------------- |
| Hisob va qatorlar      | `Orders`  | `BillRegistry` shartnomasi orqali                     |
| To'lov, kassa smenasi  | `Finance` | `TillLedger` shartnomasi orqali                       |
| Menyu, narx, stop-list | `Menu`    | `MenuCatalog` orqali o'qiydi                          |
| Terminal, sessiya, PIN | **`Pos`** | Egasi                                                 |
| Tasdiq (void/chegirma) | **`Pos`** | Egasi                                                 |
| Kassa qutisi harakati  | **`Pos`** | Egasi; naqd chiqim `Finance`ga xarajat bo'lib tushadi |
| Offline sync jurnali   | **`Pos`** | Egasi                                                 |

## Jadvallar (`pos` schema)

| Jadval              | Vazifasi                                                         |
| ------------------- | ---------------------------------------------------------------- |
| `terminals`         | Qurilma reyestri: kod, rejim, ulash kodi (heshlangan), heartbeat |
| `pins`              | Xodimning 4 raqamli PIN'i, xato urinishlar, qulf                 |
| `terminal_sessions` | Kim qaysi terminalda; audit umurtqasi                            |
| `approvals`         | Menejer tasdig'i — firibgarlik jurnali                           |
| `drawer_movements`  | Naqd kirim/chiqim, inkassatsiya                                  |
| `sync_entries`      | Offline idempotentligi — `unique(terminal_id, local_id)`         |

## Rejimlar

`table_service` (restoran) · `quick_service` (fast food) · `bar` · `counter`
(kafe). Bitta kod bazasi; terminal rejimni saqlaydi, klient shunga qarab
o'zgaradi — urg'u rangigacha.

## Ruxsatlar

Standart 5 fe'l (`pos.view|create|update|delete|manage`) + 8 nomli ruxsat:
`pos.sell`, `pos.void`, `pos.discount`, `pos.reopen`, `pos.refund`,
`pos.drawer`, `pos.approve`, `pos.terminal`.

Nega alohida: CRUD modelida «hisob ochish» ham, «qatorni o'chirish» ham
`pos.update`. Bular esa restorandagi yagona muhim firibgarlikning ikki uchi —
mehmon naqd to'laydi, qator bekor qilinadi, pul ketadi.

## Ikki bosqichli identifikatsiya

1. **Qurilma tokeni** — ulash paytida bir marta beriladi, qaysi kassa ekanini
   isbotlaydi.
2. **PIN sessiyasi** — kim turganini isbotlaydi, qisqa muddatli foydalanuvchi
   tokeniga almashtiriladi.

Shu ajratma tufayli smena almashinuvi bir soniya, yo'qolgan planshet esa hech
kimning parolini o'zgartirmasdan bekor qilinadi.

## Offline

Har bir yozuv qurilma yaratgan `X-Pos-Local-Id` bilan keladi.
`unique(terminal_id, local_id)` takrorlanishni to'xtatadi va **saqlangan
natijani** qaytaradi. Klient IndexedDB outbox'ida navbat tutadi.

Oflayn ruxsat etiladi: hisob ochish, qator qo'shish, oshxonaga yuborish, naqd
to'lov. Taqiqlanadi: karta to'lovi, bonus yechish, qaytarish, qayta ochish —
ularning hammasi qurilma yeta olmaydigan narsani talab qiladi.

## Rol → ish maydoni

| Rol        | Sahifalari                                                              |
| ---------- | ----------------------------------------------------------------------- |
| Cashier    | Sotuv · To'lov · Smena (X/Z) · Kassa qutisi · Ochiq hisoblar            |
| Waiter     | Zal · Sotuv · To'lov · Ochiq hisoblar                                   |
| Manager    | Tasdiqlar · Terminallar · Jonli sotuv · Z-hisobotlar · Chegirma tahlili |
| Owner      | Jonli sotuv · Terminallar · Z-hisobotlar · Chegirma tahlili             |
| Chef       | Stop-list · Taom sotuvi                                                 |
| Warehouse  | Qoldiqqa ta'sir                                                         |
| Accountant | Z-hisobotlar · Chegirma tahlili                                         |
| Courier    | Yetkazmalarim                                                           |

Navigatsiya **ruxsatlardan** quriladi (`src/lib/workspaces.ts`), rol nomidan
emas — server nima ruxsat berganini biladi, klient esa uning nusxasini
saqlamasligi kerak.

## Testlar

`Modules/Pos/tests/Feature/` — 5 ta sinf, ~90 test:
`PosModuleTest`, `PosPermissionsTest`, `TerminalPairingTest`, `PinLoginTest`,
`SellFlowTest`, `TillMoneyTest`. Shartnomalar `Modules/Orders` va
`Modules/Finance` testlarida.
