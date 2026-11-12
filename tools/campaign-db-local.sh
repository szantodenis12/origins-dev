#!/usr/bin/env bash
# Local Supabase-shaped stack for the campaign store (concursul de desene):
# Postgres (Supabase image) + PostgREST + Storage API behind an nginx gateway
# that mimics the hosted URL layout (/rest/v1, /storage/v1). Applies
# supabase/migrations/0001-0004 once each and prints the env vars to use.
#
#   tools/campaign-db-local.sh up        start (idempotent), migrate, print env
#   tools/campaign-db-local.sh env       print env only
#   tools/campaign-db-local.sh restart   restart db + rest + storage (data stays)
#   tools/campaign-db-local.sh down      stop and remove containers (data stays)
#   tools/campaign-db-local.sh reset     down + delete the data volumes
#
# Everything here is LOCAL ONLY: fixed dev JWT secret, keys printed in clear.
# Supabase-specific bits the migrations rely on (roles anon / authenticated /
# service_role / authenticator, default grants) come from the Supabase
# Postgres image itself; only role passwords are set here, never in the
# migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NET=origins-campaign-net
DB=origins-campaign-db
REST=origins-campaign-rest
STORAGE=origins-campaign-storage
GW=origins-campaign-gw
PG_VOLUME=origins-campaign-pg
FILES_VOLUME=origins-campaign-files
PG_IMAGE=public.ecr.aws/supabase/postgres:17.11.0.004
REST_IMAGE=public.ecr.aws/supabase/postgrest:v16.4
STORAGE_IMAGE=public.ecr.aws/supabase/storage-api:v1.82.1
GW_IMAGE=nginx:alpine
PORT="${CAMPAIGN_DB_PORT:-54480}"       # gateway: SUPABASE_URL
PG_PORT="${CAMPAIGN_PG_PORT:-54482}"    # raw Postgres, for psql
PG_PASSWORD=origins-local-only
JWT_SECRET=origins-local-dev-jwt-secret-0123456789abcdef

jwt() {
  node -e '
    const c = require("node:crypto");
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const h = b({ alg: "HS256", typ: "JWT" });
    const p = b({ role: process.argv[1], iss: "supabase-local", iat: 1700000000, exp: 2000000000 });
    const s = c.createHmac("sha256", process.argv[2]).update(h + "." + p).digest("base64url");
    console.log(h + "." + p + "." + s);
  ' "$1" "$JWT_SECRET"
}
ANON_KEY="$(jwt anon)"
SERVICE_KEY="$(jwt service_role)"

print_env() {
  cat <<EOF
# --- origins campaign store, local Docker (copy into .env.local or export) ---
SUPABASE_URL=http://127.0.0.1:${PORT}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}
# anon key: only used by the tests that prove anon reads nothing
SUPABASE_ANON_KEY=${ANON_KEY}
# integration tests (tests/campaign-store.integration.test.mjs)
TEST_SUPABASE_URL=http://127.0.0.1:${PORT}
TEST_SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}
TEST_SUPABASE_ANON_KEY=${ANON_KEY}
# psql: postgres://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/postgres
EOF
}

psql_db() { docker exec -i "$DB" psql -v ON_ERROR_STOP=1 -q -U supabase_admin -d postgres "$@"; }

wait_db() {
  for _ in $(seq 1 60); do
    if docker exec "$DB" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 \
      && psql_db -c 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres did not become ready" >&2
  exit 1
}

wait_http() {
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "$1" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "Not ready: $1" >&2
  exit 1
}

running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }

start_db() {
  docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
  if ! docker inspect "$DB" >/dev/null 2>&1; then
    docker run -d --name "$DB" --network "$NET" \
      -e POSTGRES_PASSWORD="$PG_PASSWORD" \
      -p "127.0.0.1:${PG_PORT}:5432" \
      -v "$PG_VOLUME:/var/lib/postgresql/data" \
      "$PG_IMAGE" >/dev/null
  elif ! running "$DB"; then
    docker start "$DB" >/dev/null
  fi
  wait_db
  # Role passwords for the services (hosted Supabase does this for you).
  psql_db <<SQL
alter role authenticator with login password '${PG_PASSWORD}';
alter role supabase_storage_admin with login password '${PG_PASSWORD}';
alter role postgres with login password '${PG_PASSWORD}';
create table if not exists public._local_migrations (
  name text primary key, applied_at timestamptz not null default now()
);
revoke all on public._local_migrations from anon, authenticated;
SQL
}

