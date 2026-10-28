# Paperclip

KitCollective's software organisation as code, for the `KitCollective` company on Paperclip (https://paperclip.optio.run, on Guapo's server).

```
CTO ─┬─ Tech Lead ─┬─ Fullstack Engineer
     │             └─ DevOps Engineer
     └─ QA Engineer ── Release Gate
```

Delivery (Tech Lead and below) never judges its own work: QA and Release Gate report through a separate line under the CTO.

The team is Optio's software-team template (`eskobar95/optio`, `templates/software-team`): the agents, their job descriptions, `sync.py` and the skill pack (`build`, `review`, the five principles). This repo keeps only what is KitCollective's own:

- `company.toml`: the company, the project (repo, base ref, the database script as provision and teardown), the values filled into the instructions, and KitCollective's overrides of the Fullstack and DevOps capabilities.
- `agents/<id>.md`: KitCollective's own lines in an agent's job description.
- `.cursor/skills/verify/SKILL.md`, `scripts/factory-db.sh` and `factory.config.json`: the repo contract the skill pack and the loop read.

Change the team in Optio, not here. Never edit agents in Paperclip's UI or the installed skills in `.cursor/skills/build`, `review` and `principle-*`; the next sync or install overwrites them. With an Optio checkout next to this repo:

```bash
python3 ../optio/templates/software-team/sync.py paperclip/company.toml plan
```

```bash
python3 ../optio/templates/software-team/sync.py paperclip/company.toml apply
```

```bash
../optio/templates/software-team/install-skills.sh .
```

The script reads the board token over `ssh guapo` (or `PAPERCLIP_BOARD_TOKEN`) and never prints it. New agents are created paused with wakes off, and the script never resumes an agent.

## Claude subscription

`claude_local` agents use the Claude Code login stored in Paperclip's volume (`/paperclip/.claude`), on Nicklas's Max subscription (shared with Guapo's agents). Log in again, as the `node` user Paperclip runs as:

```bash
ssh -t guapo docker exec -it -u node optio-paperclip claude auth login
```

## Workspace trust

Claude Code ignores the repo's `.claude/settings.json` (permissions and hooks) in a folder it has not been told to trust. The agents run in worktrees under `/paperclip/repos/kit-collective/.paperclip/worktrees/`, so the clone is trusted once in `/paperclip/.claude.json` (`projects["/paperclip/repos/kit-collective"].hasTrustDialogAccepted: true`), set on 2026-10-27 after KIT-509's run logged "Ignoring 2 permissions.allow entries … this workspace has not been trusted". A new clone or a wiped volume needs it again. With it, the repo's hooks apply to the agents as they do to anyone else.

## Not wired yet

- The software-factory plugin is installed with dispatch off (`eskobar95/optio`, `plugins/software-factory`). Agents stay paused until a GitHub token and the repo workspace exist.
- A GitHub token for the agents (Fullstack pushes and opens PRs, QA reads, Release Gate merges).
- Repo checkout and worktrees for the agents on the server.

## Each issue's own database

Paperclip runs `bash ./scripts/factory-db.sh up` when it creates an issue's worktree and `down` when it closes it after land (`provision_command` and `teardown_command` in `org.toml`). The script starts a Postgres inside the worktree with an empty `kit_api_test` for the API tests and `kit_mirror`, a copy of the development database, and writes the connections to `db.env` in the worktree's `.factory` folder.

The copy is fresh: before each session the script asks development whether anything changed since the cached dump (in `~/.cache/factory-mirror`) and dumps again only when it did. It reads development through the role `factory_mirror`, which can only read (created 2026-10-28, `default_transaction_read_only`). Its connection lives in the file `mirror.url` in `.config/factory` under the home folder: `/paperclip` on the server (mode 600), your own home on a laptop. Without that file the script still makes `kit_api_test`.

The Paperclip image needs the Postgres 17 programs (`initdb`, `pg_ctl`, `pg_dump`, `pg_restore`); Optio's platform image installs them (`eskobar95/optio`, `platform/paperclip/Dockerfile`).
