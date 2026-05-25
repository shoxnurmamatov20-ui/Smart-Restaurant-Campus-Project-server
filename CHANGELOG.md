# Changelog

All notable changes to CAMPUS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial monorepo scaffold
- Folder structure for `apps/{web,admin,api,ai-services,mobile}` and `packages/{ui,types,config,i18n,utils,sdk}`
- Root configuration: `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.env.example`, `tsconfig`, etc.
- Docker Compose for local dev environment (Postgres, Redis, ClickHouse, MinIO, Keycloak, Mailhog, Meilisearch)
- Documentation skeleton (`docs/`) with architecture, modules, decisions, deployment folders
- Infrastructure folder with Docker, Kubernetes, Nginx, monitoring placeholders
- CI/CD workflow placeholders (`.github/workflows/`)

### Phase 1 modules (planned)
- HR, Students, Online Platform, EDMS, RTTM, Psychology, Exams, Library, Media, KPI

---

[Unreleased]: https://github.com/<owner>/smart-campus/compare/v0.0.0...HEAD
