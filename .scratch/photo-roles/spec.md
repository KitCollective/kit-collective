# Photo roles — four universal + Andet

Feature spec on the **KitCollective v1** Linear project. Design lock: `docs/design-system.md`
(Gap 2026-09-05 — photo roles). Domain nouns: `CONTEXT.md`. Builds on shipped **Tilføj trøje** and
**Tilføj trøje — Confirm redesign**; those milestones stay complete. Visual lock supersedes
“roles stay three”. Origin: Linear KIT-207.

## Problem Statement

A collector who sells or documents a shirt cannot attach the photos that actually matter. Domain
`PhotoRole` is only Forside / Bagside / Mærke. Venstre and Højre do not exist. Detail shots
(vaskemærke, ID-kode, slitage, a special angle) have to steal the Mærke slot or stay off the
UserJersey. Repeat camera also forces a role before the shutter, so taking pictures feels like
filling a form. Gallery dumps of four photos of one shirt incorrectly open bulk bind, because the
branch still thinks “more than three means more than one jersey”.

## Solution

Give every UserJersey four **universal** photo roles — Forside, Bagside, Venstre, Højre — plus as
many **Andet** photos as will fit under a **10 photos per UserJersey** cap. Andet is not unique;
each Andet photo may carry a free Beskrivelse (Danish UI). Mærke is no longer a role: existing
Mærke photos become Andet with Beskrivelse “Mærke”.

Confirm shows the four universal slots always, then Andet thumbs, then **Tilføj foto** while under
the cap. The Photo lightbox Skift rolle offers five chips; Andet reveals Beskrivelse. Repeat camera
is **shoot-first**: viewfinder, count, filmstrip, no role overlay. Categorisation happens on
Confirm. Gallery: ≤10 photos → one UserJersey; >10 → bulk bind. A cellar dump of many jerseys
(~100) remains bulk. Save still needs only one photo. Vision still does not assign photo roles.

## User Stories

1. As a collector on Confirm, I want four universal Photo slots (Forside, Bagside, Venstre, Højre)
   always visible, so that side angles have a home without inventing extra roles.
2. As a collector, I want many optional Andet photos on the same UserJersey, so that vaskemærke,
   ID-kode, slitage, and odd angles can coexist.
3. As a collector, I want at most ten UserJerseyPhotos on one shirt, so that a listing stays
   scannable and bind cannot dump an unbounded set onto one copy.
4. As a collector, I want Gem to stay enabled with a single photo, so that jersey #2 still saves
   in under 45 seconds.
5. As a collector, I do not want Save to require all four universal roles or an Andet Beskrivelse,
   so that extra photos stay optional.
6. As a collector, I want a dashed **Tilføj foto** at the end of the strip while I have fewer than
   ten photos, so that I can add another Andet without filling Venstre/Højre first.
7. As a collector, I want **Tilføj foto** to always create an Andet photo, so that tapping it never
   silently fills Forside.
8. As a collector, I want tapping an empty universal slot to open the picker for that role, so that
   Forside stays one tap.
9. As a collector, I want tapping a filled slot to open the Photo lightbox, so that I can preview
   before I change anything.
10. As a collector, I want Skift rolle to offer Forside / Bagside / Venstre / Højre / Andet, so that
    I can fix a wrong slot without re-taking the photo.
11. As a collector, I want no Mærke chip and no Mærke slot, so that the old third role does not
    compete with Andet.
12. As a collector choosing Andet, I want a Beskrivelse Text field with placeholder
    `f.eks. Vaskemærke`, so that I can name the shot in my own words.
13. As a collector, I want suggestion chips Vaskemærke, ID-kode, and Slitage to fill Beskrivelse,
    so that common labels are one tap and still not a closed enum.
14. As a collector, I want to leave Beskrivelse empty, so that the strip can just say “Andet”.
15. As a collector, I want changing to an occupied universal role to swap the two photos, so that
    no photo is silently dropped.
16. As a collector, I want changing to Andet never to swap, so that the photo joins the Andet group
    until the jersey is at ten.
17. As a collector, I want Slet to remove only that photo, so that deleting one Andet does not
    wipe the others.
18. As a collector, I want Erstat to keep the same role (and Beskrivelse when Andet), so that I can
    swap a bad shot without re-labelling.
19. As a collector using repeat camera, I want the viewfinder to be a camera (shutter, `n/10`,
    gallery escape), so that taking pictures is not categorising.
20. As a collector using repeat camera, I want a filmstrip of shots with no role caption, so that I
    can see what I took without overlay slots on the photo.
21. As a collector using repeat camera, I want Fortsæt to land on Confirm with fill order applied,
    so that categorisation is Confirm work.
