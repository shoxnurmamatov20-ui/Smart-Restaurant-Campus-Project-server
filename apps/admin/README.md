# Restaurant Campus — Platform Admin

Next.js 16 admin panel for the **platform operator** (the SaaS owner), not for a
restaurant's own staff. Restaurant employees use `apps/web`.

Runs on **port 3001**.

## What lives here

| Bo'lim                                    | Maqsad                                             |
| ----------------------------------------- | -------------------------------------------------- |
| `/dashboard`                              | Platforma holati — restoranlar, filiallar, yuklama |
| `/users`, `/roles`                        | Foydalanuvchilar va RBAC                           |
| `/tenants`                                | Restoranlar (multi-tenant) boshqaruvi              |
| `/modules`                                | Modullarni yoqish/o'chirish                        |
| `/settings`, `/integrations`, `/api-keys` | Tizim sozlamalari va tashqi xizmatlar              |
| `/statistics`, `/reports`, `/audit`       | Analitika, hisobotlar, audit jurnali               |
| `/notifications`, `/telegram`             | Xabarnomalar va 50 ta Telegram bot                 |
| `/system-health`, `/backups`, `/security` | Texnik nazorat                                     |

## Getting started

```bash
pnpm install            # from the repo root
cp .env.local.example .env.local
pnpm --filter @restaurant/admin dev
```

Open <http://localhost:3001>.

The API must be running on <http://localhost:8000> — see `apps/api/README.md`.

## Access rules

- Only the `super-admin` role reaches this app; the API gates every
  `/api/v1/admin/*` route with `role:super-admin`.
- 2FA (TOTP) is mandatory for admin accounts.
- Every action is written to the audit log (`spatie/laravel-activitylog`).

## Conventions

- Shared UI and types come from `@restaurant/ui`, `@restaurant/types`.
- API access goes through `src/lib/api/client.ts`; never call `fetch` directly
  from a page.
- Client-side permission helpers in `src/lib/permissions` are for hiding UI
  only — the server is always the authority.
