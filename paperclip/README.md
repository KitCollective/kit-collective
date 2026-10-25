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

## Not wired yet

- The software-factory plugin (dispatch, factory state, the Merging rule). Until it exists every agent stays paused.
- The Claude subscription login for `claude_local`: Nicklas runs `claude setup-token` and adds it as a company secret.
- Release Gate's step runner (`factory gate-run`); its command exits 1 until then.
- Repo checkout and worktrees for the agents on the server.
