# shellcheck shell=bash
# Evidence is keyed by commit, so the installed app and the running API must be
# built from that commit's sources (KIT-267). A stamp is the hash of the tracked
# files a build reads; build-local.sh and local-api.sh write one, and
# run-evidence.sh refuses to run when either differs from HEAD.
stamp_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.stamps"
stamp_root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"

# source_stamp <path>...: hash of HEAD's tracked files under the paths, flows excluded.
source_stamp() {
  git -C "$stamp_root" ls-tree -r HEAD -- "$@" | grep -v '/\.maestro/' | git hash-object --stdin
}

# refuse_uncommitted <path>...: a stamp of HEAD says nothing about a dirty tree.
refuse_uncommitted() {
  if [[ -n "$(git -C "$stamp_root" status --porcelain -- "$@" | grep -v '/\.maestro/' || true)" ]]; then
    echo "Uncommitted changes under $*: commit first, the build is stamped with the commit's sources." >&2
    exit 2
  fi
}

# refuse_uncommitted_flows: the flows and the evidence scripts are not part of a
# build, but a status and screenshots keyed by a commit must come from that
# commit's flows too.
refuse_uncommitted_flows() {
  if [[ -n "$(git -C "$stamp_root" status --porcelain -- apps/mobile/.maestro scripts/e2e)" ]]; then
    echo "Uncommitted changes under apps/mobile/.maestro or scripts/e2e: commit first, evidence is keyed by commit." >&2
    exit 2
  fi
}

app_sources=(apps/mobile packages pnpm-lock.yaml)
api_sources=(apps/api packages pnpm-lock.yaml)
