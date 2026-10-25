#!/usr/bin/env python3
"""Push paperclip/org/org.toml to KitCollective's Paperclip company.

    python3 paperclip/sync.py plan     # show what would change, write nothing
    python3 paperclip/sync.py apply    # create/update agents; new agents are paused

Board token: PAPERCLIP_BOARD_TOKEN, or read over SSH from PAPERCLIP_SSH_HOST
(default `guapo`) at /opt/guapo/secrets/board.token. The token is never printed.
API: PAPERCLIP_API_URL (default https://paperclip.optio.run).

Never edit agents in Paperclip's UI: this script overwrites name, role, title,
icon, reports-to, capabilities, adapter config, runtime config and instructions.
It never resumes a paused agent.
"""
from __future__ import annotations

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


def adapter_config(a: dict, defaults: dict) -> dict:
    if a["adapter"] == "process":
        return {"command": a["command"], "args": a.get("args", []), "timeoutSec": int(a.get("timeout_sec", 600))}
    d = {**defaults, **a}
    cfg = {
        "engine": d["engine"],
        "model": d["model"],
        "dangerouslySkipPermissions": bool(d["dangerously_skip_permissions"]),
        "timeoutSec": int(d["timeout_sec"]),
    }
    if d.get("effort"):
        cfg["effort"] = d["effort"]
    return cfg


def payload(a: dict, org: dict, ids: dict[str, str]) -> dict:
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
        "adapterConfig": adapter_config(a, defaults),
        # No timer and no wakes until the software-factory plugin is wired; the plugin turns wakes on.
        "runtimeConfig": {"heartbeat": {"enabled": False, "wakeOnDemand": False, "maxConcurrentRuns": concurrent}},
        "permissions": {"canCreateAgents": False},
        "budgetMonthlyCents": int(a.get("budget_monthly_cents", 0)),
        "instructionsBundle": {"entryFile": "INSTRUCTIONS.md",
                               "files": {"INSTRUCTIONS.md": (ORG_DIR / a["id"] / "INSTRUCTIONS.md").read_text()}},
        "metadata": {"kitId": a["id"], "managedBy": "paperclip/org/org.toml"},
    }


def run(apply: bool) -> None:
    org = load_org()
    token = board_token()
    name = org["company"]["name"]
    company = next((c for c in as_list(api("GET", "/api/companies", token), "companies") if c.get("name") == name), None)
    if company is None:
        sys.exit(f"No company named {name}. Create it in Paperclip first.")
    cid = company["id"]
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
            body = payload(a, org, ids)
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
                if apply:
                    # Permissions can only be set at creation; PATCH rejects them.
                    api("PATCH", f"/api/agents/{cur['id']}", token,
                        {k: v for k, v in body.items() if k not in ("instructionsBundle", "permissions")})
                    api("PATCH", f"/api/agents/{cur['id']}/instructions-bundle", token, body["instructionsBundle"])
                ids[a["id"]] = cur["id"]
            pending.remove(a)

    known = {a["id"] for a in org["agents"]} | {a["name"] for a in org["agents"]}
    for key, x in existing.items():
        if key not in known:
            print(f"! {x.get('name')} exists in Paperclip but not in org.toml (left alone)")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("plan", "apply"):
        sys.exit(__doc__)
    run(apply=sys.argv[1] == "apply")