22. As a collector, I want the shutter to disable at ten with helper “Du kan højst have 10 fotos på
    én trøje.”, so that I cannot blow the cap on camera.
23. As a collector picking ten photos or fewer in the system picker, I want one Confirm for one
    UserJersey, so that four side shots of one shirt are not a bulk workspace.
24. As a collector picking more than ten photos, I want bulk bind first (Uredigerede + jersey
    tabs), so that a cellar dump of many shirts is still human-grouped.
25. As a collector in bulk, I want each jersey tab to cap at ten photos, so that bind cannot give
    one copy an eleventh photo.
26. As a collector, I want an eleventh photo refused with helper text (it stays in Uredigerede, or
    is not taken), so that nothing is dropped silently.
27. As a collector, I want picker/camera fill order Forside → Bagside → Venstre → Højre then
    unlabeled Andet, so that the first shots become the universal roles.
28. As a collector dumping ~100 jerseys, I want no session-wide photo cap, so that the OS picker
    can still ingest a cellar.
29. As a collector, I do not want every ten photos auto-chunked into a jersey, so that a shirt with
    only a front is not merged with the next shirt’s back.
30. As a collector whose old Save used Mærke, I want that photo to appear as Andet with
    Beskrivelse “Mærke”, so that existing copies do not lose the shot.
31. As a collector, I want Vision still not to assign Photo slot roles, so that a wrong Venstre
    guess never silently overwrites my strip.
32. As a collector, I want Save enablement otherwise unchanged (photo + club + season + type +
    size + condition), so that this feature is not a new wizard.
33. As a collector on first-session details, I want the same strip rules as signed-in Confirm, so
    that PhotoRole does not fork.
34. As a collector with reduced motion, I want the lightbox present instantly, so that role change
    does not travel.
35. As a collector using VoiceOver, I want slot names in Danish (role or Beskrivelse / “Andet” /
    “Tilføj foto, tom”), so that the extra slots stay nameable.
36. As a collector who backgrounds capture, I want Andet Beskrivelse and unassigned camera shots
    to persist in the capture session, so that labels survive a relaunch.
37. As an owner editing a saved UserJersey via Confirm, I want the same role model on patch, so
    that an old Mærke copy can gain Venstre without a new Save contract dialect.
38. As Nest Collection, I want Save to reject more than ten photos, duplicate universal roles, and
    a Beskrivelse on a non-Andet photo, so that the cap is enforced off-device.
39. As Nest Collection, I want a partial unique invariant: at most one front, back, left, and
    right per UserJersey, with many `other`, so that the database matches the UI.
40. As an operator on Admin, I want existing UserJersey photo thumbs still to render, so that
    Take-down evidence does not break when roles expand.

## Implementation Decisions

- **Design lock is authority for chrome.** Confirm strip, lightbox Skift rolle, Beskrivelse,
  suggestion chips, shoot-first camera, filmstrip, gallery branch at ten, and Danish copy come from
  `docs/design-system.md` Gap 2026-09-05 photo roles. Agents flag gaps; they do not invent a sixth
  role or a closed Andet enum.
- **Domain `PhotoRole`:** `front | back | left | right | other`. Danish UI labels: Forside,
  Bagside, Venstre, Højre, Andet. There is no `label` role. `PHOTO_ROLE_LABELS_DA.other` is “Andet”;
  the free Beskrivelse is a separate string on the photo, not a PhotoRole.
- **UserJerseyPhoto:** `role` plus optional `label` text (Beskrivelse). `label` is stored only when
  `role` is `other` (empty string allowed). Universal roles must not carry a label. Bytes stay in
  R2 under `user/{userId}/{jerseyId}/…`. Resize: universal roles ~1600 px; `other` ~2400 px (same
  need the old Mærke/OCR path had). Gallery multi-select still uses the higher quality.
- **Postgres:** extend `photo_role` with `left`, `right`, `other`; add nullable `label` text on
  `user_jersey_photo`; migrate `role = label` rows to `other` with `label = 'Mærke'`; then drop
  `label` from the live enum so domain and database match. Partial unique index on
  `(user_jersey_id, role)` where role is one of `front`, `back`, `left`, `right`. No unique on
  `other`. Application Save also enforces `photos.length` in 1…10.
- **Save / read contract:** each photo has `role`, `source`, bytes or object key as today, plus
  optional `label`. Reject `label` unless `role` is `other`. Reject a second universal of the same
  role. Vision suggest request `photo.role` uses the same enum (input photo only). Vision still
  suggests club / season / type and does **not** assign Photo roles.
