# SEALS Production Deployment Guide

End-to-end procedure for deploying the SEALS B2B marketplace with Docker Compose on a single Linux host. Architecture details are in `docs/DOCKER.md`; environment variable reference is in `docs/ENVIRONMENT_VARIABLES.md`.

## Prerequisites

- **DNS**: `A` records for both domains (e.g. `app.example.com` and `api.example.com`) pointing at the server's public IP. Caddy obtains Let's Encrypt certificates automatically on first start, so DNS must resolve before `up`.
- **Server**: Linux host, 2GB+ RAM, with **Docker Engine** and the **Docker Compose plugin** (`docker compose version` works) installed.
- **Ops machine**: MongoDB Database Tools installed — `mongodump` must be available for backups (see `docs/BACKUP_RESTORE.md`).
- **External services provisioned**:
  - MongoDB Atlas cluster + database user (allow inbound access from the server).
  - Cloudinary account (media uploads; the API refuses fake media URLs without it).
  - SMTP account (verification / password-reset email).
- A build of this repository (clone on the server or ship artifacts).

## Step 1 — Clone the repository

```bash
git clone <repository-url> seals
cd seals
```

## Step 2 — Create configuration files

```bash
cp .env.production.example .env.production          # root: domains + web build arg
cp backend/.env.production.example backend/.env.production   # api runtime env
```

Fill in real values. Generate secrets locally:

```bash
openssl rand -base64 48   # NEXTAUTH_SECRET  (>=32 characters)
openssl rand -base64 48   # CRON_SECRET      (>=32 random characters)
```

Minimum required edits:

| File | Variable | Value |
| --- | --- | --- |
| `.env.production` | `APP_DOMAIN`, `API_DOMAIN` | Your real domains |
| `.env.production` | `WEB_API_BASE_URL` | `https://<API_DOMAIN>/api` — baked into the Flutter bundle at image build time |
| `backend/.env.production` | `MONGODB_URI` | Atlas SRV URI with credentials |
| `backend/.env.production` | `NEXTAUTH_SECRET`, `CRON_SECRET` | Generated above |
| `backend/.env.production` | `NEXTAUTH_URL` | `https://<API_DOMAIN>` |
| `backend/.env.production` | `APP_ORIGIN` | `https://<APP_DOMAIN>` |
| `backend/.env.production` | `TRUST_PROXY_HEADERS` | `true` — requests arrive through Caddy, which overwrites `X-Forwarded-For`. Do not set this if exposing the API any other way. |
| `backend/.env.production` | Cloudinary / SMTP variables | Real credentials; register/login verification requires working SMTP |

Never commit the filled copies.

### Existing installations: migrate the optional-SKU index

Before starting this version against an existing database, replace the old
compound sparse index. The migration first aborts if duplicate real SKU values
exist, then makes the `(organization_id, sku)` uniqueness rule apply only when
`sku` is a string. It is safe to rerun.

```bash
cd backend
node --env-file=.env.production scripts/migrate-product-sku-index.mjs
cd ..
```

Run this before the upgraded API process starts. New databases receive the
correct partial index directly from the Mongoose schema.

## Step 3 — Validate and build

```bash
docker compose --env-file .env.production config -q     # validate interpolation/schema
docker compose --env-file .env.production build --pull  # build web + api images
```

The web build fails fast if `WEB_API_BASE_URL` is missing or contains `localhost`.

## Step 4 — Start the stack

```bash
docker compose --env-file .env.production up -d
docker compose ps    # wait until web and api report healthy
```

Caddy stays unstarted until both upstreams pass their healthchecks, then provisions TLS certificates automatically.

## Step 5 — One-time admin bootstrap

With the stack running, create the platform administrator from the bootstrap values in `backend/.env.production` (`ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` ≥12 chars, optional `ADMIN_BOOTSTRAP_NAME`):

```bash
docker compose --env-file .env.production exec api node scripts/create-admin.mjs
```

The script upserts the user with role `Admin` and refuses to touch an email that already belongs to a non-admin account. It is one-time use: remove the three `ADMIN_BOOTSTRAP_*` values from `backend/.env.production` immediately afterwards and recreate the api container (`docker compose --env-file .env.production up -d api`).

Sign in at `https://<API_DOMAIN>/admin/settings` and configure:

- Platform order fee (default 5000 piasters = EGP 50 per accepted order).
- Subscription plans / trial days / grace days and payment deadline.
- Platform payment accounts (InstaPay / wallet / bank transfer) so sellers can pay subscription invoices.

## Step 6 — Schedule the maintenance cron

One job drives all time-based housekeeping (subscription expiry, data-deletion execution, unpaid-order cancellation). Schedule it hourly from any scheduler with network access to the API:

```bash
curl --fail --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  https://<API_DOMAIN>/api/internal/maintenance
```

Example crontab entry:

```cron
0 * * * * curl -fsS -X POST -H "x-cron-secret: <CRON_SECRET>" https://api.example.com/api/internal/maintenance >> /var/log/seals-cron.log 2>&1
```

Concurrent runs are safe: a MongoDB lock makes overlapping executions no-op (`skipped: true`). The endpoint rejects requests when `CRON_SECRET` is unset or shorter than 32 characters.

## Step 7 — Verify

```bash
curl -fsS https://<API_DOMAIN>/api/health/live    # {"status":"ok",...}
curl -fsS https://<API_DOMAIN>/api/health/ready   # {"status":"ready","database":"connected",...}
```

Then load `https://<APP_DOMAIN>` in a browser and confirm the SPA renders and reaches the API.

For signed Android artifacts and iOS/Xcode prerequisites, follow
[`app/docs/RELEASE_BUILD.md`](../app/docs/RELEASE_BUILD.md).

### Smoke checklist

| Check | Expectation |
| --- | --- |
| `/api/health/live` and `/api/health/ready` | HTTP 200; ready reports database connected |
| App domain loads over HTTPS | Valid certificate, SPA renders |
| Register a test account | Account created; **verification email arrives** (requires SMTP); verify via emailed link |
| Login after verification | Session cookie set; `/api/auth/me` returns profile + organization |
| Admin login at API domain `/admin` | Dashboard loads with settings configured |
| Maintenance endpoint without secret | HTTP 401 |

Registration cannot be verified end-to-end until SMTP credentials work — treat a missing verification email as a deployment blocker.

## Rollback guidance

- Images are rebuilt with Compose layer caching; redeploying a previous commit's source and running `build` + `up -d` restores the prior images quickly because unchanged layers are reused.
- Tag or push images to a registry (e.g. `registry/app:2026-08-22`) once available; rollback becomes `docker compose up -d` against the previous tag with no rebuild.
- The application is stateless — rolling back code does not require touching Atlas. If a schema migration shipped (`backend/scripts/migrate-conversation-inquiries.mjs`), check whether the previous version tolerates the new shape before downgrading, and restore from backup as a last resort (see `docs/BACKUP_RESTORE.md`).
- TLS state lives in the `caddy_data` volume; do not delete it during rollbacks.
