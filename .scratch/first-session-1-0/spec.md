# First session 1.0

Status: draft for Nicklas, 2026-10-09. Spec type: `feature` on **KitCollective v1**.

Design reference: Paper file "KitCollective App", page `02 First session & Auth` (row `First session / 01`–`12`, row `Error / …`). Clickable prototype: https://claude.ai/artifact/4kKVueNAJYY2TB5UJQ7yFL. Motion: `docs/design-system.md` → Motion → Brand moments. Where Paper and `docs/design-system.md` disagree, the lock wins and the gap is flagged.

## Problem Statement

A new collector who opens KitCollective today sees one dark jersey, taps through three static cards, creates an account, is told a link was sent, fills in a profile, and lands in an empty **Samling**. The thing the product is good at, turning a photo into a jersey in seconds, is not shown until after four screens and an account. The first session feels thin and cold, and the collector has no reason to believe the upload is fast before being asked to commit.

Around that flow, the identity door is incomplete for a release: there is no Sign in with Apple, social providers are bare icons, the password is typed twice, no terms line is shown, an e-mail can be used without being confirmed, and error states are undesigned.

## Solution

The first session shows the product before it asks for anything.

1. **Welcome**: a slowly drifting wall of real jerseys, one headline, one action: "Tilføj din første trøje".
2. **Try it**: the collector picks one of three example jerseys. It flies to a stage, Vision is shown at work, and club, season and type resolve one by one. The result states how long it took.
3. **Create account**: a door sheet with Apple, Google, Facebook as full buttons, and e-mail as the last option.
4. **E-mail path**: e-mail and one password field, then a six-digit code. The e-mail must be confirmed before the collector gets in.
5. **Samling**: the collector lands in an empty Samling with one inviting slot. The example was never saved, and the screen says so.

A side road stays open: "Brug mit eget foto" lets a collector without an account run real Vision on their own photo, and the jersey is saved once the account exists. The profile step leaves the first session; a prompt in Samling offers it after the first jersey is saved. Login and password reset get the same visual treatment, and every failure has a designed state with a way out on the same screen.

## User Stories

Welcome
1. As a new collector, I want to see real jerseys moving on the first screen, so that I understand what the app is for before I read anything.
2. As a new collector, I want one clear primary action, so that I do not have to choose between onboarding and registering.
3. As a returning collector, I want "Jeg har allerede en konto" on the first screen, so that I can log in without seeing the demo.
4. As a collector with Reduce Motion on, I want the wall to stand still, so that the screen does not make me unwell.

Try-it demo
5. As a new collector, I want to pick an example jersey, so that I can see the upload work without granting photo access.
6. As a new collector, I want the jersey to travel to the stage when I tap "Næste", so that I see where my own photo will go.
7. As a new collector, I want to see club, season and type appear one at a time, so that I understand what Vision finds for me.
8. As a new collector, I want to be told how long it took, so that I believe a whole collection is realistic.
9. As a new collector, I want the example marked as an example, so that I am not misled into thinking it was saved.
10. As a new collector, I want "Prøv en anden trøje", so that I can see it work on more than one.
11. As a new collector, I want the demo to work without network, so that a slow connection does not ruin the first impression.

Own photo before account
12. As an impatient collector, I want "Brug mit eget foto" on the demo screen, so that I can skip the example.
13. As a collector, I want to choose between camera, photo library and files, so that I can use the photos I already have wherever they are.
14. As a collector without an account, I want Vision to analyse my own photo, so that I see a real result before I register.
15. As a collector without an account, I want my jersey saved when I create the account, so that I do not upload twice.
16. As a collector, I want a clear screen when Vision cannot recognise my jersey, so that I can fill it in myself or try another photo.
17. As KitCollective, I want a cap on Vision runs for collectors without an account, so that the open door cannot be abused.

Create account
18. As a new collector, I want "Fortsæt med Apple", so that I can register in one tap on iPhone.
19. As a new collector, I want Google and Facebook as full buttons with text, so that I know what each does.
20. As a new collector, I want e-mail as a clear last option, so that I am not forced into a social account.
21. As a new collector, I want a line about terms and privacy before I continue, so that I know what I accept.
22. As a new collector whose social login was cancelled, I want a message and the sheet left open, so that I can try again or use e-mail.

