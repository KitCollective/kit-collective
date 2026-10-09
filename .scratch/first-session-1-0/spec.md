# First session 1.0

Status: draft for Nicklas. First written 2026-10-09; revised the same day after the **Uber pass** (see Further Notes). Spec type: `feature` on **KitCollective v1**.

Design reference: Paper file "KitCollective App", page `02 First session & Auth` (row `First session / 01`–`08`, row `Error / …`; superseded screens sit in the `Archive / …` row). Clickable prototype: https://claude.ai/artifact/4kKVueNAJYY2TB5UJQ7yFL. Motion: `docs/design-system.md` → Motion → Brand moments. Where Paper and `docs/design-system.md` disagree, the lock wins and the gap is flagged.

## Problem Statement

A new collector who opens KitCollective today sees one dark jersey, taps through three static cards, creates an account with a password typed twice, is told a link was sent, fills in a profile, and lands in an empty **Samling**. The thing the product is good at, turning a photo into a jersey in seconds, is not shown until after four screens and an account. The first session feels thin and cold, and the collector has no reason to believe the upload is fast before being asked to commit.

The identity door also asks for more than it needs: separate login and register, a password, a reset flow, and several error states that exist only because of the password.

## Solution

The first session shows the product before it asks for anything, and the door asks for one thing.

1. **Welcome**: a slowly drifting wall of real jerseys, one headline, and three example jerseys. Tapping one starts the demo at once.
2. **Try it**: the jersey flies to a stage, Vision is shown at work, and club, season and type resolve one by one. The result states how long it took.
3. **Kom i gang**: one sheet for everyone, new or returning: an e-mail field with one primary action, then Apple, Google and Facebook as equal secondary buttons.
4. **Code**: a six-digit code sent to the e-mail. There is no password. A correct code creates the account or logs the collector in.
5. **Samling**: the collector lands in Samling. A new collector sees one inviting slot, and the screen says the example was not saved.

A side road stays open from the welcome screen: "Brug mit eget foto" lets a collector without an account run real Vision on their own photo, and the jersey is saved once they are in. The profile step leaves the first session; a prompt in Samling offers it after the first jersey is saved. Every failure has a designed state with a way out on the same screen.

## User Stories

Welcome and demo
1. As a new collector, I want to see real jerseys moving on the first screen, so that I understand what the app is for before I read anything.
2. As a new collector, I want to tap an example jersey right on the first screen, so that the demo starts without an extra step.
3. As a new collector, I want the jersey to travel to the stage, so that I see where my own photo will go.
4. As a new collector, I want to see club, season and type appear one at a time, so that I understand what Vision finds for me.
5. As a new collector, I want to be told how long it took, so that I believe a whole collection is realistic.
6. As a new collector, I want the example marked as an example, so that I am not misled into thinking it was saved.
7. As a new collector, I want "Prøv en anden trøje", so that I can see it work on more than one.
8. As a new collector, I want the demo to work without network or photo access, so that nothing stands between me and the first impression.
9. As a collector with Reduce Motion on, I want the wall still and the same end state, so that the screen does not make me unwell.

Own photo before account
10. As an impatient collector, I want "Brug mit eget foto" on the welcome screen, so that I can skip the example.
11. As a collector, I want to choose between camera, photo library and files, so that I can use the photos I already have.
12. As a collector without an account, I want Vision to analyse my own photo, so that I see a real result before I register.
13. As a collector without an account, I want my jersey saved once I am in, so that I do not upload twice.
14. As a collector, I want a clear screen when Vision cannot recognise my jersey, so that I can fill it in myself or try another photo.
15. As KitCollective, I want a cap on Vision runs for collectors without an account, so that the open door cannot be abused.

One entry
16. As any collector, I want one "Kom i gang" sheet, so that I never have to decide whether I am logging in or registering.
17. As a collector, I want to type my e-mail and continue, so that the first field is the only thing I must fill in.
18. As a collector, I want Apple, Google and Facebook as full buttons with text, so that I know what each does.
19. As a collector, I want a line about terms and privacy before I continue, so that I know what I accept.
20. As a collector who mistyped my e-mail, I want to be told under the field, so that I can fix it before a code is sent.
21. As a collector whose social sign-in was cancelled, I want a message and the sheet left open, so that I can try again or use e-mail.
22. As a returning collector, I want "Jeg har allerede en konto" to open the same sheet, so that the way back in is the way I came in.

