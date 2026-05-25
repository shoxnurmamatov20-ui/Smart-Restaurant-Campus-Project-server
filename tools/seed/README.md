# Database seed tools

Test va demo ma'lumotlarini generatsiya qilish uchun yordamchilar.

## Rejada

- **Bulk seeder** — 10K talaba, 1K xodim, 100 fan generate (faker bilan)
- **HEMIS sample data** — HEMIS'dan namuna response'lar (testlar uchun mock)
- **Demo university** — to'liq universitet (rektorat → talaba) bir buyruqda yaratish
- **AI-generated content** — test essays, plagiat sample'lar, va h.k.

> **Hozir bo'sh.** Phase 1 modullari quroganda yoziladi.

## Foydalanish (rejada)

```bash
# Demo universitet yaratish
pnpm tsx tools/seed/demo-university.ts --tenant test-uni
```
