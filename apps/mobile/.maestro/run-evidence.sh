#!/usr/bin/env bash
# Runs the device flows for the current commit on this Mac and publishes the
# evidence (KIT-267, ADR-0048): screenshots and recordings to lane R2, and for a
# PR the before/after comparison, the review, the PR comment, the Linear
# workpad links and the `Device flows` commit status.
#
#   apps/mobile/.maestro/local-api.sh     (terminal 1)
#   apps/mobile/.maestro/build-local.sh   (when apps/mobile changed since the last build)
#   apps/mobile/.maestro/run-evidence.sh  (terminal 2)
#
# Lane settings (R2_*, E2E_EVIDENCE_BASE_URL, LINEAR_API_KEY, E2E_REVIEW_API_KEY,
# E2E_REVIEW_MODEL) are read from the main checkout's .env, or from E2E_ENV_FILE.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"
env_file="${E2E_ENV_FILE:-$(cd "$(git -C "$here" rev-parse --git-common-dir)/.." && pwd)/.env}"
lane="$(node -p "require('$root/factory.config.json').lanes.integration")"
repository="$(node -p "require('$root/factory.config.json').github.ownerRepo")"
sha="$(git -C "$root" rev-parse HEAD)"

if [[ -n "$(git -C "$root" status --porcelain -- apps/mobile apps/api packages)" ]]; then
  echo "Uncommitted changes under apps/ or packages/: evidence is keyed by commit, so commit first." >&2
  exit 2
fi

status() {
  gh api "repos/$repository/statuses/$sha" -f context="Device flows" -f state="$1" -f description="$2" >/dev/null
}

rm -rf "$here/out"
status pending "Running on the iOS Simulator"
flows_status=success
"$here/run-local.sh" || flows_status=failure

node --env-file="$env_file" "$root/scripts/e2e/upload-run.mjs" "$sha" "$here/out"

pr_number="$(gh pr view --repo "$repository" --json number --jq .number 2>/dev/null || true)"
export E2E_SHA="$sha" E2E_FLOWS_STATUS="$flows_status" E2E_REPOSITORY="$repository"
if [[ -n "$pr_number" ]]; then
  export E2E_EVENT=pull_request E2E_PR_NUMBER="$pr_number"
  E2E_PR_TITLE="$(gh pr view --repo "$repository" --json title --jq .title)"
  E2E_GITHUB_TOKEN="$(gh auth token)"
  export E2E_PR_TITLE E2E_GITHUB_TOKEN
elif git -C "$root" merge-base --is-ancestor "$sha" "origin/$lane"; then
  # A commit on the integration lane becomes a "before" for later PRs.
  export E2E_EVENT=push
else
  echo "No PR for this branch and $sha is not on origin/$lane: nothing to compare or record." >&2
  exit 2
fi
node --env-file="$env_file" "$root/scripts/e2e/review-run.mjs"

if [[ "$flows_status" == success ]]; then
  status success "All flows passed"
else
  status failure "A flow failed"
  exit 1
fi
