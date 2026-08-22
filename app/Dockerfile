# =============================================================================
# SEALS Flutter Web — production container
# Multi-stage: pinned Flutter SDK builds the release web bundle, nginx serves it
# with SPA fallback and hashed-asset caching (see nginx-web.conf).
# =============================================================================

FROM ghcr.io/cirruslabs/flutter:3.44.8 AS build

WORKDIR /src
COPY pubspec.yaml pubspec.lock* ./
RUN flutter pub get

COPY . .
# .env is baked at build time; production values must be provided by build args.
ARG API_BASE_URL_PROD
ENV API_BASE_URL_PROD=${API_BASE_URL_PROD}
ENV ENVIRONMENT=production

# Fail fast if the operator forgot the API URL (ApiConstants throws otherwise).
RUN test -n "$API_BASE_URL_PROD" || (echo "API_BASE_URL_PROD build arg is required" && exit 1)

RUN flutter build web --release --wasm --source-maps

FROM nginx:1.27-alpine AS runtime

RUN addgroup -S web && adduser -S web -G web

COPY nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/build/web /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# nginx image runs as root master by default; drop privileges for workers.
RUN sed -i 's/user  nginx;/user  web;/' /etc/nginx/nginx.conf

CMD ["nginx", "-g", "daemon off;"]
