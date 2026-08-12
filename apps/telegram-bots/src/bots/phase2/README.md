# Phase-2 bot handlers

The specialised bots that ship after Phase 1. Each is a single-purpose channel
or service desk for a narrow audience.

## Operatsion (10)

| Key           | Audience   | Purpose                                  |
| ------------- | ---------- | ---------------------------------------- |
| `stock_alert` | Omborchi   | Minimal qoldiq ogohlantirishi            |
| `waste`       | Menejer    | Chiqim aktlari va yo'qotishlar           |
| `haccp`       | Osh-boshi  | Harorat, tozalash, sanitariya kitobchasi |
| `shift_swap`  | Xodim      | Smena almashinuvi so'rovi                |
| `payroll`     | Xodim      | Ishlangan soat va oylik                  |
| `training`    | Xodim      | Tex-karta va servis standartlari         |
| `recruiting`  | Menejer    | Vakansiya va nomzodlar                   |
| `equipment`   | Menejer    | Jihoz texnik xizmati                     |
| `energy`      | Menejer    | Energiya iste'moli anomaliyasi           |
| `security`    | Xavfsizlik | CCTV hodisalari                          |

## Marketing va mehmon (10)

`birthday` · `winback` · `catering` · `corporate` · `gift_card` ·
`review_watch` · `menu_ai` · `nutrition` · `allergen` · `queue`

## Yetkazib berish (4)

`aggregator` · `delivery_zone` · `driver_dispatch` · `tracking`

## Moliya (4)

`cash_alert` · `fiscal` · `debt` · `budget`

Per-branch (`br_*`) and per-concept (`concept_*`, `franchise`, `audit`) bots
live in `src/bots/branch/` and `src/bots/concept/` respectively.

All of these currently fall back to `_stub.py`. Drop a `<key>.py` here with a
module-level `router` and it takes over on the next restart.