E-mail and code
23. As a new collector, I want one password field with "Vis", so that I do not type it twice.
24. As a new collector, I want to be told a password is too short as I leave the field, so that I can fix it before submitting.
25. As a new collector, I want a six-digit code sent to my e-mail, so that I can prove the address is mine.
26. As a new collector, I want the code to submit by itself on the sixth digit, so that there is no extra tap.
27. As a new collector, I want my phone to offer the code from the e-mail, so that I do not have to switch apps.
28. As a new collector, I want "Send igen" after a short wait, so that I can recover if the e-mail did not arrive.
29. As a new collector, I want "Skift e-mail", so that I can fix a typo without starting over.
30. As a new collector who typed a wrong code, I want the fields to clear and tell me, so that I can try again.
31. As a new collector whose code expired, I want one button to send a new one, so that I am not stuck.
32. As a new collector whose e-mail already has an account, I want "Login i stedet" next to the message, so that I get to the right place.
33. As KitCollective, I want an e-mail confirmed before the collector enters, so that accounts belong to real addresses.

Arrival
34. As a new collector, I want to land in Samling right after the code or social login, so that the next step is my first jersey.
35. As a new collector, I want an obvious slot for the first jersey, so that an empty Samling is not a dead end.
36. As a collector who used my own photo before registering, I want that jersey in Samling when I arrive, so that my work was kept.
37. As a new collector, I want the profile prompt after my first jersey is saved, so that I am not asked for a photo and city before I have done anything.
38. As a new collector, I want to dismiss the profile prompt, so that it does not nag me.

Login and reset
39. As a returning collector, I want login with Apple, Google, Facebook or e-mail, so that I use the method I registered with.
40. As a returning collector, I want "Glemt adgangskode?" next to the password, so that I can recover on the spot.
41. As a returning collector, I want one message for a wrong e-mail or password, so that I know to check both.
42. As a returning collector resetting my password, I want the same code screen and then a new-password field, so that the flow is familiar.

Quality
43. As Nicklas, I want every screen in this flow captured by the device flows, so that a change to it shows up as before and after.
44. As Nicklas, I want the time shown in the demo to be a measured Vision time, so that the promise is true.

## Implementation Decisions

Decided by Nicklas on 2026-10-09 unless marked otherwise.

- **Main road is the try-it demo.** The three onboarding slides are removed. The splash continues to the demo, not to slides.
- **The demo is local.** It plays a fixed result for three bundled example jerseys and makes no Vision call. It works offline.
- **Own photo before account stays, as a side road.** It reuses the existing path where a collector without an account picks photos, sees the analysing screen, and meets the door over the result; the draft is saved after identity. A cap on Vision runs per anonymous collector is added. The cap value is not decided: flag, do not invent.
- **E-mail must be confirmed before entry.** Password registration ends on the code screen, and only a correct code opens Samling. The "link sent, continue now" beat is removed from the first session.
- **Verification is a six-digit code.** Today the API verifies a token taken from a link. The identity module issues a six-digit numeric code by e-mail, single use, with an expiry and an attempt limit, and verifies it. Expiry and attempt limit are not decided: Paper shows 10 minutes as a placeholder. The existing link may remain as a second way to confirm the same code.
- **Social sign-in skips e-mail and code** and lands in Samling, because the provider has already confirmed the address.
- **Sign in with Apple is added** on the same identity as Google and Facebook, on the door and on login. It is required for the App Store when other social logins are offered (PRD). `CONTEXT.md` currently says to avoid Apple in the earlier increment: update the vocabulary note when this lands.
- **Profile leaves the first session.** After identity the collector goes to Samling (or to jersey details when a draft exists). A dismissible prompt in Samling offers the profile once the first jersey is saved. Handle rules in `CONTEXT.md` are unchanged.
- **Door is one sheet** in register mode with four actions, and e-mail opens a full screen. Login is its own full screen. The two-mode title switcher is removed.
- **One password field with show/hide.** The repeat field is removed. Minimum length stays 8.
- **Photos are KitCollective's own, bundled in the app**: 8–12 for the wall, three of them as examples with club, season and type. Nicklas delivers or approves them. Until then the build uses clearly marked placeholders, not the test photos from Drive.
- **Stage is 4:5**, the jersey-tile crop, on every screen that shows the stage.
- **Motion follows the Brand moments rule** in the design lock: wall drift, jersey to stage, Vision at work. Durations there are provisional until Nicklas has approved the tempo in the prototype. They become motion tokens when implemented.
- **The demo's seconds counter shows a measured value.** It is set from the median of real Vision runs on the eval set, not chosen. Until measured, the counter is hidden.
- **Errors are inline with a way out on the same screen**, using the `danger` token on border and text only. States: e-mail already registered, password too short, wrong code, expired code, wrong e-mail or password, social sign-in cancelled, Vision could not recognise (own photo only). Not designed yet: no connection, too many attempts.
- **"E-mail already registered" is stated plainly** at registration, with "Login i stedet". Login keeps one combined message. This trades a little account-enumeration resistance for a clearer path; revisit if abuse appears.
- **First-session state machine changes** (existing reducer): remove the `onboard` and `profile` places from the first-session path and the `verify-email` "continue" beat; add `demo` (pick, fly, scan, done), `email`, `code`; `submitIdentity` with password goes to `code`; a verified code or a social identity goes to `collection` or `jersey-details`.

