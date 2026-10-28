#!/usr/bin/env bash
# A Postgres that lives in one issue's worktree and dies with it.
#
#   bash ./scripts/factory-db.sh up       start it: an empty kit_api_test, and kit_mirror, a copy of development
#   bash ./scripts/factory-db.sh down     stop it and delete its data
#   bash ./scripts/factory-db.sh migrate  apply this branch's migrations to kit_mirror (needs packages/db built)
#   bash ./scripts/factory-db.sh report   what the work did to kit_mirror: schema and row changes, as JSON
#   bash ./scripts/factory-db.sh env      print the connection lines (also written to .factory/db.env)
#
# Paperclip runs `up` as the project's provision command when it creates an issue's worktree and
# `down` as its teardown command when it closes it. Agents load the connections with
#   set -a; . .factory/db.env; set +a
#
# The copy of development is fresh, not daily: before each session the script asks development
# whether anything changed since the cached dump, and dumps again only when it did.
# Development is read through FACTORY_MIRROR_URL (or the file FACTORY_MIRROR_URL_FILE, default
# ~/.config/factory/mirror.url), a read-only role. Nothing here ever writes to development.
# Without it, kit_mirror is not made and everything else works.
set -euo pipefail

cmd="${1:-up}"
root="$(git rev-parse --show-toplevel)"
dir="$root/.factory"
data="$dir/pg"
envfile="$dir/db.env"
cache="${FACTORY_MIRROR_CACHE:-$HOME/.cache/factory-mirror}"
mkdir -p "$dir"

bin() {
  # Postgres server binaries: FACTORY_PG_BIN, the newest Debian install, or PATH (Homebrew on a Mac).
  if [ -n "${FACTORY_PG_BIN:-}" ]; then echo "$FACTORY_PG_BIN"; return; fi
  local d
  d=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
  if [ -n "$d" ]; then echo "$d"; return; fi
  dirname "$(command -v initdb)"
}
PGBIN="$(bin)"

