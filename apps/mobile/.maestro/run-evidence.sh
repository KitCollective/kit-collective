#!/usr/bin/env bash
# Runs the device flows for the current commit on this Mac and publishes the
# evidence (KIT-267, ADR-0048): screenshots and recordings to the evidence
# bucket, and for a PR the before/after comparison, the review, the PR comment, the Linear
# workpad links and the `Device flows` commit status.
#
#   apps/mobile/.maestro/local-api.sh     (terminal 1)
#   apps/mobile/.maestro/build-local.sh   (when apps/mobile changed since the last build)
#   apps/mobile/.maestro/run-evidence.sh  (terminal 2)
#
# Settings (R2 account keys, E2E_R2_BUCKET, E2E_EVIDENCE_BASE_URL,
# E2E_LINEAR_API_KEY) are read from the main checkout's .env, or from E2E_ENV_FILE.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"
env_file="${E2E_ENV_FILE:-$(cd "$(git -C "$here" rev-parse --git-common-dir)/.." && pwd)/.env}"
lane="$(node -p "require(process.argv[1]).lanes.integration" "$root/factory.config.json")"
repository="$(node -p "require(process.argv[1]).github.ownerRepo" "$root/factory.config.json")"
sha="$(git -C "$root" rev-parse HEAD)"

# shellcheck source=source-stamp.sh
source "$here/source-stamp.sh"
# shellcheck source=simulator.sh
source "$here/simulator.sh"
refuse_uncommitted "${app_sources[@]}" "${api_sources[@]}"
if [[ "$(cat "$stamp_dir/app-$E2E_SIMULATOR_UDID" 2>/dev/null)" != "$(source_stamp "${app_sources[@]}")" ]]; then
  echo "The app on the simulator was not built from $sha: run build-local.sh first." >&2
  exit 2
fi
if [[ "$(cat "$stamp_dir/api" 2>/dev/null)" != "$(source_stamp "${api_sources[@]}")" ]]; then
  echo "The local API was not started from $sha: restart local-api.sh first." >&2
  exit 2
fi

status() {
  gh api "repos/$repository/statuses/$sha" -f context="Device flows" -f state="$1" -f description="$2" >/dev/null
}

rm -rf "$here/out"
status pending "Running on the iOS Simulator"
# A run that stops before its verdict must not leave the status pending.
verdict_written=no
trap '[[ $verdict_written == yes ]] || status error "Evidence run stopped before a verdict"' EXIT
flows_status=success
"$here/run-local.sh" || flows_status=failure

node --env-file="$env_file" "$root/scripts/e2e/upload-run.mjs" "$sha" "$here/out"

export E2E_SHA="$sha" E2E_FLOWS_STATUS="$flows_status" E2E_REPOSITORY="$repository"
# The integration lane is decided first: an open promotion PR has that lane as
# its head, and its runs are the "before" for later PRs, not PR runs.
branch="$(git -C "$root" branch --show-current)"
if [[ "$branch" == "$lane" ]] || git -C "$root" merge-base --is-ancestor "$sha" "origin/$lane"; then
  export E2E_RUN_ORIGIN=integration
else
  # `gh pr view --repo` needs the branch named; without it gh finds no PR.
  pr_number="$(gh pr view "$branch" --repo "$repository" --json number --jq .number 2>/dev/null || true)"
  if [[ -z "$pr_number" ]]; then
    echo "No PR for $branch and $sha is not on origin/$lane: nothing to compare or record." >&2
    exit 2
  fi
  export E2E_RUN_ORIGIN=pr E2E_PR_NUMBER="$pr_number"
  E2E_PR_TITLE="$(gh pr view "$pr_number" --repo "$repository" --json title --jq .title)"
  E2E_GITHUB_TOKEN="$(gh auth token)"
  export E2E_PR_TITLE E2E_GITHUB_TOKEN
fi
node --env-file="$env_file" "$root/scripts/e2e/review-run.mjs"

verdict_written=yes
if [[ "$flows_status" == success ]]; then
  status success "All flows passed"
else
  status failure "A flow failed"
  exit 1
fi
