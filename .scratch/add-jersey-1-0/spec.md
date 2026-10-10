# Add jersey 1.0

Status: draft for Nicklas. Written 2026-10-09. Spec type: `feature` on **KitCollective v1**.

Design reference: Paper file "KitCollective App", page `03 Tilføj trøje (Capture & Confirm)`: row `Add jersey / Proposal 01`–`09`, row `Add jersey / Start 01`–`03`, `Add jersey / Error …`, and the current build above them. Rules: `docs/design-system.md` → **Confirm and Save** and **Capture session**, each headed by a **Revision 2026-10-09** block that wins over the older numbered composition beneath it. Where Paper and the lock disagree, the lock wins and the gap is flagged.

## Problem Statement

Adding a jersey is the product's core action, and today it is slower than it needs to be even when Vision is right. With a correct Vision result the collector still makes about nine taps and one screen change: the two things only the collector knows, size and condition, sit behind a drill; the Vision result is three small chips in a card under a banner that says something was filled in but not what; and more than half of the photo area is empty dashed slots.

With many jerseys it gets worse. There is no overview of what Vision found, photos it could not place sit in a strip of small thumbs that are bound one tap at a time, and one uncertain group stops automatic sorting for the whole dump: the grouping result is dropped or held back by the lowest group's confidence. A collector cannot turn Vision off, cannot see how many free runs are left, and has no way to park a half-sorted pile.

## Solution

One screen confirms a jersey, and a pile of photos sorts itself with the collector only looking at what needs a look.

1. **Start**: the same sheet, two tiles (camera, photos or files) and a Vision switch showing the remaining free runs. The sheet never asks "one or many"; the photo count decides.
2. **Confirm**: the Vision result is the headline (club, then season · type · player) with **Ret** beside it. Size and condition are on the same screen. The last size is pre-selected. Two taps and **Gem**.
3. **While Vision reads**: the same block fills in fact by fact; size and condition are usable meanwhile.
4. **When Vision is unsure**: the same block shows the guess with **Brug forslaget** and **Vælg selv**. Nothing is pre-selected.
5. **Saved**: the jersey's photo, its number in the collection, and **Tilføj næste trøje** as the primary action.
6. **Many photos**: an overview, "6 trøjer fundet", fills up row by row while Vision sorts. Uncertain jerseys come first, confident ones need only size and condition, saved ones sink to the bottom. Confident groups are bound one by one; an uncertain one no longer holds the others back.
7. **Photos without a jersey**: their own screen with multi-select: make a new jersey from the selected photos, add them to an existing one, or delete them.
8. **Vision off or unavailable**: the same flow without suggestions. Photos are never lost; every failure has a way forward on the same screen.

## User Stories

Start
1. As a collector, I want to choose camera or photos from one sheet, so that I start with one tap.
2. As a collector, I want the app to work out whether I am adding one jersey or many from the photos I pick, so that I am not asked.
3. As a collector, I want a Vision switch on the sheet, so that I can add jerseys by hand when I prefer.
4. As a collector, I want my last Vision choice remembered, so that I set it once.
5. As a free collector, I want to see how many Vision runs I have left, so that I am not surprised when they run out.
6. As a free collector who has used the quota, I want to see when it renews and how to get more, so that I know my options.
7. As a Plus collector, I want no quota line, so that the sheet stays quiet.

Confirm one jersey
8. As a collector, I want the club, season, type and player Vision found as the headline, so that I can see at a glance whether it is right.
9. As a collector, I want **Ret** next to the result, so that fixing it is one tap away.
10. As a collector, I want size and condition on the confirm screen, so that I do not open another screen for the two things I always choose.
11. As a collector, I want my last size pre-selected, so that most jerseys need one tap less.
12. As a collector, I want condition never pre-selected, so that I do not save a wrong condition by accident.
13. As a collector, I want only my actual photos in the strip plus one tile to add more, so that the screen shows the jersey and not empty frames.
14. As a collector, I want to change a photo's role by tapping it, so that I can still fix front and back.
15. As a collector, I want badge and notes behind one optional row, so that they do not slow down the usual case.
16. As a collector, I want **Gem** to become active as soon as the required facts are set, so that I know when I am done.

Vision states
17. As a collector, I want to see facts land one at a time while Vision reads, so that I know it is working and where the answer goes.
18. As a collector, I want to pick size and condition while Vision reads, so that waiting costs nothing.
19. As a collector, I want an unsure result shown as a question with its alternatives, so that I am not misled.
20. As a collector, I want **Brug forslaget** and **Vælg selv** on an unsure result, so that I decide in one tap.
21. As a collector with Reduce Motion on, I want no scan line and the same end state, so that the screen stays calm.
22. As a collector, I want the scan effect only the first time a photo is read, so that reopening a jersey is quiet.

Saved
23. As a collector, I want to see the jersey I just saved and its number in my collection, so that saving feels like progress.
24. As a collector, I want **Tilføj næste trøje** as the main button, so that the common next step is the obvious one.
25. As a collector, I want **Endnu en *klub***, so that a run of jerseys from one club is quick.

