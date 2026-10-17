# Operating settings live in Optio, rules live in the repo

Nicklas, 2026-10-17. Status: accepted. Terms: **Operating setting**, **Loop**, **Staff**, **Charter** in `CONTEXT.md`.

Optio gets pages for Loops and Staff, and Nicklas wants to turn things on and off and change limits there without a pull request. But the Loop registry is in `factory.config.json` and a Staff member is defined by their Charter, and both are factory paths that only change by review, so that a run cannot loosen the rules it is judged by (ADR-0061, ADR-0064).

## Decision

1. **An Operating setting is changed from Optio and stored in Optio's database**, with who changed it and when: a Loop or Staff member on or off, a cap (live runs, starts per day), a schedule, a model, a budget, a pause. It overrides the same value in `factory.config.json` or the Charter while it is set, and clearing it falls back to the file.
2. **Everything that says what a Loop or Staff member is, or may do, stays in the repo:** a Loop's trigger, workflow, roles and hand-over; a Staff member's tools and access, what they own and what they must never do. Optio's Update button for these opens a pull request to the Charter or `factory.config.json`, and it lands like any other factory change, by a person.
3. **An override is visible where the value is shown** (the Loops page, the Staff member's header), so the file is never silently out of date.

## Considered options

- Everything in the repo (read-only pages): safe, but pausing a Loop at night takes a pull request.
- Everything in Optio: fast, but an agent's access could grow without a review or a trace.

## Consequences

- Optio reads every Loop and Staff value as override-or-file, and the Board and the scripts that read `factory.config.json` directly must go through it, or ignore overrides they do not support and say so.
- Reverting means deleting overrides, which is easy; moving rules into the database later would need a new ADR.
