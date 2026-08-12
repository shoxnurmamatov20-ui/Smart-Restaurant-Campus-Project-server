# Restaurant Campus — Staff Console

Next.js 16 web app used by restaurant staff: waiters, cooks, hosts, cashiers,
storekeepers and managers. The platform operator uses `apps/admin` instead.

Runs on **port 3000**.

## Modules

| Yo'l         | Modul                                                          |
| ------------ | -------------------------------------------------------------- |
| `/dashboard` | Smena dashboardi — tushum, buyurtmalar, o'rtacha chek, stollar |
| `/orders`    | Buyurtmalar (zal / olib ketish / yetkazib berish)              |
| `/kitchen`   | Oshxona displey tizimi (KDS)                                   |
| `/tables`    | Zal xaritasi, stollar, bronlar                                 |
| `/menu`      | Menyu, taomlar, narxlar, stop-list                             |
| `/inventory` | Ombor, ingredientlar, texnologik kartalar                      |
| `/suppliers` | Yetkazib beruvchilar va xaridlar                               |
| `/finance`   | Kassa smenasi, to'lovlar, xarajatlar                           |
| `/staff`     | Xodimlar, smenalar, davomat                                    |
| `/crm`       | Mijozlar, sodiqlik, aksiyalar                                  |
| `/analytics` | Sotuv analitikasi, food-cost, KPI                              |

## Getting started

```bash
pnpm install            # from the repo root
cp .env.local.example .env.local
pnpm --filter @restaurant/web dev
```

Open <http://localhost:3000>. The API must be running on
<http://localhost:8000> — see `apps/api/README.md`.

## Conventions

- **Money** arrives from the API as an integer number of tiyin
  (1 so'm = 100 tiyin). Format it at render time; never store the formatted value.
- **Content translations** (dish names, category titles) come back already
  resolved in `title`, with the full `{uz, ru, en}` map in `name` for editors.
  UI chrome strings live in `@restaurant/i18n`.
- **Tenant** — every API call carries the restaurant via the `X-Tenant` header;
  see `src/lib/constants.ts`.
- Shared code comes from `@restaurant/ui`, `@restaurant/types`, `@restaurant/sdk`.
- Live screens (KDS, floor map, revenue tiles) subscribe to Laravel Reverb
  channels `tenant.{id}.kitchen`, `.floor`, `.cashdesk`, `.management`.
