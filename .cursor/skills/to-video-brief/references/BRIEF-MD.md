# `{paths.specs}/video/<slug>/brief.md` template

One file per video. Write it in English; quote spoken lines verbatim in the language they ship in.

Every field is either answered or marked **workflow-pinned** with the workflow's own value, so a reader can tell a decision from a deferral. Delete a field only when the chosen workflow has no such input.

```markdown
# Video brief — [slug]

**Workflow**: [name from get_workflow_instructions] — chosen over [sibling] because [the hinge]
**Date**: [date]
**Lock**: docs/video-system.md as of [date]

## Job

**Outcome**: [what changes for us if this works — an install, a waitlist signup, a first upload]
**Audience**: [who, in one line — a collector persona, not a demographic bucket]
**Promise**: [the one thing the viewer should believe afterwards, in one sentence]
**Where it runs**: [platform and placement]

## Script inputs

**Hook intent**: [the promise the opening seconds must land. The workflow writes the wording.]
**Beats in order**: [what the viewer sees and hears, in sequence — one line per beat]
**Closer / CTA**: [the final action on screen and in the voice]
**Domain words**: [terms from CONTEXT.md the script must use, and the near-miss synonyms it must not]

## Claims

| Claim | Allowed wording | Why we can stand behind it |
| --- | --- | --- |

**Off limits**: [claims the script must not make — numbers we do not have, guarantees we do not offer]

## Craft

**Language and accent**: [spoken language; accent; explicit override if the workflow defaults elsewhere]
**Duration**: [seconds — the workflow derives its clip count from this]
**Aspect and resolution**: [or *workflow-pinned*]
**Captions**: [the workflow's caption mode, or *workflow-pinned*]
**Creator persona**: [a supplied photo with consent, or generated to the lock's persona, or none]
**On screen**: [a URL to capture, screenshots we supply, the product in hand, or no screen at all]
**Assets in hand**: [media ids, screenshots, logo files, product images — with paths or ids]

## Spend

**Credits**: [credits, or unlim because the human asked for it]
**Approved by**: [approver] on [date]

## Delivery

**Deliverable**: [hosted URL]
**Degraded**: [anything the workflow fell back on — capture failure, moderation retry, missing overlay — or *none*]
**Verdict**: [held / drifted, per field — folded into the lock's verdict log]
```

## Filling it

- **On screen** decides the routing more often than anything else. An Expo app with no public product page cannot be captured from a URL; say whether we supply screenshots instead, so the workflow takes that branch by choice rather than by hitting its capture-failure gate.
- **Duration** drives clip count, and every workflow has a words-per-second ceiling. A promise that needs forty seconds of talking does not fit in fifteen — cut the promise, not the pace.
- **Claims** is the field that earns this file. Leave it empty and the monologue invents its own.