migrate() {
  for file in "$ROOT"/supabase/migrations/*.sql; do
    name="$(basename "$file")"
    done_already="$(psql_db -tA -c "select 1 from public._local_migrations where name = '${name}'")"
    if [ "$done_already" = "1" ]; then continue; fi
    echo "applying ${name}" >&2
    # As `postgres`, like the Supabase SQL editor / CLI: default grants apply.
    { echo "set role postgres;"; cat "$file"; } | psql_db
    psql_db -c "insert into public._local_migrations (name) values ('${name}')"
  done
}

start_services() {
  if ! docker inspect "$REST" >/dev/null 2>&1; then
    docker run -d --name "$REST" --network "$NET" \
      -e PGRST_DB_URI="postgres://authenticator:${PG_PASSWORD}@${DB}:5432/postgres" \
      -e PGRST_DB_SCHEMAS=public \
      -e PGRST_DB_ANON_ROLE=anon \
      -e PGRST_JWT_SECRET="$JWT_SECRET" \
      -e PGRST_DB_USE_LEGACY_GUCS=false \
      -e PGRST_DB_MAX_ROWS=1000 \
      "$REST_IMAGE" >/dev/null
  elif ! running "$REST"; then
    docker start "$REST" >/dev/null
  fi

  if ! docker inspect "$STORAGE" >/dev/null 2>&1; then
    docker run -d --name "$STORAGE" --network "$NET" \
      -e ANON_KEY="$ANON_KEY" \
      -e SERVICE_KEY="$SERVICE_KEY" \
      -e POSTGREST_URL="http://${REST}:3000" \
      -e PGRST_JWT_SECRET="$JWT_SECRET" \
      -e AUTH_JWT_SECRET="$JWT_SECRET" \
      -e AUTH_JWT_ALGORITHM=HS256 \
      -e DATABASE_URL="postgres://supabase_storage_admin:${PG_PASSWORD}@${DB}:5432/postgres" \
      -e FILE_SIZE_LIMIT=52428800 \
      -e STORAGE_BACKEND=file \
      -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage \
      -e TENANT_ID=stub \
      -e REGION=local \
      -e GLOBAL_S3_BUCKET=stub \
      -e ENABLE_IMAGE_TRANSFORMATION=false \
      -v "$FILES_VOLUME:/var/lib/storage" \
      "$STORAGE_IMAGE" >/dev/null
  elif ! running "$STORAGE"; then
    docker start "$STORAGE" >/dev/null
  fi

  if ! docker inspect "$GW" >/dev/null 2>&1; then
    local conf
    conf="$(mktemp)"
    cat >"$conf" <<NGINX
server {
  listen 80;
  client_max_body_size 64m;
  resolver 127.0.0.11 valid=10s;
  set \$rest http://${REST}:3000;
  set \$storage http://${STORAGE}:5000;
  location /rest/v1/ {
    rewrite ^/rest/v1/(.*)\$ /\$1 break;
    proxy_pass \$rest;
    proxy_set_header Host \$host;
  }
  location /storage/v1/ {
    rewrite ^/storage/v1/(.*)\$ /\$1 break;
    proxy_pass \$storage;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Prefix /storage/v1;
  }
}
NGINX
    docker create --name "$GW" --network "$NET" -p "127.0.0.1:${PORT}:80" "$GW_IMAGE" >/dev/null
    docker cp "$conf" "$GW:/etc/nginx/conf.d/default.conf"
    rm -f "$conf"
    docker start "$GW" >/dev/null
  elif ! running "$GW"; then
    docker start "$GW" >/dev/null
  fi

  wait_http "http://127.0.0.1:${PORT}/rest/v1/"
  wait_http "http://127.0.0.1:${PORT}/storage/v1/bucket"
}

buckets() {
  local base="http://127.0.0.1:${PORT}/storage/v1/bucket"
  for spec in "desene-originale:false" "desene-public:true"; do
    local name="${spec%%:*}" public="${spec##*:}"
    curl -sS -o /dev/null -X POST "$base" \
      -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"id\":\"${name}\",\"name\":\"${name}\",\"public\":${public}}" || true
  done
}

case "${1:-up}" in
  up)
    start_db
    migrate
    start_services
    # PostgREST picks up the migrated schema.
    docker kill -s SIGUSR1 "$REST" >/dev/null 2>&1 || true
    buckets
    print_env
    ;;
  env)
    print_env
    ;;
  restart)
    docker restart "$DB" >/dev/null
    wait_db
    docker restart "$REST" "$STORAGE" >/dev/null
    wait_http "http://127.0.0.1:${PORT}/rest/v1/"
    wait_http "http://127.0.0.1:${PORT}/storage/v1/bucket"
    echo "restarted" >&2
    ;;
  down)
    docker rm -f "$GW" "$STORAGE" "$REST" "$DB" >/dev/null 2>&1 || true
    ;;
  reset)
    docker rm -f "$GW" "$STORAGE" "$REST" "$DB" >/dev/null 2>&1 || true
    docker volume rm "$PG_VOLUME" "$FILES_VOLUME" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    ;;
  *)
    echo "usage: $0 up|env|restart|down|reset" >&2
    exit 2
    ;;
esac
