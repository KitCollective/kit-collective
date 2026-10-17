#!/usr/bin/env bash
# Copies the keys the runs machine needs from this checkout's .env to the main checkout on the runs
# machine (bb-harness, docs/agents/bb-harness.md). Keys already there are left alone; values are never
# printed. Run it after adding a key here; Max's watchdog (staff/max/watchdog.js) also heals the three
# Linear keys on its own every 10 minutes.
#   bash scripts/sync-harness-env.sh [KEY ...]   default: LINEAR_API_KEY LINEAR_MAX_CLIENT_ID LINEAR_MAX_CLIENT_SECRET
set -euo pipefail
MACHINE="${RUNS_MACHINE:-host_new78xp362}"
ROOT="${RUN_CHECKOUT:-/home/node/work/kit-collective}"
KEYS=("$@")
[ ${#KEYS[@]} -gt 0 ] || KEYS=(LINEAR_API_KEY LINEAR_MAX_CLIENT_ID LINEAR_MAX_CLIENT_SECRET)
[ -f .env ] || { echo "sync-harness-env: no .env in $(pwd)" >&2; exit 2; }

remote=$(bb file read "$ROOT/.env" --host "$MACHINE" --root "$ROOT" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).content??""))')
add=""
for key in "${KEYS[@]}"; do
  if printf '%s\n' "$remote" | grep -qE "^\s*(export\s+)?${key}\s*=\s*\S"; then
    echo "$key: already on $MACHINE"
  elif line=$(grep -E "^\s*(export\s+)?${key}\s*=" .env | tail -1) && [ -n "$line" ]; then
    add+="$line"$'\n'
    echo "$key: copied"
  else
    echo "$key: not in this .env either" >&2
  fi
done
[ -n "$add" ] || exit 0
printf '%s\n%s' "${remote%$'\n'}" "$add" | bb file write "$ROOT/.env" --host "$MACHINE" --root "$ROOT" --stdin >/dev/null
echo "sync-harness-env: $ROOT/.env on $MACHINE updated"
