# Architecture

Bu papka Smart Restaurant Campus tizimi arxitekturasi haqida hujjatlarni saqlaydi.

## Hujjatlar

| Fayl                                                 | Tavsif                                                |
| ---------------------------------------------------- | ----------------------------------------------------- |
| [`overview.md`](overview.md)                         | Yuqori darajadagi arxitektura sharhi                  |
| [`multi-tenancy.md`](multi-tenancy.md)               | 30 modul uchun tenant isolation strategiyasi          |
| [`module-contracts.md`](module-contracts.md)         | Har modul amal qiladigan API/event/test kontraktlari  |
| [`events-and-analytics.md`](events-and-analytics.md) | Queue, event envelope, analytics sync va outbox yo'li |
| [`security-hardening.md`](security-hardening.md)     | Production security baseline                          |
| [`production-readiness.md`](production-readiness.md) | SLO, monitoring, backup, DR va go-live gate           |

## Qo'shimcha o'qish

- [`../decisions/`](../decisions/) — Architecture Decision Records (ADR)
- [`../modules/`](../modules/) — Har modul bo'yicha texnik spec
- [`../api/`](../api/) — API dokumentatsiyasi
- [`../deployment/`](../deployment/) — Production deploy ko'rsatmalari
- [`../RESTAURANT_30_MODULLAR.md`](../RESTAURANT_30_MODULLAR.md) — To'liq 30 modul spec