Removed (code and assets no longer reachable from the first session)
- Onboarding slides screen, its copy and its three illustrations.
- Verify-email "continue" beat.
- Profile onboarding as a first-session place (the profile editor itself stays under Profil).
- Door title switcher and repeat-password field.
- The dark single-jersey splash backdrop and its photo, replaced by the wall.
- The discovery marquee and showcase fetch on the pre-account screen, replaced by the bundled wall, unless a ticket finds the marquee is the simplest way to build the wall.

Changed
- Splash screen, door sheet and its faces, analysing screen (4:5 stage, scan line, rows), first-session host and reducer, login and reset screens, the verify screen (six boxes), identity API (code issue and verify, Apple), anonymous Vision (cap), Samling empty state (first slot, "Du er inde" note, profile prompt), device flows for the first session.

Contradictions to resolve when landing
- `docs/design-system.md` says splash, onboarding and login use the lockup on a light canvas; this flow puts a small white lockup on a dark wall. Update the brand placement note.
- `docs/design-system.md` describes the Sheet `door` variant as Login / Opret at near-full height. This spec replaces it with a register-only sheet plus full screens.
- A code comment notes login/verify screens are not in the design lock. They should be added as a pattern once approved.

## Testing Decisions

A good test here drives the public interface and asserts what the collector would see or where they end up, not which component rendered.

- **Seam 1, first-session reducer** (existing, highest seam for flow): event in, place out. Covers every path: demo → door → social → Samling; demo → door → e-mail → code → Samling; own photo → analysing → door → code → jersey details; login; wrong code stays on code; expired code; no profile place. Prior art: the existing first-session reducer tests.
- **Seam 2, identity HTTP interface** (existing): register returns an unverified session, a code is issued, verify with the right code succeeds once, wrong code fails and counts an attempt, expired code fails, resend invalidates the old code, Apple token is accepted through the existing token-verifier adapter. Prior art: identity service and controller tests with the fake token verifier and the recording mailer.
- **Seam 3, anonymous Vision HTTP interface** (existing): a run succeeds under the cap and is refused over it.
- **Seam 4, device flows** (Maestro, from KIT-267): the first-session flow is rewritten to walk welcome → demo → door → e-mail → code → Samling with named screenshots, plus one flow for login. Error states are captured by one flow that uses fixed failing inputs.
- Copy and chrome assertions follow the existing first-session copy and chrome tests.
- Motion is not asserted beyond "Reduce Motion reaches the same end state".

No new seams are proposed.

## Out of Scope

- Changing the everyday **Tilføj trøje** flow after the first session, including whether its Vision wait gets the scan line.
- Paywall, wishlist and match-push.
- Profile content or fields; only where the prompt appears.
- Swedish and Norwegian.
- A live wall of other collectors' jerseys.
- Rate limiting and lockout design beyond the attempt limit on codes and the anonymous Vision cap.
- Android-specific sign-in (Google One Tap) and iPad layouts.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **First session 1.0**: a new collector can go welcome → demo → create account (Apple, Google, Facebook or e-mail with code) → Samling on a device, own photo before account works under a cap, login and reset match, all listed error states exist, the device flows cover it, and the removed screens are gone. Demoable on staging; ready to promote.

## Further Notes

- Open values to settle before or during tickets: code expiry and attempt limit, anonymous Vision cap, the measured seconds, the final photos, approved motion tempo.
- Depends on KIT-267 landing for Seam 4. Tickets that only touch Seams 1–3 can start before it.
- The test photos used in the prototype and in Paper belong to another person's Drive account. They are reference only and are not to be committed.
