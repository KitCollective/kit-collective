# `docs/video-system.md` template

The durable lock: what stays true across videos, so video two grills only what is new. Written in English. Spoken lines quoted verbatim in the language they ship in.

Status per section: `locked` | `thin` | `deferred` (with reason). This file is brand and marketing truth — domain nouns stay in `CONTEXT.md`, and in-app visual rules stay in `docs/design-system.md`.

```markdown
# Video system

Brand lock for generated video. Briefs apply this file.
Flag missing context; do not invent claims, personas, or numbers.

**Owner**: [approver]
**Last locked**: [date]

## Voice

**Feel**: [a few words — what a viewer should feel in the first two seconds]
**North stars**: [videos or channels we are aiming at, and what specifically we take from each]
**Anti-references**: [what this is not — the tone we refuse, named concretely]
**Register**: [how we speak to a collector — peer, expert, host]

## Language

**Spoken**: [language and accent, per platform if they differ]
**On-screen text**: [language for captions and plates]
**Override note**: [which workflows default elsewhere and therefore need this stated in every brief]

## Claims

Claims we can stand behind, in the wording we stand behind. A claim absent from this table is absent from the script.

| Claim | Allowed wording | Evidence |
| --- | --- | --- |

**Off limits**: [guarantees, numbers, comparisons, and endorsements we do not make]
**Legal and consent**: [rules for real people, real clubs, badges, and third-party marks]

## Persona

**Default creator**: [age range, look, energy, wardrobe register — the lock's default when no photo is supplied]
**Consent**: [whose photos may be used, and where that consent is recorded]
**Setting**: [where our creators film]
**Continuity**: [media ids of approved creators we reuse, so a returning face stays the same face]

## Product on screen

**What the viewer sees**: [app surface, captured how — screenshots we maintain, a page to capture, or the product in hand]
**Screenshot source**: [where current screenshots live, and who refreshes them]
**Never on screen**: [pre-release surfaces, seeded data, real user content, anything under NDA]

## Formats

| Placement | Aspect | Duration | Captions |
| --- | --- | --- | --- |

**Defaults**: [what a brief inherits when it says nothing]

## Verdict log

Evidence from shipped videos. A repeated drift becomes a lock rule, not a note.

| Date | Slug | Workflow | Held | Drifted | Lock change |
| --- | --- | --- | --- | --- | --- |

## Using this file

1. Read Voice, Language, and Claims before writing any brief.
2. Choose from the locked claims, persona, and formats. Compose; do not extend.
3. A video that needs a decision this file does not carry: **flag it** and lock it with the owner.
4. Workflow-pinned craft (models, prompt wording, densities) belongs to Higgsfield, never to this file.

## Deferred

| Area | Why now | Revisit when |
| --- | --- | --- |
```

Write sections as they resolve during the interview. On a later video, update only what that video changed, and keep the verdict log current.
