#!/usr/bin/env python3
"""Push paperclip/org/org.toml to KitCollective's Paperclip company.

    python3 paperclip/sync.py plan     # show what would change, write nothing
    python3 paperclip/sync.py apply    # create/update agents; new agents are paused
    python3 paperclip/sync.py resume   # turn the loop on: wakes on, agents resumed
    python3 paperclip/sync.py pause    # turn the loop off: agents paused, wakes off

Board token: PAPERCLIP_BOARD_TOKEN, or read over SSH from PAPERCLIP_SSH_HOST
(default `guapo`) at /opt/guapo/secrets/board.token. The token is never printed.
API: PAPERCLIP_API_URL (default https://paperclip.optio.run).

Never edit agents in Paperclip's UI: this script overwrites name, role, title,
icon, reports-to, capabilities, adapter config, runtime config and instructions.
It never resumes a paused agent.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tomllib
import urllib.error
import urllib.request
from pathlib import Path

ORG_DIR = Path(__file__).resolve().parent / "org"
API = os.environ.get("PAPERCLIP_API_URL", "https://paperclip.optio.run").rstrip("/")
FORBIDDEN_MODEL = "fable"


def board_token() -> str:
    token = os.environ.get("PAPERCLIP_BOARD_TOKEN", "").strip()
    if token:
        return token
    host = os.environ.get("PAPERCLIP_SSH_HOST", "guapo")
    out = subprocess.run(["ssh", "-o", "BatchMode=yes", host, "cat /opt/guapo/secrets/board.token"],
                         capture_output=True, text=True, timeout=30)
    if out.returncode != 0 or not out.stdout.strip():
        sys.exit(f"No board token: set PAPERCLIP_BOARD_TOKEN or make `ssh {host}` work.")
    return out.stdout.strip()


def api(method: str, path: str, token: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> {e.code}: {e.read().decode(errors='replace')[:500]}")


def as_list(resp, key: str) -> list:
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        for k in (key, "items", "data"):
            if isinstance(resp.get(k), list):
                return resp[k]
    return []


def load_org() -> dict:
    org = tomllib.loads((ORG_DIR / "org.toml").read_text())
    ids = [a["id"] for a in org["agents"]]
    if len(ids) != len(set(ids)):
        sys.exit("org.toml: duplicate agent id")
    for a in org["agents"]:
        if a.get("reports_to") and a["reports_to"] not in ids:
            sys.exit(f"org.toml: {a['id']} reports to unknown {a['reports_to']}")
        if FORBIDDEN_MODEL in str(a.get("model", "")).lower():
            sys.exit(f"org.toml: {a['id']} uses Fable, which the factory never uses")
        if a["adapter"] == "claude_local" and not a.get("model"):
            sys.exit(f"org.toml: {a['id']} needs an explicit model (empty means Opus)")
        if not (ORG_DIR / a["id"] / "INSTRUCTIONS.md").exists():
            sys.exit(f"org.toml: missing org/{a['id']}/INSTRUCTIONS.md")
    return org


def env_bindings(a: dict, secrets: dict[str, str], plain: dict | None = None) -> dict:
    env = {var: {"type": "plain", "value": str(value)} for var, value in (plain or {}).items()}
    for var, name in (a.get("secrets") or {}).items():
        if name not in secrets:
            sys.exit(f"org.toml: {a['id']} needs secret {name}, which is not in the company. Create it in Paperclip first.")
        env[var] = {"type": "secret_ref", "secretId": secrets[name]}
    return env


def adapter_config(a: dict, defaults: dict, secrets: dict[str, str]) -> dict:
    plain = {**defaults.get("env", {}), **a.get("env", {})} if a["adapter"] != "process" else a.get("env", {})
    env = env_bindings(a, secrets, plain)
    if a["adapter"] == "process":
        cfg = {"command": a["command"], "args": a.get("args", []), "timeoutSec": int(a.get("timeout_sec", 600))}
        if env:
            cfg["env"] = env
        return cfg
    d = {**defaults, **a}
    cfg = {
        "engine": d["engine"],
        "model": d["model"],
        "dangerouslySkipPermissions": bool(d["dangerously_skip_permissions"]),
        "timeoutSec": int(d["timeout_sec"]),
    }
    if d.get("effort"):
        cfg["effort"] = d["effort"]
    if env:
        cfg["env"] = env
    return cfg


def payload(a: dict, org: dict, ids: dict[str, str], secrets: dict[str, str]) -> dict:
    defaults = org.get("defaults", {}).get("claude", {})
    concurrent = int({**defaults, **a}.get("max_concurrent_runs", 1))
    return {
        "name": a["name"],
        "role": a["role"],
        "title": a["title"],
        "icon": a["icon"],
        "reportsTo": ids.get(a["reports_to"]) if a.get("reports_to") else None,
        "capabilities": a["capabilities"],
        "adapterType": a["adapter"],
        "adapterConfig": adapter_config(a, defaults, secrets),
        # No timer and no wakes until the software-factory plugin is wired; the plugin turns wakes on.
        "runtimeConfig": {"heartbeat": {"enabled": False, "wakeOnDemand": False, "maxConcurrentRuns": concurrent}},
        "permissions": {"canCreateAgents": False},
        "budgetMonthlyCents": int(a.get("budget_monthly_cents", 0)),
        "instructionsBundle": {"entryFile": "INSTRUCTIONS.md",
                               "files": {"INSTRUCTIONS.md": (ORG_DIR / a["id"] / "INSTRUCTIONS.md").read_text()}},
        "metadata": {"kitId": a["id"], "managedBy": "paperclip/org/org.toml"},
    }


def push_instructions(agent_id: str, bundle: dict, token: str) -> None:
    """Writes the entry file when Paperclip holds other content.

    PATCH /instructions-bundle only sets the mode and entry file; it drops `files` without an error.
    Content goes through PUT /instructions-bundle/file, with the hash of what it replaces.
    """
    entry = bundle["entryFile"]
    content = bundle["files"][entry]
    cur = api("GET", f"/api/agents/{agent_id}/instructions-bundle", token)
    held = next((f for f in cur.get("files", []) if f.get("path") == entry), None)
    want = hashlib.sha256(content.encode()).hexdigest()
    if held and held.get("contentHash") == want:
        return
    api("PUT", f"/api/agents/{agent_id}/instructions-bundle/file", token,
        {"path": entry, "content": content, "baseHash": held.get("contentHash") if held else None})
    print(f"  instructions {entry} updated")


def sync_project(org: dict, cid: str, token: str, apply: bool) -> str | None:
    p = org.get("project")
    if not p:
        return None
    policy = {
        "enabled": True,
        "defaultMode": "isolated_workspace",
        "allowIssueOverride": False,
        "workspaceStrategy": {
            "type": "git_worktree",
            "baseRef": p["base_ref"],
            "branchTemplate": p["branch_template"],
            **({"provisionCommand": p["provision_command"]} if p.get("provision_command") else {}),
            **({"teardownCommand": p["teardown_command"]} if p.get("teardown_command") else {}),
        },
    }
    projects = as_list(api("GET", f"/api/companies/{cid}/projects", token), "projects")
    cur = next((x for x in projects if x.get("name") == p["name"]), None)
    if cur is None:
        print(f"+ project {p['name']} (worktrees from {p['base_ref']})")
        if not apply:
            return None
        cur = api("POST", f"/api/companies/{cid}/projects", token, {"name": p["name"], "description": p.get("description")})
    else:
        print(f"~ project {p['name']}: policy re-pushed")
    if not apply:
        return cur["id"]
    workspaces = as_list(api("GET", f"/api/projects/{cur['id']}/workspaces", token), "workspaces")
    ws = next((w for w in workspaces if w.get("cwd") == p["cwd"]), None)
    if ws is None:
        ws = api("POST", f"/api/projects/{cur['id']}/workspaces", token,
                 {"name": "primary", "cwd": p["cwd"], "repoUrl": p["repo_url"], "defaultRef": p["base_ref"], "isPrimary": True})
        print(f"  + workspace {p['cwd']}")
    policy["defaultProjectWorkspaceId"] = ws["id"]
    api("PATCH", f"/api/projects/{cur['id']}", token, {"description": p.get("description"), "executionWorkspacePolicy": policy})
    return cur["id"]


def run(apply: bool) -> None:
    org = load_org()
    token = board_token()
    name = org["company"]["name"]
    company = next((c for c in as_list(api("GET", "/api/companies", token), "companies") if c.get("name") == name), None)
    if company is None:
        sys.exit(f"No company named {name}. Create it in Paperclip first.")
    cid = company["id"]
    # Secret names to ids. Values are never read.
    secrets = {s["name"]: s["id"] for s in as_list(api("GET", f"/api/companies/{cid}/secrets", token), "secrets")}
    project_id = sync_project(org, cid, token, apply)
    if project_id:
        print(f"  project id {project_id} (set it as projectId in the software-factory plugin config)")
    existing = {}
    for x in as_list(api("GET", f"/api/companies/{cid}/agents", token), "agents"):
        key = (x.get("metadata") or {}).get("kitId") or x.get("name")
        existing[key] = x

    ids: dict[str, str] = {}
    pending = list(org["agents"])
    while pending:
        ready = [a for a in pending if not a.get("reports_to") or a["reports_to"] in ids]
        if not ready:
            sys.exit("org.toml: reports_to has a cycle")
        for a in ready:
            body = payload(a, org, ids, secrets)
            cur = existing.get(a["id"]) or existing.get(a["name"])
            if cur is None:
                print(f"+ {a['name']} ({a['adapter']}, {body['adapterConfig'].get('model', 'no model')}) — created paused")
                if apply:
                    cur = api("POST", f"/api/companies/{cid}/agents", token, body)
                    api("POST", f"/api/agents/{cur['id']}/pause", token, {})
                ids[a["id"]] = cur["id"] if cur else f"<new:{a['id']}>"
            else:
                changed = [k for k in ("name", "role", "title", "icon", "reportsTo", "capabilities", "adapterType")
                           if cur.get(k) != body[k]]
                print(f"~ {a['name']}: {', '.join(changed) or 'fields unchanged'}; instructions and config re-pushed")
                # Keep whatever resume/pause set; apply never turns wakes on or off.
                body["runtimeConfig"]["heartbeat"]["wakeOnDemand"] = bool(
                    ((cur.get("runtimeConfig") or {}).get("heartbeat") or {}).get("wakeOnDemand", False))
                if apply:
                    # Permissions can only be set at creation; PATCH rejects them.
                    api("PATCH", f"/api/agents/{cur['id']}", token,
                        {k: v for k, v in body.items() if k not in ("instructionsBundle", "permissions")})
                    push_instructions(cur["id"], body["instructionsBundle"], token)
                ids[a["id"]] = cur["id"]
            pending.remove(a)

    known = {a["id"] for a in org["agents"]} | {a["name"] for a in org["agents"]}
    for key, x in existing.items():
        if key not in known:
            print(f"! {x.get('name')} exists in Paperclip but not in org.toml (left alone)")


def switch(on: bool) -> None:
    """Turn every org.toml agent on or off. apply never does this by itself."""
    org = load_org()
    token = board_token()
    cid = next(c["id"] for c in as_list(api("GET", "/api/companies", token), "companies") if c.get("name") == org["company"]["name"])
    names = {a["name"] for a in org["agents"]}
    for x in as_list(api("GET", f"/api/companies/{cid}/agents", token), "agents"):
        if x.get("name") not in names:
            continue
        hb = {**((x.get("runtimeConfig") or {}).get("heartbeat") or {}), "wakeOnDemand": on}
        api("PATCH", f"/api/agents/{x['id']}", token, {"runtimeConfig": {**(x.get("runtimeConfig") or {}), "heartbeat": hb}})
        api("POST", f"/api/agents/{x['id']}/{'resume' if on else 'pause'}", token, {})
        print(f"{'on ' if on else 'off'} {x['name']}")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("plan", "apply", "resume", "pause"):
        sys.exit(__doc__)
    if sys.argv[1] in ("resume", "pause"):
        switch(sys.argv[1] == "resume")
    else:
        run(apply=sys.argv[1] == "apply")
