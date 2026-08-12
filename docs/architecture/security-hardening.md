# Security Hardening Baseline

**Status:** accepted baseline
**Applies to:** dev, staging, production

## Required production controls

- `APP_DEBUG=false`
- `APP_ENV=production`
- `TENANCY_REQUIRE_TENANT=true`
- HTTPS only at ingress/reverse proxy
- Sanctum cookies restricted to trusted domains
- Keycloak/OIDC enabled for SSO when institution rollout starts
- Super Admin 2FA required
- admin app behind IP allowlist or VPN
- secrets stored outside git and injected at deploy time
- audit log enabled for all mutating workflows

## Secrets

Local `.env` is for development only. Production must use one of:

- Kubernetes Secrets encrypted at rest
- sealed-secrets
- external secrets operator backed by Vault or cloud KMS

Never store these in git:

- `APP_KEY`
- database passwords
- bot tokens
- payment secrets
- E-IMZO credentials
- OpenAI/Anthropic keys

## Data protection

- Biometric vectors and sensitive documents must be encrypted at rest.
- Passport data must be hidden from default JSON output.
- Exports must be audited with actor, tenant, filters, file name, and row count.
- Media URLs must be signed unless content is explicitly public.

## API protection

- rate limit auth, public, import, and AI routes separately
- require idempotency keys for payments and high-value document actions
- use policy checks for every tenant-owned resource
- reject cross-tenant IDs even for authenticated users

## Release gate

A release is not production-ready until:

- security config is checked
- migrations are reversible or documented as irreversible
- backup restore has been tested
- alert rules are loaded
- admin access is protected
