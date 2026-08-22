# SEALS Docker Deployment Architecture

This stack is defined in `docker-compose.yml` at the repository root. MongoDB Atlas, Cloudinary, and SMTP are external services; nothing stateful runs in the containers.

## Services

| Service | Image / Build | Internal port | Role |
| --- | --- | --- | --- |
| `web` | Built from `app/Dockerfile` (multi-stage) | 8080 (internal only) | Flutter Web SPA served by nginx |
| `api` | Built from `backend/Dockerfile` (Next.js standalone output) | 3000 (internal only) | REST API + Admin dashboard |
| `caddy` | `caddy:2.10-alpine` | 80, 443 (published) | HTTPS termination (automatic Let's Encrypt), reverse proxy, security headers |

All three join the private `seals` network. Only Caddy publishes ports.

### web — Flutter Web (`app/Dockerfile`)

- **Stage 1 (build)**: pinned SDK `ghcr.io/cirruslabs/flutter:3.44.8`; runs `flutter pub get`, then `flutter build web --release --wasm --source-maps`.
- The build argument `API_BASE_URL_PROD` is baked into the bundle (`ApiConstants.baseUrl` throws at startup if it is empty or contains `localhost`); compose passes it from the root `.env.production` variable `WEB_API_BASE_URL`. A build without it fails fast by design.
- **Stage 2 (runtime)**: `nginx:1.27-alpine` with the compiled bundle copied to `/usr/share/nginx/html`.
- Runs as non-root: a dedicated `web` user/group is created and `user nginx;` is replaced via `sed` so workers drop privileges.
- Container-level `HEALTHCHECK`: `wget -qO- http://127.0.0.1:8080/healthz`.

### api — Next.js standalone (`backend/Dockerfile`)

- Three stages on `node:24-alpine`: `dependencies` (`npm ci`), `builder` (`next build`, telemetry disabled), and `runner`.
- Runner copies only `.next/standalone`, `.next/static`, `package.json`, and `scripts/` (so `create-admin.mjs` can run inside the container), owned by the non-root user `nextjs` (uid/gid 1001).
- Runtime env: `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`; entrypoint `node server.js`.
- All runtime configuration arrives through `env_file: ./backend/.env.production` (declared in `docker-compose.yml`).
- Compose healthcheck: `wget -qO- http://127.0.0.1:3000/api/health/ready` (verifies config + MongoDB connectivity).

### caddy — routing and TLS (`Caddyfile`)

Domain variables `APP_DOMAIN` / `API_DOMAIN` are injected from the root `.env.production`.

| Host | Upstream | Notes |
| --- | --- | --- |
| `$APP_DOMAIN` | `web:8080` | zstd+gzip compression; security headers (HSTS, nosniff, `X-Frame-Options: DENY`, strict referrer policy, `Server` header removed). |
| `$API_DOMAIN` | `api:3000` | Same headers plus `Permissions-Policy: camera=(), microphone=(), geolocation=()`. `request_body max_size 70MB` because uploads are base64 JSON payloads (10MB image / 50MB video ≈ 68MB encoded). |

Logs go to stdout as JSON (`docker compose logs caddy`). Certificates persist in the named volumes `caddy_data` and `caddy_config`.

Caddy starts only after both upstreams report healthy (`depends_on` with `condition: service_healthy`). All services use `restart: unless-stopped`.

## Static asset caching (`app/nginx-web.conf`)

The nginx server listens on 8080 and implements:

- **Hashed build assets** (js/css/wasm/fonts/images): `expires 365d` + `Cache-Control: public, immutable` — filenames are content-hashed by Flutter, so this is safe forever.
- **`index.html`**: `Cache-Control: no-cache, must-revalidate` — every deployment reaches users immediately after reload.
- **`flutter_service_worker.js`**: also `no-cache, must-revalidate`.
- **SPA fallback**: `try_files $uri $uri/ /index.html` for deep links such as `/products/123`.
- **`/healthz`**: returns `200 'ok'` with access logging off — used by the Docker healthchecks.
- gzip enabled for text/css/js/wasm/json/svg payloads ≥ 1024 bytes.

## Operating commands

```bash
# 1. Create configuration (see docs/DEPLOYMENT.md for values)
cp .env.production.example .env.production
cp backend/.env.production.example backend/.env.production

# 2. Validate compose interpolation and schema (--env-file supplies APP_DOMAIN,
#    API_DOMAIN, WEB_API_BASE_URL used for interpolation and the web build arg)
docker compose --env-file .env.production config -q

# 3. Build images
docker compose --env-file .env.production build --pull

# 4. Start the stack detached
docker compose --env-file .env.production up -d

# 5. Watch status / logs
docker compose ps
docker compose logs -f api caddy
```

Note: `docker compose` interpolates `${APP_DOMAIN}` etc. from the file passed via `--env-file` (compose does not read `.env.production` implicitly). The `api` service additionally loads its full environment from the literal path `./backend/.env.production`, which must exist before `up`.

Healthchecks are built into both application containers (`Dockerfile HEALTHCHECK` for web, compose `healthcheck` for both services), so `docker compose ps` shows per-service health and Caddy will not route traffic until upstreams pass.

## Image hygiene

- Both application images are multi-stage builds; final images contain no Flutter SDK, no Node build toolchain, no dev dependencies.
- Both run non-root (`web` user in the nginx image, `nextjs` uid 1001 in the API image).
- Base images are version-pinned (`flutter:3.44.8`, `nginx:1.27-alpine`, `node:24-alpine`, `caddy:2.10-alpine`).
- No secrets are baked into either image: web receives only the public API URL; all credentials enter the API container at runtime via `env_file`.