Code
23. As a collector, I want a six-digit code sent to my e-mail, so that I never have to invent or remember a password.
24. As a collector, I want the code to submit by itself on the sixth digit, so that there is no extra tap.
25. As a collector, I want my phone to offer the code from the e-mail, so that I do not have to switch apps.
26. As a collector, I want "Forkert e-mail?" right under the instruction, so that I can fix a typo without starting over.
27. As a collector, I want "Send igen" after a short wait, so that I can recover if the e-mail did not arrive.
28. As a collector who typed a wrong code, I want the fields to clear and tell me, so that I can try again.
29. As a collector whose code expired, I want one button to send a new one, so that I am not stuck.
30. As KitCollective, I want the response to be the same whether an e-mail already has an account or not, so that the door does not reveal who is a member.

Arrival
31. As a collector, I want to land in Samling right after the code or social sign-in, so that the next step is a jersey.
32. As a new collector, I want an obvious slot for the first jersey, so that an empty Samling is not a dead end.
33. As a collector who used my own photo before getting in, I want that jersey in Samling when I arrive, so that my work was kept.
34. As a new collector, I want the profile prompt after my first jersey is saved, and to be able to dismiss it, so that I am not asked for a photo and city before I have done anything.

Quality
35. As Nicklas, I want every screen in this flow captured by the device flows, so that a change to it shows up as before and after.
36. As Nicklas, I want the time shown in the demo to be a measured Vision time, so that the promise is true.

## Implementation Decisions

Decided by Nicklas on 2026-10-09 unless marked otherwise.

- **The demo starts on the welcome screen.** The three examples sit on the welcome screen and a tap starts the demo. There is no separate "pick a jersey" screen and no onboarding slides.
- **The demo is local.** It plays a fixed result for three bundled example jerseys and makes no Vision call. It works offline.
- **Own photo before account stays, as a side road from the welcome screen.** It reuses the existing path where a collector without an account picks photos, sees the analysing screen, and meets the door over the result; the draft is saved after identity. A cap on Vision runs per anonymous collector is added. The cap value is not decided: flag, do not invent.
- **One entry for everyone.** A single sheet, **Kom i gang**, serves new and returning collectors. There is no login screen, no register screen and no mode switcher in the collector app.
- **No password in the collector app.** The e-mail path is e-mail plus a six-digit code. The password field, the repeat field, "Glemt adgangskode?" and the reset flow are removed from the collector app. Staff login in `admin` is unchanged and out of scope.
- **The code both registers and logs in.** The identity module issues a six-digit numeric code to any syntactically valid e-mail, single use, with an expiry and an attempt limit. Verifying it creates the collector if none exists, marks the e-mail verified, and opens a session. The response to "send me a code" does not reveal whether an account exists. Expiry and attempt limit are not decided: flag, do not invent.
- **Existing password accounts.** Accounts created with a password before this change sign in with the code like everyone else. Their stored password is left untouched and unused by the collector app. Flag if any real accounts exist on `production` before this lands; at the time of writing there are none.
- **Social sign-in skips the code** and lands in Samling, because the provider has already confirmed the address.
- **Sign in with Apple is added** on the same identity as Google and Facebook. It is required for the App Store when other social logins are offered (PRD). Update the `CONTEXT.md` note that says to avoid Apple.
- **Providers are equal secondary buttons** (fill-secondary, icon and text). Primary black is reserved for **Fortsæt**.
- **Code screen layout.** The title is the instruction including the e-mail. **Forkert e-mail?** sits under it. Six filled boxes, the focused one outlined. **Send igen** is a pill, disabled during a countdown. A round back button sits at the bottom; there is no submit button because the sixth digit submits.
- **Profile leaves the first session.** After identity the collector goes to Samling (or to jersey details when a draft exists). A dismissible prompt in Samling offers the profile once the first jersey is saved. Whether that prompt should instead ask for a first wish is an open decision in Notion and does not block this spec.
- **Photos are KitCollective's own, bundled in the app**: 8–12 for the wall, three of them as examples with club, season and type. Nicklas delivers or approves them. Until then the build uses clearly marked placeholders, not the test photos from Drive.
- **Stage is 4:5**, the jersey-tile crop.
- **Motion follows the Brand moments rule** in the design lock. Durations there are provisional until Nicklas has approved the tempo in the prototype.
- **The demo's seconds counter shows a measured value**, set from real Vision runs on the eval set. Until measured, the counter is hidden.
- **Errors are inline with a way out on the same screen**, using the `danger` token on border and text only. States: invalid e-mail, wrong code, expired code, social sign-in cancelled, Vision could not recognise (own photo only). Not designed yet: no connection, too many attempts.
- **First-session state machine** (existing reducer): places on the first-session path become `welcome`, `demo`, `analysing` (own photo), `door`, `code`, `jersey-details`, `collection`. `onboard`, `profile` and the `verify-email` beat leave the path. `submitIdentity` with e-mail goes to `code`; a verified code or a social identity goes to `collection` or `jersey-details`.

