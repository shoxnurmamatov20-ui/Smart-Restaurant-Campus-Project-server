# End-to-End testlar (Playwright)

Cross-app E2E testlar (web + admin + api + ai-services orasidagi to'liq oqim).

## O'rnatish

```bash
cd tests/e2e
pnpm install
pnpm exec playwright install
```

## Run

```bash
pnpm test:e2e          # Hammasini
pnpm test:e2e --ui     # Interaktiv UI mode
pnpm test:e2e --debug  # Debug mode
```

## Test misollar (rejada)

```
tests/e2e/
├── auth/
│   ├── login.spec.ts
│   ├── 2fa.spec.ts
│   └── password-reset.spec.ts
├── students/
│   ├── enrollment.spec.ts
│   └── grades.spec.ts
├── admin/
│   ├── user-management.spec.ts
│   └── system-settings.spec.ts
└── modules/
    ├── hr-attendance.spec.ts
    └── ...
```

> **Hozir bo'sh.** E2E testlar Phase 1 modullari ishga tushgach yoziladi.
