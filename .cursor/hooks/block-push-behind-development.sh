#!/usr/bin/env bash
# Factory ratchet (KIT-23): deny git push when the pushed branch is behind origin/development.
# Prevents repeating checker fails from unmergeable PRs (branch never rebased after development moved).
# The pushed branch is evaluated in the directory the push runs in (hook input `cwd`, then
# `git -C <dir>` / `cd <dir> &&` prefixes), not in the hook's own working directory: a session in a
# git worktree pushes from the worktree while the hook runs in the main checkout.
# When the directory or the pushed ref cannot be determined with certainty, the base directory's
# HEAD is checked (never a more permissive result).
# Stdin: Cursor / Claude Code hook JSON. Stdout: {"permission":"allow"|"deny"}.

set -u

allow() { printf '%s\n' '{"permission":"allow"}'; exit 0; }
deny() {
  printf '%s\n' "{\"permission\":\"deny\",\"user_message\":\"$1\",\"agent_message\":\"$1\"}"
  exit 2
}

INPUT=$(cat || true)

# Parse the input and (for git push commands) the push targets.
# Output: first line SKIP (not a gated push) or PUSH; then one "<dir><TAB><source ref>" line per target
# (empty source ref = the directory's HEAD).
PLAN=$(printf '%s' "$INPUT" | HOOK_CWD="$PWD" node -e '
const path = require("node:path");
let d = "";
process.stdin.on("data", (c) => { d += c; });
process.stdin.on("end", () => {
  let j;
  try { j = JSON.parse(d); } catch { return; }
  const command = String(j.command ?? j.tool_input?.command ?? "");
  if (!command) return;
  // Only gate git push (not fetch, pull, or other git commands). `git -C <dir> push` and similar
  // prefixes are found by the parser below; the plain textual form also gates when unparsable.
  const textual = /git[ \t\r\n\f\v]+push\b/.test(command);
  if (!textual && !/\bgit\b[^;&|\n]*\bpush\b/.test(command)) return;
  // A branch delete (`--delete`, `-d`, or an empty-source refspec `:branch`) uploads no commits,
  // so it cannot create an unmergeable PR. Deleting a merged branch must not need a rebase.
  if (/(^|[ \t\r\n\f\v])(--delete|-d)([ \t\r\n\f\v]|$)|[ \t\r\n\f\v]:[^ \t\r\n\f\v]/.test(command)) return;

  const base = typeof j.cwd === "string" && path.isAbsolute(j.cwd) ? j.cwd : process.env.HOOK_CWD;

  // Conservative shell tokenizer: words and operators; unquoted expansions mark a word uncertain.
  const tokens = [];
  let cur = null;
  let i = 0;
  const push = () => { if (cur) { tokens.push(cur); cur = null; } };
  while (i < command.length) {
    const ch = command[i];
    if (ch === "\x27" || ch === "\"") {
      const end = command.indexOf(ch, i + 1);
      cur ??= { v: "", u: false };
      if (end < 0) { cur.u = true; break; }
      const inner = command.slice(i + 1, end);
      if (ch === "\"" && /[$`\\]/.test(inner)) cur.u = true;
      cur.v += inner;
      i = end + 1;
      continue;
    }
    if (/[ \t]/.test(ch)) { push(); i++; continue; }
    if (/[;&|\n]/.test(ch)) {
      push();
      let op = ch;
      while (i + 1 < command.length && command[i + 1] === ch && ch !== "\n" && ch !== ";") { op += ch; i++; }
      tokens.push({ op });
      i++;
      continue;
    }
    cur ??= { v: "", u: false };
    if (/[$`\\(){}~*?<>]/.test(ch)) cur.u = true;
    cur.v += ch;
    i++;
  }
  push();

  const targets = [];
  let parsedAny = false;
  let dir = base; // null = unknown
  const segments = [[]];
  for (const t of tokens) {
    if (t.op) segments.push([]); else segments.at(-1).push(t);
  }
  for (const seg of segments) {
    if (seg.length === 0) continue;
    if (seg[0].v === "cd" && !seg[0].u) {
      const arg = seg[1];
      if (dir !== null && seg.length === 2 && arg && !arg.u && arg.v !== "-" && arg.v !== "") {
        dir = path.resolve(dir, arg.v);
      } else {
        dir = null;
      }
      continue;
    }
    const gi = seg.findIndex((t) => t.v === "git" || t.v.endsWith("/git"));
    if (gi < 0) continue;
    let segDir = dir;
    let k = gi + 1;
    let unsure = false;
    for (; k < seg.length; k++) {
      const t = seg[k];
      if (t.v === "-C") {
        const a = seg[k + 1];
        if (!a || a.u || a.v === "" || segDir === null) { unsure = true; k++; continue; }
        segDir = path.resolve(segDir, a.v);
        k++;
      } else if (t.v === "-c" || t.v === "--namespace") {
        k++;
      } else if (/^--(git-dir|work-tree)/.test(t.v)) {
        unsure = true;
        if (!t.v.includes("=")) k++;
      } else if (t.v.startsWith("-")) {
        continue;
      } else break;
    }
    if (seg[k]?.v !== "push") continue;
    parsedAny = true;
    const valueOpts = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
    const positional = [];
    let rest = false;
    for (let m = k + 1; m < seg.length; m++) {
      const t = seg[m];
      if (!rest && t.v === "--") { rest = true; continue; }
      if (!rest && t.v.startsWith("-")) { if (valueOpts.has(t.v)) m++; continue; }
      positional.push(t);
    }
    const useDir = unsure || segDir === null || /\t/.test(segDir) ? base : segDir;
    const refs = positional.slice(1);
    if (refs.length === 0) { targets.push([useDir, ""]); continue; }
    for (const r of refs) {
      if (r.u || /\t/.test(r.v)) { targets.push([useDir, ""]); continue; }
      const spec = r.v.replace(/^\+/, "");
      const colon = spec.indexOf(":");
      const src = colon >= 0 ? spec.slice(0, colon) : spec;
      if (src === "" || src.startsWith("-")) { targets.push([useDir, ""]); continue; }
      targets.push([useDir, src]);
    }
  }
  if (!parsedAny && !textual) return;
  if (!parsedAny || targets.length === 0) targets.push([base, ""]);
  const out = ["PUSH", ...targets.map(([a, b]) => `${a}\t${b}`)];
  process.stdout.write(out.join("\n") + "\n");
});
' 2>/dev/null || true)

[ "$(printf '%s\n' "$PLAN" | head -n 1)" = "PUSH" ] || allow

DENY_MSG=""
while IFS=$'\t' read -r DIR SRC; do
  [ -z "$DIR" ] && continue

  # Resolve the ref being pushed in that directory. An unresolvable source is checked as HEAD.
  REF="HEAD"
  if [ -n "$SRC" ] && [ "$SRC" != "HEAD" ] && git -C "$DIR" rev-parse --verify -q "${SRC}^{commit}" >/dev/null 2>&1; then
    REF="$SRC"
  fi
  if [ "$REF" = "HEAD" ]; then
    BRANCH=$(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  else
    BRANCH="${REF#refs/heads/}"
  fi

  # Never block pushes of the integration lane itself.
  if [ "$BRANCH" = "development" ] || [ "$BRANCH" = "staging" ] || [ "$BRANCH" = "production" ]; then
    continue
  fi

  # Fetch latest development ref (quiet, best-effort); skip this target when it fails.
  git -C "$DIR" fetch origin development --quiet 2>/dev/null || continue

  # If origin/development does not exist locally, skip this target.
  git -C "$DIR" rev-parse --verify origin/development >/dev/null 2>&1 || continue

  # Count commits on origin/development not reachable from the pushed ref.
  BEHIND=$(git -C "$DIR" rev-list --count "${REF}..origin/development" 2>/dev/null || echo "0")

  if [ "$BEHIND" -gt 0 ] 2>/dev/null; then
    DENY_MSG="BLOCKED: branch ${BRANCH:-HEAD} in ${DIR} is ${BEHIND} commit(s) behind origin/development. Merge or rebase origin/development in that checkout before pushing to avoid unmergeable PRs."
    break
  fi
done <<< "$(printf '%s\n' "$PLAN" | tail -n +2)"

[ -n "$DENY_MSG" ] && deny "$DENY_MSG"
allow
