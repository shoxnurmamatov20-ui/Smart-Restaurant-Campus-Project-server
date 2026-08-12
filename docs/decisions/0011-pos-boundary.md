# ADR-0011: POS alohida ilova, ingichka modul

**Status:** ~~accepted~~ → **qisman bekor qilindi** (2026-08-11)
**Date:** 2026-08-11
**Decision makers:** Project owner + architect

> ### ⚠️ Keyingi qaror (2026-08-11, o'sha kuni)
>
> Ushbu ADR ning **birinchi qismi — «`apps/pos` alohida Next.js PWA»** — bekor
> qilindi. Loyiha egasi shunday qaror qildi: ilova auditoriya bo'yicha
> bo'linadi, modul bo'yicha emas. POS — 12-modul, ya'ni `apps/web` ning bir
> bo'limi. `apps/pos` papkasi o'chirildi.
>
> **Ikkinchi qism — «`Modules/Pos` ingichka backend modul»** — kuchida qoladi.
> Hisob `Orders`da, pul `Finance`da; `BillRegistry` va `TillLedger`
> shartnomalari, `pos` schema'si va testlar o'zgarmadi.
>
> Quyidagi «Consequences» va «Alternatives» bo'limlari **o'sha paytdagi**
> mulohazani saqlaydi. Ular endi tarix, joriy holat emas — ayniqsa
> «`apps/web` ichida `/pos` route group» varianti: u o'shanda rad etilgandi,
> hozir esa aynan shu yo'l tanlandi. O'shanda sanab o'tilgan narxlar (oflayn
> qatlam, kiosk qulfi va bundle hajmi butun konsolga tegishli bo'lib qolishi)
> yo'qolgani yo'q — ular endi hal qilinishi kerak bo'lgan vazifa.

## Context

Restoran, kafe, bar va fast food shaxobchalari uchun kassa (POS) kerak bo'ldi.
Tabiiy yechim ko'rinib turardi: `Modules/Pos` yaratib, unga hisob, qator va
to'lov jadvallarini berish — xuddi qolgan modullar kabi.

Lekin POS `Menu`, `Orders`, `Kitchen` bilan bir qatordagi domen emas. U —
ularning **ustidagi ish joyi**. Kassa menyudan sotadi, hisobni `Orders`da
ochadi, chiptani `Kitchen`ga yuboradi, pulni `Finance`ga yozadi.

## Decision

Ikkita artefakt:

1. **`apps/pos`** — alohida Next.js PWA. Touch, oflayn ishlaydigan, kiosk
   rejimida qulflanadigan, qurilma tokeni + PIN bilan kiradigan terminal.
2. **`Modules/Pos`** — **ingichka** backend modul. Faqat kassaga tegishli
   narsalarga egalik qiladi: terminal, PIN, sessiya, tasdiq, kassa qutisi,
   offline sync jurnali, chek, fiskal.

Hisob `Orders`da, pul `Finance`da qoladi. POS ularni yangi shartnomalar orqali
chaqiradi: `App\Contracts\Orders\BillRegistry`,
`App\Contracts\Finance\TillLedger`. Ikkalasiga ham `Unavailable*` zaxira
implementatsiyasi bor — modul o'chirilganda tizim jimgina emas, **baland
ovozda** rad etadi.

## Consequences

Ijobiy:

- Kunlik sotuv POS'da va Analytics'da bir xil — bitta haqiqat manbai.
- `ModuleBoundaryTest` ga bironta yangi istisno qo'shilmadi.
- Oflayn qatlam, kiosk qulfi va PIN kirish admin konsolga yuqmadi.
- `Orders` va `Finance` modullariga faqat **yangi fayl** qo'shildi; bironta
  mavjud metod, konstanta yoki migratsiya o'zgarmadi.
- Kassa 2 soniyada ochiladi, chunki bundle'ida admin konsol yo'q.

Salbiy:

- Yana bitta ilova: alohida build, alohida deploy, alohida sessiya holati.
- Ikki bosqichli identifikatsiya (qurilma tokeni + PIN sessiyasi) oddiy
  `auth:sanctum` dan murakkabroq.
- Shartnomalar POS uchun bilvosita qatlam qo'shadi: `BillRegistry` metodi
  yetishmasa, uni `Orders` ichida yozish kerak.

## Alternatives considered

| Variant                                                 | Nega tanlanmadi                                                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| To'liq mustaqil `Modules/Pos` (o'z hisob/to'lovi bilan) | Pul uchun ikkita manba; Analytics ikkalasini qo'shishi kerak; Z-hisobot qaysi jadvaldan? Mavjud invariantlar (paid bill immutable, refund-only) qayta yozilardi |
| `apps/web` ichida `/pos` route group                    | Oflayn qatlam va kiosk qulfi butun admin konsolga yuqadi; bundle kattalashadi; kassa sekin ochiladi                                                             |
| Kassa `Orders` moduli ichida                            | `Orders` ning mas'uliyati ikki barobar oshadi; terminal va PIN buyurtma domeniga aloqasiz                                                                       |

## Related

- [ADR-0004](0004-modular-monolith.md) — modular monolith
- [ADR-0008](0008-module-contract-standard.md) — modul shartnoma standarti
- [ADR-0010](0010-schema-per-module.md) — har modulga bitta schema
- [`docs/modules/12-pos.md`](../modules/12-pos.md)
