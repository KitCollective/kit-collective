# Paperclip

KitCollective's software organisation as code, for the `KitCollective` company on Paperclip (https://paperclip.optio.run, on Guapo's server).

```
CTO ─┬─ Tech Lead ─┬─ Fullstack Engineer
     │             └─ DevOps Engineer
     └─ QA Engineer ── Release Gate
```

Delivery (Tech Lead and below) never judges its own work: QA and Release Gate report through a separate line under the CTO.

- `org/org.toml` is the one source of truth: agents, models, reporting lines and adapter defaults.
- `org/<id>/INSTRUCTIONS.md` is each agent's job description.
- `sync.py` pushes both to Paperclip. Never edit agents in Paperclip's UI; the next sync overwrites them.

```bash
python3 paperclip/sync.py plan
```

```bash
python3 paperclip/sync.py apply
```

The script reads the board token over `ssh guapo` (or `PAPERCLIP_BOARD_TOKEN`) and never prints it. New agents are created paused with wakes off, and the script never resumes an agent.

## Claude subscription

`claude_local` agents use the Claude Code login stored in Paperclip's volume (`/paperclip/.claude`), on Nicklas's Max subscription (shared with Guapo's agents). Log in again, as the `node` user Paperclip runs as:

```bash
ssh -t guapo docker exec -it -u node guapo-paperclip claude auth login
```

## Workspace trust

Claude Code ignores the repo's `.claude/settings.json` (permissions and hooks) in a folder it has not been told to trust. The agents run in worktrees under `/paperclip/repos/kit-collective/.paperclip/worktrees/`, so the clone is trusted once in `/paperclip/.claude.json` (`projects["/paperclip/repos/kit-collective"].hasTrustDialogAccepted: true`), set on 2026-10-27 after KIT-509's run logged "Ignoring 2 permissions.allow entries … this workspace has not been trusted". A new clone or a wiped volume needs it again. With it, the repo's hooks apply to the agents as they do to anyone else.

## Not wired yet

- The software-factory plugin is installed with dispatch off (KitCollective/software-factory). Agents stay paused until a GitHub token and the repo workspace exist.
- A GitHub token for the agents (Fullstack pushes and opens PRs, QA reads, Release Gate merges).
- Repo checkout and worktrees for the agents on the server.