Removed from the collector app
- Onboarding slides, their copy and illustrations.
- Login, register, reset and reset-complete screens, and the verify-by-link beat.
- Password and repeat-password fields and their copy.
- Profile onboarding as a first-session place (the profile editor under Profil stays).
- The dark single-jersey splash backdrop and its photo.
- The Login/Opret title switcher on the door.

Contradictions to resolve when landing
- `docs/design-system.md` says splash, onboarding and login use the lockup on a light canvas; this flow puts a small white lockup on a dark wall. Update the brand placement note.
- `docs/design-system.md` describes the Sheet `door` variant as Login / Opret at near-full height. This spec replaces it with one **Kom i gang** sheet.
- `CONTEXT.md` and any identity ADR that assume e-mail plus password for collectors need a supersession note.

## Testing Decisions

A good test here drives the public interface and asserts what the collector would see or where they end up, not which component rendered.

- **Seam 1, first-session reducer** (existing, highest seam for flow): event in, place out. Covers: welcome → demo → door → social → Samling; door → e-mail → code → Samling; own photo → analysing → door → code → jersey details; returning collector through the same door; wrong and expired code stay on code; no onboard, profile or password place. Prior art: the existing first-session reducer tests.
- **Seam 2, identity HTTP interface** (existing): request a code for a new and for an existing e-mail and get the same response shape; verify once succeeds and creates or finds the collector; wrong code fails and counts an attempt; expired code fails; resend invalidates the old code; Apple token is accepted through the existing token-verifier adapter. Prior art: identity service and controller tests with the fake token verifier and the recording mailer.
- **Seam 3, anonymous Vision HTTP interface** (existing): a run succeeds under the cap and is refused over it.
- **Seam 4, device flows** (Maestro, from KIT-267): welcome → demo → Kom i gang → code → Samling with named screenshots; a returning-collector flow through the same sheet; one flow for the error states using fixed failing inputs.
- Copy and chrome assertions follow the existing first-session copy and chrome tests.
- Motion is not asserted beyond "Reduce Motion reaches the same end state".

No new seams are proposed.

## Out of Scope

- Staff login in `admin`.
- Changing the everyday **Tilføj trøje** flow after the first session, including whether its Vision wait gets the scan line.
- Paywall, wishlist and match-push.
- Profile content or fields; only where the prompt appears.
- Swedish and Norwegian.
- A live wall of other collectors' jerseys.
- Rate limiting and lockout design beyond the attempt limit on codes and the anonymous Vision cap.
- Passkeys.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **First session 1.0**: a collector can go welcome → demo → Kom i gang (Apple, Google, Facebook or e-mail with a six-digit code) → Samling on a device; a returning collector uses the same sheet; own photo before account works under a cap; the listed error states exist; the device flows cover it; and the removed screens are gone. Demoable on staging; ready to promote.
- **Issues:** KIT-271 (welcome and demo), KIT-272 (Kom i gang sheet), KIT-274 (Apple), KIT-275 (e-mail and code), KIT-276 (remove password, login and reset), KIT-277 (own photo and first Samling), KIT-278 (device flows).

## Further Notes

- **Uber pass, 2026-10-09.** The first version of this spec had a separate pick screen, a create-account sheet, an e-mail and password screen, a login screen and a reset screen. A comparison with Uber's sign-in (one entry, identifier plus code, equal secondary provider buttons) cut the flow from 12 screens to 8 and the error states from 7 to 5. Uber shows no demo because everyone knows what Uber is; the wall and the demo stay because nobody knows KitCollective yet.
- The cost of no password: a collector opens their mail to sign in on a new device, and sign-in depends on fast mail delivery. Delivery time of the current mail provider has not been measured. Measure it before this ships.
- Open values: code expiry and attempt limit, anonymous Vision cap, the measured seconds, the final photos, approved motion tempo.
- Depends on KIT-267 landing for Seam 4.
- The test photos used in the prototype and in Paper belong to another person's Drive account. They are reference only and are not to be committed.