- **captureSession module** (existing seam): each session photo has a stable id so Andet photos
  are addressable. `branchFromPhotoCount` is single at 1…10 and bulk at 11+. Fill order: empty
  universals Forside → Bagside → Venstre → Højre, then `other` with empty Beskrivelse, until 10.
  `nextAvailableRole` returns the next empty universal, else `other` if under the cap, else null.
  Changing to an occupied universal **swaps**. Changing to `other` **joins** (no swap). Remove and
  replace key by photo id, not by role (role-keyed remove would delete every Andet). Universal
  replace-in-place still allowed for Erstat on Forside/Bagside/Venstre/Højre. Camera shots append
  with `role` null until Fortsæt/Confirm applies fill order. Binding an 11th photo onto a draft is
  a no-op that leaves the uri unbound. Do not set OS `selectionLimit` to 10.
- **Chrome:** Photo slot `confirm-strip` only; `camera-overlay` is superseded. Lightbox five chips
  + Beskrivelse when Andet. Suggestion chips write the Text field; they are not PhotoRoles.
  First-session details/analysing screens consume the same domain rules (no fork).
- **CONTEXT.md and Architecture data-model** record UserJerseyPhoto as four universal roles + many
  Andet with optional Beskrivelse, max 10 per UserJersey. Confirm-redesign spec remains historical
  for that milestone (three roles there); this spec supersedes going forward.

## Testing Decisions

Good tests assert external behaviour, not implementation details: reducer state in/out, contract
parse/reject, schema enum + invariants, and chrome by asserting the locked structure is present —
never internal React state names.

**Seam 1 — UserJerseyPhoto model** (highest public interface: domain `PhotoRole` + collection Save
photo schema + Drizzle/Postgres invariants). Prior art: domain exports, collection save contract
tests, `packages/db` schema tests (`kit_type` fourth enum). Assert: enum is
`front | back | left | right | other`; Save accepts 1…10 photos; rejects a second `front`; accepts
two `other`; rejects `label` on `front`; migrates old `label` rows to `other` + “Mærke”; partial
unique holds. Vision suggest photo schema accepts `other` and does not grow a role-assignment
payload.

**Seam 2 — captureSession** (existing module interface; prior art `capture-session` tests with the
in-memory store). Assert: `branchFromPhotoCount` single at 10, bulk at 11; fill order; cap 10;
swap vs Andet-join; remove one Andet by id without dropping siblings; unassigned camera shots;
bind of an 11th leaves the photo unbound; Beskrivelse persists through the sqlite store;
`canSave` still needs one photo and does not require four universals or Beskrivelse.

**Seam 3 — Confirm / lightbox / camera chrome** (source-assertion; prior art photo-lightbox and
confirm chrome tests). Assert: Skift rolle lists the five Danish roles and no Mærke; Andet reveals
Beskrivelse + three suggestion chips; Confirm strip composes four universal slots + Tilføj foto;
repeat camera source does not overlay role Photo slots on `CameraView` and does show a filmstrip
and `n/10`.

These seams are the Testing Decisions — `/implement` and `/tdd` do not re-quiz them. Prefer these
three; do not add a Vision-adapter seam unless a slice assigns roles (this spec forbids that).

## Out of Scope

- UserJersey detail immersive pager caption layout (Danish strings reuse is locked; chrome is
  deferred in the design system).
- `web` capture UI. `admin` capture UI. Catalog peek.
- Vision assigning or guessing Photo roles (including Venstre/Højre).
- A `tags[]` model, a closed Andet taxonomy, or keeping `label` as a PhotoRole.
- Session-wide photo cap, OS `selectionLimit: 10`, or auto-chunk every ten photos.
- Role overlay, post-shutter role chips, or camera-inferred Venstre/Højre.
- Changing Save-required fields, Vision stamdata behaviour, Chooser, or `(capture)` navigation.
- Marketplace listing chrome.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Craft labels:** — (feature mode; not set on the project)
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. Photo roles — four + Andet — complete when Confirm shows four universal slots plus many Andet
     (max 10 photos per UserJersey), lightbox Skift rolle is five chips with Beskrivelse on Andet,
     repeat camera is shoot-first (no role overlay), gallery ≤10 is one jersey and >10 is bulk,
     Save persists `other` + label, and existing Mærke rows have migrated. Demoable on a device
     build against staging catalog. Ready to promote integration → staging when that works for an
     owner who can already Save.

## Further Notes

- KIT-207 stays the origin proposal; `/to-tickets` cuts vertical slices onto the new milestone.
  Do not implement from KIT-207 itself.
- Confirm-redesign (KIT-208 lightbox, three roles) is shipped history. This feature extends that
  lightbox; it does not reopen grouping or the fade dock.
- Jersey #2 in under 45 seconds still wins: extra slots and Beskrivelse yield to time-to-Save.
