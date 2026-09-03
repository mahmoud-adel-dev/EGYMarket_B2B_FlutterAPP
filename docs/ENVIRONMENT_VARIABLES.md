# SEALS Environment Variable Reference

Two example files exist:

- `.env.production.example` (repository root) — domains, the Flutter Web build argument, and a copy of every backend value for reference.
- `backend/.env.production.example` — the file the API container actually loads (`env_file` in `docker-compose.yml`).
- `backend/.env.example` — local development template (copy to `backend/.env.local`; never commit filled copies).

Scope legend:

| Scope | Meaning |
| --- | --- |
| build-time web | Consumed when the `web` Docker image is built; baked into the browser bundle. Changing it requires rebuilding the image. |
| runtime api | Loaded by the `api` container from `backend/.env.production`. Changes require recreating the container. |
| cron / ops | Used by scheduled jobs or operator scripts, not by the running services. |

## Root `.env.production`

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `APP_DOMAIN` | Yes | compose interpolation | Public app hostname injected into Caddy (`{$APP_DOMAIN}` host matcher). |
| `API_DOMAIN` | Yes | compose interpolation | Public API/admin hostname injected into Caddy. |
| `WEB_API_BASE_URL` | Yes | build-time web | The API base URL (must be `https://...`) passed to the web image as build arg `API_BASE_URL_PROD` and compiled into the Flutter bundle. The app throws at startup if it is empty or contains `localhost`. |

## Backend runtime (`backend/.env.production`, production values)

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | runtime api | Must be `production`; enables strict config validation and hides internal error details. |
| `MONGODB_URI` | Yes | runtime api (+ backup script) | MongoDB Atlas SRV connection string with credentials. Also read by `backend/scripts/backup-mongodb.ps1` on the ops machine. |
| `NEXTAUTH_SECRET` | Yes | runtime api | NextAuth JWT/cookie signing key. Generate: `openssl rand -base64 48` (minimum 32 characters). Readiness fails closed if weaker in production. |
| `NEXTAUTH_URL` | Yes | runtime api | Canonical API origin (`https://<API_DOMAIN>`); required in production for secure cookies/callbacks. |
| `APP_ORIGIN` | Yes | runtime api | First-party frontend origin (`https://<APP_DOMAIN>`) used for CORS/cookie context. |
| `APP_ORIGINS` | No | runtime api | Comma-separated extra trusted origins for CORS. Leave empty unless you operate another first-party frontend. In non-production development only, loopback origins are also accepted so Flutter Web can use a random local port; production remains exact-allowlist only. |
| `TRUST_PROXY_HEADERS` | Yes (behind Caddy) | runtime api | `true` only when requests arrive through Caddy, which overwrites `X-Forwarded-For` with the real client address. The rate limiter then trusts the last XFF hop. When unset/false, every caller collapses into one shared "untrusted" bucket — limits still apply but are stricter than necessary (fail closed). Never set `true` with a directly reachable API or clients can spoof their rate-limit identity. |
| `CLOUDINARY_CLOUD_NAME` | Yes (prod) | runtime api | Cloudinary account identifier for media uploads. Without these three variables the upload endpoint rejects payloads. |
| `CLOUDINARY_API_KEY` | Yes (prod) | runtime api | See above. |
| `CLOUDINARY_API_SECRET` | Yes (prod) | runtime api | Secret credential — keep out of logs. |
| `SMTP_HOST` | Yes (prod) | runtime api | Outbound mail server for verification/password-reset email. Registration flow is blocked without working SMTP. |
| `SMTP_PORT` | No (default 587) | runtime api | SMTP port. |
| `SMTP_SECURE` | No (default false) | runtime api | Use implicit TLS (465) when `true`. |
| `SMTP_USER` | Yes (prod) | runtime api | SMTP username. |
| `SMTP_PASSWORD` | Yes (prod) | runtime api | SMTP password — keep out of logs. |
| `SMTP_FROM` | Yes (prod) | runtime api | From header, e.g. `"SEALS B2B <no-reply@example.com>"`. |
| `CRON_SECRET` | Yes | cron | Shared secret for `POST /api/internal/maintenance` sent as the `x-cron-secret` header. 32+ random characters (`openssl rand -base64 48`). The endpoint refuses to run when shorter than 32 chars. |
| `ALLOW_UNVERIFIED_LOGIN` | No (default false) | runtime api | Allows login before email verification. **Never set `true` in production** — exists only for local development convenience. |
| `LOG_LEVEL` | No (default info) | runtime api | Structured logging verbosity. |
| `ADMIN_BOOTSTRAP_EMAIL` | One-time | cron / ops | Email for `node scripts/create-admin.mjs`. One-time use: remove from the env file immediately after bootstrapping. |
| `ADMIN_BOOTSTRAP_PASSWORD` | One-time | cron / ops | Password for the bootstrap admin (minimum 12 characters). Remove after running the script. |
| `ADMIN_BOOTSTRAP_NAME` | No (default "Platform Admin") | cron / ops | Display name for the bootstrap admin. Remove after running the script. |

## Special-case variables (not in the examples)

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `ALLOW_DEMO_SEED` | No | cron / ops | Guard for `backend/scripts/seed-mvp.mjs`. DANGER: seeding upserts verified organizations and demo accounts with public passwords. The script refuses to run against `NODE_ENV=production` or any non-local database URI unless this is explicitly `true`. Never set it on a production system; if you must seed a staging clone, unset it again afterwards. |
| `API_BASE_URL_LOCAL` | Dev only | build-time web (local) | Local API base URL used by the Flutter app outside release builds (see `app/lib/core/constants/api_constants.dart`). Defined in `app/.env` (see `app/.env.example`). |
| `ENVIRONMENT` | Dev only | build-time web (local) | `development`/`production` switch for the Flutter app; release builds always use `API_BASE_URL_PROD`. |

## Local development (`backend/.env.example` → `backend/.env.local`)

Same variables as production except: `MONGODB_URI` points at a local `mongod` (`mongodb://127.0.0.1:27017/seals_b2b`), `NEXTAUTH_URL=http://localhost:3000`, `APP_ORIGIN=http://localhost:8080`, Cloudinary/SMTP may be left empty (upload and email features degrade), and `TRUST_PROXY_HEADERS`, `CRON_SECRET`, and `ADMIN_BOOTSTRAP_*` are not needed.

## Handling rules

- Filled `.env.production` files are gitignored — never commit or paste them into tickets.
- Rotate `NEXTAUTH_SECRET` carefully: rotating invalidates all sessions.
- `MONGODB_URI` is consumed via environment variable everywhere (including backups) so credentials never appear on command lines or in process listings.