Many jerseys
26. As a collector with a pile of photos, I want an overview of the jerseys Vision found, so that I see the whole job.
27. As a collector, I want the overview to fill up while Vision sorts, so that I can start with the first jersey without waiting for the last.
28. As a collector, I want jerseys that need a look first and saved ones last, so that I work top down.
29. As a collector, I want each row to say what it still needs, so that I know what a tap will ask of me.
30. As a collector, I want **Gem og næste** to take me through the unsaved jerseys, so that I never return to the list between each.
31. As a collector, I want one uncertain jersey not to stop the others being sorted, so that Vision helps with everything it can.
32. As a collector, I want **Gør resten færdig senere**, so that a big pile does not have to be finished in one sitting.
33. As a collector, I want to find a parked pile again from Samling, so that "later" is real.

Photos without a jersey
34. As a collector, I want the photos Vision could not place on their own screen, so that I can see them properly.
35. As a collector, I want to select several and make one jersey of them, so that I do not bind one photo at a time.
36. As a collector, I want to add selected photos to a jersey that already exists, so that a stray back photo finds its front.
37. As a collector, I want to delete photos that do not belong, so that the pile gets empty.
38. As a collector, I want Vision's best guess for a stray photo offered as one tap, so that the easy cases go fast.

Without Vision, and failures
39. As a collector with Vision off, I want the same screens with an empty identity block, so that nothing else changes.
40. As a collector with Vision off and many photos, I want to land in the photos-without-a-jersey screen, so that I can sort them myself.
41. As a collector, I want photos that failed to upload named and retryable while the rest carries on, so that one bad photo does not stop the pile.
42. As a collector, I want to be told when Vision did not answer, with **Prøv Vision igen** and **Sortér selv**, so that I am never stuck.
43. As a collector, I want my photos kept through every failure, so that I never pick them twice.

## Implementation Decisions

Decided by Nicklas on 2026-10-09 unless marked otherwise.

