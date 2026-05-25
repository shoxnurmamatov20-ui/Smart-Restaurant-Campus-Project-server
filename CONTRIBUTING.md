# Contributing to CAMPUS

CAMPUS loyihasiga hissa qo'shganingiz uchun rahmat! Quyidagi qoidalar va tartiblarni qo'llab-quvvatlang.

## Workflow

1. **Issue oching** — yangi feature yoki bug haqida muhokama qiling
2. **Branch yarating** — `feature/<name>` yoki `fix/<name>` formatida
3. **Code yozing** — quyidagi standartlarga rioya qiling
4. **Testlar yozing** — yangi kod uchun majburiy
5. **PR oching** — aniq tavsif va screenshotlar bilan
6. **Code review** — kamida 1 ta approve kerak

## Code standards

### TypeScript / Next.js
- **ESLint + Prettier** — `pnpm lint` va `pnpm format` ishlatiladi
- **TypeScript strict mode** — `any` ishlatish taqiqlangan
- **Komponentlar** — server components afzal, client components faqat zarurat bo'lganda
- **Folder naming** — kebab-case (`user-profile.tsx`)
- **Komponent naming** — PascalCase (`UserProfile`)

### PHP / Laravel
- **PSR-12** — code style standart
- **Laravel Pint** — `composer run pint` orqali avtoformatlash
- **Modul yo'nalishi** — har modul `apps/api/modules/<Name>/` ichida
- **Naming** — Eloquent modellar (`Employee`), Controllerlar (`EmployeeController`), va h.k.

### Python
- **Ruff + mypy** — `ruff check` va `mypy src/`
- **Type hints** — majburiy
- **Pydantic models** — request/response schemas uchun
- **uv** — dependencies (NOT pip yoki poetry)

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) standartiga rioya qiling:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`

**Misollar:**
```
feat(hr): add Face ID attendance endpoint
fix(students): correct HEMIS sync race condition
docs(architecture): add data flow diagram for EDMS
chore(deps): bump Next.js to 15.2.0
```

## Branch naming

- `feature/<short-name>` — yangi feature
- `fix/<short-name>` — bug fix
- `docs/<short-name>` — faqat docs
- `chore/<short-name>` — repository housekeeping
- `refactor/<short-name>` — refactoring

## PR review checklist

- [ ] Testlar pass qiladi (`pnpm test`, `php artisan test`, `pytest`)
- [ ] Linter pass qiladi (`pnpm lint`, `composer run pint`, `ruff check`)
- [ ] TypeCheck pass qiladi (`pnpm tsc --noEmit`)
- [ ] Yangi feature uchun testlar yozildi
- [ ] CHANGELOG.md yangilandi
- [ ] Documentation yangilandi (kerak bo'lsa)
- [ ] Database migration mavjud (kerak bo'lsa)
- [ ] i18n strings qo'shildi (uz/ru/en)

## Til (Language)

- **Code, identifierlar, fayl nomlari:** English
- **Comments:** English (minimal)
- **Commit messages:** English
- **Documentation (prose):** Uzbek + English (where helpful)
- **Issues / PR descriptions:** Uzbek yoki English (xohlaganingiz)
- **UI / user-facing:** Uzbek (default), Russian, English

## Savol va yordam

- **Issues:** loyiha GitHub'da
- **Email:** uzbcorp@gmail.com
- **Documentation:** [`docs/`](docs/) papkasi