port() {
  # One port per worktree, stable across up/down, away from 5432 so a laptop's own Postgres is untouched.
  if [ -f "$dir/pg.port" ]; then cat "$dir/pg.port"; return; fi
  local p
  p=$((55000 + $(printf '%s' "$root" | cksum | cut -d' ' -f1) % 900))
  while (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; do p=$((p + 1)); done
  echo "$p" > "$dir/pg.port"
  echo "$p"
}

url() { echo "postgresql://kit@127.0.0.1:$(port)/$1"; }
psql_local() { "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$(port)" -U kit "$@"; }

mirror_source() {
  if [ -n "${FACTORY_MIRROR_URL:-}" ]; then echo "$FACTORY_MIRROR_URL"; return; fi
  local f="${FACTORY_MIRROR_URL_FILE:-$HOME/.config/factory/mirror.url}"
  if [ -r "$f" ]; then tr -d '\n' < "$f"; fi
}

start() {
  if [ ! -f "$data/PG_VERSION" ]; then
    "$PGBIN/initdb" -D "$data" -U kit --auth=trust --encoding=UTF8 --locale=C > "$dir/pg.init.log" 2>&1
  fi
  if ! "$PGBIN/pg_ctl" -D "$data" status > /dev/null 2>&1; then
    # macOS refuses to start the postmaster without a valid locale in the environment.
    LC_ALL=C "$PGBIN/pg_ctl" -D "$data" -l "$dir/pg.log" -w -t 60 \
      -o "-p $(port) -k /tmp -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" start > /dev/null
  fi
  psql_local -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'kit_api_test'" | grep -q 1 || psql_local -d postgres -c "CREATE DATABASE kit_api_test"
}

# The cached dump of development, refreshed when development changed since it was taken.
fresh_dump() {
  local src="$1" stamp now
  mkdir -p "$cache"
  now=$(PGCONNECT_TIMEOUT=10 "$PGBIN/psql" -X -At "$src" -c \
    "SELECT coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) || ':' || (SELECT count(*) FROM pg_stat_user_tables) FROM pg_stat_user_tables" 2> /dev/null || true)
  if [ -z "$now" ]; then
    [ -f "$cache/dev.dump" ] && { echo "development unreachable; using the cached dump" >&2; echo "$cache/dev.dump"; return; }
    echo "development unreachable and no cached dump" >&2; return 1
  fi
  (
    if command -v flock > /dev/null; then flock 9; fi
    stamp=$(cat "$cache/dev.stamp" 2> /dev/null || true)
    if [ "$stamp" != "$now" ] || [ ! -f "$cache/dev.dump" ]; then
      "$PGBIN/pg_dump" --format=custom --no-owner --no-acl --file "$cache/dev.dump.tmp" "$src"
      mv "$cache/dev.dump.tmp" "$cache/dev.dump"
      echo "$now" > "$cache/dev.stamp"
    fi
  ) 9> "$cache/lock"
  echo "$cache/dev.dump"
}

mirror() {
  local src dump
  src="$(mirror_source)"
  if [ -z "$src" ]; then echo "no FACTORY_MIRROR_URL: kit_mirror is not made" >&2; return 0; fi
  dump="$(fresh_dump "$src")" || return 0
  psql_local -d postgres -c "DROP DATABASE IF EXISTS kit_mirror" -c "CREATE DATABASE kit_mirror"
  "$PGBIN/pg_restore" --no-owner --no-acl -h 127.0.0.1 -p "$(port)" -U kit -d kit_mirror "$dump" 2> "$dir/mirror.restore.log" || true
  # The baseline the report compares against: the schema as development has it, and zeroed row counters.
  psql_local -d kit_mirror -At -c "SELECT table_name || '.' || column_name || ':' || data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1" > "$dir/mirror.schema.before"
  psql_local -d kit_mirror -c "SELECT pg_stat_reset()" > /dev/null
}

write_env() {
  {
    echo "API_TEST_DATABASE_URL=$(url kit_api_test)"
    echo "DATABASE_URL=$(url kit_api_test)"
    if psql_local -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'kit_mirror'" | grep -q 1; then
      echo "MIRROR_DATABASE_URL=$(url kit_mirror)"
    fi
  } > "$envfile"
}

report() {
  psql_local -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'kit_mirror'" | grep -q 1 || { echo '{"mirror":false}'; return; }
  local after
  after="$(psql_local -d kit_mirror -At -c "SELECT table_name || '.' || column_name || ':' || data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1")"
  local rows
  rows="$(psql_local -d kit_mirror -At -c "SELECT coalesce(json_agg(json_build_object('table', relname, 'inserted', n_tup_ins, 'updated', n_tup_upd, 'deleted', n_tup_del) ORDER BY relname), '[]') FROM pg_stat_user_tables WHERE n_tup_ins + n_tup_upd + n_tup_del > 0")"
  node -e '
    const [before, after, rows] = process.argv.slice(1);
    const a = new Set(before.split("\n").filter(Boolean)), b = new Set(after.split("\n").filter(Boolean));
    console.log(JSON.stringify({ mirror: true, schema: { added: [...b].filter((x) => !a.has(x)), removed: [...a].filter((x) => !b.has(x)) }, rows: JSON.parse(rows) }));
  ' "$(cat "$dir/mirror.schema.before" 2> /dev/null || true)" "$after" "$rows"
}

case "$cmd" in
  up)
    start
    mirror
    write_env
    echo "factory-db up on port $(port): $(tr '\n' ' ' < "$envfile")"
    ;;
  down)
    if [ -f "$data/PG_VERSION" ]; then "$PGBIN/pg_ctl" -D "$data" -m fast stop > /dev/null 2>&1 || true; fi
    rm -rf "$data" "$envfile" "$dir/pg.port" "$dir/pg.log" "$dir/pg.init.log" "$dir/mirror.schema.before" "$dir/mirror.restore.log"
    echo "factory-db down"
    ;;
  migrate)
    # Proves the branch's migrations run on development's real data, not only on an empty database.
    node --input-type=module -e '
      const { migrate } = await import(process.argv[1]);
      await migrate(process.argv[2], process.argv[3]);
      console.log("migrations applied to kit_mirror");
    ' "$root/packages/db/dist/migrate.js" "$(url kit_mirror)" "$root/packages/db/migrations"
    ;;
  report) report ;;
  env) cat "$envfile" ;;
  *) echo "usage: factory-db.sh up|down|migrate|report|env" >&2; exit 2 ;;
esac