- **The design lock revision is the contract.** `docs/design-system.md`, Revision 2026-10-09 under **Confirm and Save** and **Capture session**. This spec does not restate layout.
- **Size and condition move to the hub.** The Detaljer drill keeps only Badge and Noter. The Save-required rule is unchanged: photo, club or national team, season, type, size, condition.
- **Identity block replaces the Data card, its donut and the Vision banner.** It has four states: resolved, in flight, low confidence, empty (Vision off, or no result). The Data drill behind it is unchanged.
- **Size is a sticky default; condition is not.** The last saved size is stored on the device per collector and pre-selected on the next jersey, in the same session and the next. It is a pre-selection, not a hidden value: the chip shows as selected and can be changed.
- **Photo strip renders filled slots only**, then one add tile. Role assignment by fill order and role change in the Photo lightbox are unchanged.
- **Jersey index**: in the header with one jersey; its own row with two or more, with the per-jersey photo count.
- **Saved sheet** shows the front photo and the collector's running jersey count, with the new button order and copy.
- **Vision switch.** A per-device setting, default on, remembered. Off means no identity and no grouping call for that session. It is not a Plus feature and not a privacy setting.
- **Quota line.** Uses the existing free allowance (10 distinct ready identity drafts per rolling 30 days; `VISION_MATCHER_JERSEY_CAP`, `VISION_MATCHER_WINDOW_DAYS`). The count is **jerseys, not photos**, because that is what the allowance already counts. The sheet needs the remaining count and the date the oldest run leaves the window; if the entitlement interface does not expose the date, add it there. Hidden for Plus. At zero the switch is off and disabled.
- **Grouping binds per group.** Today the overall grouping confidence is the minimum over groups: below the suggest threshold the whole result is dropped, and pre-selection is decided on that minimum. Change: each group is judged on its own confidence. Groups at or above the pre-select threshold bind automatically; groups between suggest and pre-select become jersey drafts marked **Tjek**; photos in groups below the suggest threshold go to photos without a jersey. Thresholds stay as they are (70 and 50). The grouping response keeps per-group confidence; an overall status is no longer what the client acts on.
- **Bulk overview** is a new place inside the capture modal, shown for four or more photos with Vision on, before Confirm. Row status is derived from the draft: saved; low confidence; confident but missing Save-required fields. **Gennemgå *n* trøjer** opens the first unsaved draft; Confirm's **Gem og næste** advances and returns to the overview after the last.
- **Grouping in flight is the overview filling up.** It replaces the wait canvas on Confirm. Rows appear as groups land; the dock is live from the first row.
- **Photos without a jersey** is a new place inside the capture modal with multi-select. Actions: new jersey from selection, add selection to an existing draft (picker of this session's drafts), delete selection. The small sandbox strip on Confirm stays for leftovers and renders only when there are any.
- **Park and resume.** **Gør resten færdig senere** returns to Samling and keeps the persisted capture session. Samling shows one quiet row above the grid while a parked session exists (**3 trøjer mangler · Fortsæt**) that reopens the overview. The row's exact chrome is a design gap; build the plainest List row and flag it.
- **Vision off with four or more photos** lands directly in photos without a jersey. With three or fewer it lands on Confirm with the empty identity block.
- **Failures keep the session.** Partial upload failure is reported in the overview's inbox slot with retry, and the uploaded photos proceed. Vision timeout or network failure shows the "fotos er gemt" state with retry and sort-yourself. No path discards the draft.
- **Scan line** from Brand moments runs once per photo on its first identity read, never on reopen, and not at all with Reduce Motion.
- **Suggestion row in photos without a jersey** ("Ligner bagsiden af …") ships only if grouping can attribute a stray photo to an existing group at or above the suggest threshold. If the adapter cannot, the row is left out; do not fake it.
- **Low-confidence season alternative** ("2011/12 eller 2012/13") is shown only when the identity result carries an alternative. Otherwise the line shows the single guess.

Removed
- The Data card with donut and the Detaljer donut on the hub; the green "AI Vision udfyldte trøjens data" banner.
- Size and condition on the Detaljer drill.
- Empty dashed role slots and the **Upload** tile in the photo strip.
- The grouping wait canvas on Confirm.
- "Samme klub" / "Ny trøje" / "Til samling" as copy on the saved sheet.

Contradictions to resolve when landing
- The numbered composition under each Revision block in `docs/design-system.md` still describes the old layout. `/to-design` should rewrite it; until then the Revision block wins.
- `CONTEXT.md` describes Vision suggestion with pre-select on the Data drill and "grouping bind" at whole-dump level; add the per-group rule.
- The collector-facing name: this spec uses **Vision**. `CONTEXT.md` has "Vision suggestion"; the paywall copy says "Vision Matcher". One name should win.

Open values (Nicklas decides before the owning issue merges)
- Whether a Vision run that the collector discards counts against the quota (today: distinct ready identity drafts).
- Copy for the parked-pile row in Samling.

## Testing Decisions

A good test drives the public interface and asserts what the collector would see or where they end up.

- **Seam 1, capture session reducers** (existing): bind, unbind, new jersey from a selection, add selection to a draft, delete selection, fill order, per-group bind from a grouping result with mixed confidences, sticky size applied to a new draft and not condition.
- **Seam 2, Vision grouping HTTP interface** (existing): a result with groups at 90, 60 and 30 returns all three with their confidence and is not dropped; the client-facing status no longer depends on the minimum.
- **Seam 3, entitlement HTTP interface** (existing): remaining runs and the renewal date for a free collector; absent for Plus.
- **Seam 4, confirm-hub view-models** (existing confirm section and save-block logic): Save enabled exactly when the required fields are set; identity block state for resolved, in flight, low confidence and empty.
- **Seam 5, device flows** (Maestro, KIT-267): single jersey with fixed Vision; low confidence; a bulk fixture of 16 photos through overview, inbox and "Gem og næste"; Vision off; Vision failure with retry. Named screenshots per step.
- Existing copy and chrome tests are updated, not deleted.
- Motion is asserted only as "Reduce Motion reaches the same end state".

No new seams are proposed.

## Out of Scope

- The camera screen and the system picker.
- The Data drill and the catalog pickers behind **Ret**.
- Permission-denied states for camera and photos, unsupported file types, and duplicate detection against Samling (flagged as gaps in the lock).
- Changing the free allowance, the thresholds, the model or the prompts.
- OCR of size or brand.
- Editing a saved jersey.
- Dark mode for the new blocks.
- First-session capture (own photo before account), which is KIT-277.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **Add jersey 1.0**: a collector can add one jersey with two choices and Gem when Vision is right; can add a pile through the overview with per-group sorting and a real inbox; can turn Vision off and see the free quota; can park and resume; the listed failure states exist; and the device flows cover it.
- **Issues:** KIT-279 (confirm on one screen), KIT-280 (saved sheet), KIT-281 (start sheet, Vision switch, quota), KIT-282 (per-group grouping and bulk overview), KIT-283 (photos without a jersey), KIT-284 (failure states and device flows).

## Further Notes

- Benchmark: Uber's ride request, where the recommended option is already selected and one black button finishes, with placeholder rows while options load. Uber has no AI-fill or bulk-sort flow; references for those were eBay (AI suggestions marked inline), Whering (review one at a time with "review later"), Airwallex (matched first, unmatched after) and Google Photos (multi-select with bottom actions).
- Tap count, Vision correct: about nine taps and one screen change today; about three with sticky size (condition, Gem, next).
- Hooked note: the action gets simpler; the reward ("Trøje nr. 5") is predictable. A variable reward on the saved sheet (how rare the jersey is among collectors) was considered and left out because the data is not there yet.
- The grouping finding is from reading `vision-grouping-confidence.ts`, not from a run.
