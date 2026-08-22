# Seals B2B — Super Admin Panel

لوحة تحكم إدارية مستقلة لمنصة سيال B2B، منفصلة تمامًا عن واجهة المتجر وتتصل بالـ API الخلفي عبر طبقة
وكالة (BFF) تحافظ على جلسة NextAuth داخل نفس الأصل.

## Architecture

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) · React 19 · TypeScript strict |
| Styling | Tailwind CSS v4 (RTL-first, logical properties) |
| Data | TanStack Query v5 + typed services (`src/services/*`) |
| Charts | Recharts |
| Icons | Lucide |
| Auth | Backend NextAuth cookies proxied same-origin via `src/app/api/bff/[...path]` |

- **No mock data** — every screen reads real backend endpoints.
- **Backend is the source of truth** for all financial aggregates; the panel never computes revenue itself.
- Session guard runs server-side in `src/app/(dash)/layout.tsx` before any dashboard page renders.

## Run

```powershell
cd admin-panle
npm install
"API_BASE_URL=http://localhost:3000" | Set-Content .env.local   # or the deployed API origin
npm run dev        # http://localhost:3100  (backend must run on :3000)

npm run lint       # tsc --noEmit
npm run build      # production build
```

Sign in with a platform Admin account (see `backend/scripts/create-admin.mjs`).

## Module map

```
Overview          /dashboard
Commerce          /orders  /buyers  /sellers  /organizations
Finance           /payments  /transactions  /platform-fees  /refunds  /subscriptions  /invoices
Operations        /verification  /disputes  /reports
Administration    /admins  /roles  /audit-logs  /settings
```

All sensitive actions (verification decisions, invoice reviews, dispute resolutions,
refund confirmation, account suspension) go through confirmation dialogs, are executed by
audited backend endpoints, and appear in `/audit-logs`.

The roles matrix at `/roles` is the frontend UX layer for future granular admin roles;
real authorization stays enforced per-endpoint on the backend.
