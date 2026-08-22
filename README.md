# SEALS B2B Marketplace

منصة SaaS لتجارة الجملة في مصر — تطبيق Flutter + واجهة API ولوحة إدارة Next.js + MongoDB.
This repository contains a production-oriented B2B wholesale SaaS platform.

## Architecture

| Component | Stack | Location |
|---|---|---|
| Mobile/Web client | Flutter 3.44, Bloc, Dio, easy_localization (ar/en) | `app/` |
| API + Admin dashboard | Next.js 16 (App Router), TypeScript strict, Zod, Mongoose, NextAuth cookies | `backend/` |
| Database | MongoDB Atlas (replica set — transactions supported) | external |
| Media / Email | Cloudinary · SMTP/Nodemailer | external |
| Edge & deployment | Docker Compose · Caddy (TLS/HSTS) · nginx (Flutter Web SPA) | root |

Full documentation lives in `docs/`:

- `ARCHITECTURE.md` — system + module design
- `API.md`, `AUTHORIZATION.md`, `ORDER_LIFECYCLE.md`, `PAYMENT_FLOW.md`
- `SECURITY.md`, `TESTING.md`
- `DEPLOYMENT.md`, `DOCKER.md`, `ENVIRONMENT_VARIABLES.md`, `BACKUP_RESTORE.md`
- `PRODUCTION_RUNBOOK.md` (دليل التشغيل)
- `ENTERPRISE_AUDIT.md` — findings and remediation status
- `FEATURE_MATRIX.md` — capability inventory
- `ENTERPRISE_TRANSFORMATION_REPORT.md` — final transformation report

## Business model (implemented)

- Organizations of three types: wholesaler, business buyer (retailer), shipping company;
  each requires an active subscription (trial-supported) to trade.
- Orders carry three separate payment obligations: platform fee (default 50 EGP),
  merchandise value, shipping. Local payment rails only: InstaPay / mobile wallet /
  bank transfer / cash receipts with proof upload and beneficiary confirmation.
- **The platform never holds merchant funds.**
- Inventory uses reserve → commit semantics protected by conditional atomic updates and
  MongoDB transactions; overselling is impossible under concurrent requests.
- Authentication: NextAuth encrypted HttpOnly cookies; no third-party auth providers,
  no custom refresh tokens.

## Quick start (development)

```powershell
# Backend
cd backend
npm ci
copy .env.example .env.local   # fill MONGODB_URI etc.
npm run dev                    # http://localhost:3000

# Seed demo data (refuses to run against non-local DBs)
npm run seed:mvp
# Demo logins: *@seals.demo / Demo@12345 (see docs/MVP_DEMO_DATA.md)

# Flutter app
cd ..\app
flutter pub get
flutter run -d chrome          # or an Android device
```

## Verification

```powershell
cd backend
npm run lint      # tsc --noEmit
npm test          # vitest unit suites
npm run build     # next build (production)

cd ..\app
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter build web --release
```

CI (`.github/workflows/ci.yml`) runs all of the above plus compose validation and both
production Docker image builds on every push.

## Production deployment

```bash
cp .env.production.example .env.production        # fill APP_DOMAIN/API_DOMAIN/...
cp backend/.env.production.example backend/.env.production
docker compose --env-file .env.production up -d --build
```

See `docs/DEPLOYMENT.md` for the full procedure including admin bootstrap and the hourly
maintenance cron.

## Legal note

القواعد القانونية المعروضة داخل التطبيق مسودة تشغيلية فقط، ويجب اعتمادها من محامٍ مصري
قبل الإطلاق العام.
