# Telefonda ochish — Expo QR

```bash
cd apps/mobile
pnpm tunnel
```

Terminalda QR chiqadi. Telefonda **Expo Go** (Play Market'dan) ochib, QR ni skanerlang.

## Nega `pnpm tunnel`, `expo start` emas

Ikki sabab, ikkalasi ham majburiy:

**`--tunnel`.** Bu server VPS'da turibdi, telefoningiz esa boshqa tarmoqda.
`expo start` faqat lokal tarmoqqa e'lon qiladi, ya'ni telefon uni ko'rmaydi.
`--tunnel` ngrok orqali ommaviy manzil ochadi (`@expo/ngrok` shuning uchun
o'rnatilgan).

**`SRCP_API_BASE`.** Busiz `src/lib/api.ts` `extra.apiBase` ni topolmaydi va
`http://<dev-server>:8000` ga uradi — tunnel ortida bunday manzil yo'q, va har
bir so'rov yiqiladi. Skript uni production hostiga qotirib qo'yadi, ya'ni
telefondagi ilova haqiqiy ma'lumot bilan ishlaydi.

## Expo Go'da nima ishlamaydi

- **Push bildirishnomalar** — Expo Go Android'da SDK 53 dan beri ularni
  qo'llab-quvvatlamaydi. Qolgan hammasi (kamera, QR, xavfsiz saqlash,
  marshrutlar) ishlaydi.
- Ilova **APK** sifatida to'liq ishlaydi: `/download` sahifasidan olinadi.

## Tunnel yopilganda

QR faqat `pnpm tunnel` ishlab turganda amal qiladi. Terminalni yopsangiz —
havola o'ladi; qayta ishga tushiring, yangi QR chiqadi.
