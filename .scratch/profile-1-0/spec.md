# Profil & Indstillinger 1.0

## Problem Statement

A Collector's Profil is a control panel that is hard to move in and partly out of date:

- Indstillinger is a hub of four groups with eleven pages behind it; most hold one or two controls.
- Several pages no longer apply: Skift adgangskode goes away with the new sign-in, and Profiloplysninger repeats Rediger profil.
- KitCollective+ is nowhere on Profil. A Collector cannot see their status or find Gendan køb outside the paywall.
- Rediger profil is one form with a Gem in the header; a Collector who changes one thing must save the whole page.
- A Collector can block another Collector but cannot see or lift a block.
- Another Collector's profile offers nothing to do, and no way to see only what is åben for bud.
- Profil sits on a grey canvas with white cards while the rest of the app is white with rows.

## Solution

Profil follows `docs/design-system.md` → **Own Profil**, Revision 2026-10-10, and Paper page *08 Profil & Indstillinger*.

- **Profil home** shows who the Collector is, **Rediger profil** and **Se som andre**, and two rows: Favoritter and KitCollective+ with its status. Indstillinger is an Icon button.
- **Rediger profil** is rows that each save on their own; the username Sheet says whether the name is free.
- **Indstillinger** is one flat list with current values, including a private **Om dig** group with optional birthday and gender.
- **Notifikationer** is one screen for push and e-mail.
- **KitCollective+** has a status screen with the way to a plan and Gendan køb.
- **Blokerede samlere** lists blocks and lets the Collector lift one.
- **Peer Profil** gets **Skriv besked** and an Åbne for bud filter.

## User Stories

Profil home
1. As a Collector, I want my Avatar, Handle, city and number of jerseys at the top of Profil, so that I see what others see of me.
2. As a Collector, I want Rediger profil one tap away, so that I can change my public facts.
3. As a Collector, I want Se som andre, so that I can check my public profile.
4. As a Collector, I want a Favoritter row with the count, so that I find the jerseys I saved.
5. As a Collector, I want a KitCollective+ row that shows my status, so that I know whether Plus is active without opening anything.
6. As a Collector, I want Indstillinger behind an icon in the header, so that Profil is not a list of settings.
7. As a Collector, I want Profil on the same white canvas as the rest of the app, so that it feels like one product.

Rediger profil
8. As a Collector, I want to change my photo from the top of the screen, so that it is the first thing I can fix.
9. As a Collector, I want Brugernavn, Om mig and By as rows with their current value, so that I see my profile at a glance.
10. As a Collector, I want each row to open its own editor and save there, so that changing one thing takes one save.
11. As a Collector, I want to see whether a username is free while I type, so that I do not try names that are taken.
12. As a Collector, I want Gem disabled until the name is free, so that I cannot save a taken name.
13. As a Collector, I want to write and clear Om mig, so that I can describe what I collect or leave it empty.
14. As a Collector, I want By to open the city picker I know, so that I do not learn a new one.
15. As a Collector, I want a Vis by på profil switch with a line saying only my country shows when it is off, so that I control my location.
16. As a Collector, I want a clear message when a save fails, with what I typed kept, so that I can try again.

Indstillinger
17. As a Collector, I want all settings in one list, so that I do not open pages to find one switch.
18. As a Collector, I want the current value on each row, so that I can read my settings without opening them.
19. As a Collector, I want to see and change my e-mail, so that sign-in codes reach me.
20. As a Collector, I want to see which sign-in methods are linked, so that I know how I can get in.
21. As a Collector, I want to choose language and appearance, so that the app suits me.
22. As a Collector, I want Cookies and Mine data under Privatliv, so that privacy is in one place.
23. As a Collector, I want Log ud to ask first, so that I do not sign out by accident.
24. As a Collector, I want Slet konto to ask first and say what is deleted, so that I understand it cannot be undone.
25. As a Collector, I want no password page, so that I am not offered something the app no longer uses.

Om dig
26. As a Collector, I want to add my birthday if I choose, so that KitCollective can understand who uses it.
27. As a Collector, I want to add my gender if I choose, with Vil ikke oplyse as an answer, so that I am not forced into a box.
28. As a Collector, I want a line saying these are optional, hidden from others and used only for statistics, so that I trust the question.
29. As a Collector, I want to clear either again, so that I can change my mind.
30. As a Collector, I want them never shown on my public profile, so that they stay private.
31. As Nicklas, I want to see age and gender only as totals, so that I can measure the audience without looking at individuals.

Notifikationer
32. As a Collector, I want push for Bud, Beskeder and Match på ønsker as three switches, so that I choose what interrupts me.
33. As a Collector, I want e-mail for bids and messages as one switch and news as another, off by default, so that I am not sent marketing I did not ask for.
34. As a Collector who has denied push in the system, I want to be told and sent to system settings, so that the switches are not silently useless.

KitCollective+
35. As a Collector on a trial, I want to see when it ends and that nothing is charged, so that I am not worried.
36. As a Collector with a plan, I want to see when it renews, so that I know what I pay for.
37. As a Collector without a plan, I want Vælg plan, so that I can buy from Profil.
38. As a Collector with a plan, I want Administrer abonnement to open the store's own page, so that I can change or cancel it.
39. As a Collector, I want Gendan køb here, so that I get Plus back on a new phone.

Blokerede samlere
40. As a Collector, I want a list of the Collectors I have blocked, so that I know who they are.
41. As a Collector, I want to lift a block after being asked, so that I can undo a mistake.
42. As a Collector with no blocks, I want the list to say so, so that an empty page is not confusing.

Peer Profil
43. As a Collector, I want another Collector's Avatar, Handle, city, number of jerseys and About me, so that I know who they are.
44. As a Collector, I want Skriv besked there, so that I can talk to them about their collection.
45. As a Collector, I want to filter their jerseys to those åben for bud, with the count, so that I see what I can bid on.
46. As a Collector, I want their jerseys in the same tile as Samling, so that I read them the same way.
47. As a Collector, I want Rapportér and Blokér behind More, so that I can act on a bad profile.
48. As a Collector looking at Se som andre, I want no Skriv besked on my own profile, so that the view is honest.

Quality
49. As a Collector using a screen reader, I want every row announced with its label and value, and every switch with its state, so that I can manage my profile without seeing it.
50. As Nicklas, I want a Profil Device flow with a screenshot at each step, so that I can review the change before and after.

## Implementation Decisions

- **The lock is the visual source**: Own Profil, Revision 2026-10-10. Favoritter and Min lokation keep their older composition on the new canvas. Gaps are flagged, not invented.
- **Canvas.** Profil and every drill under it use the white canvas with flat rows; the grouped-card layout is removed.
- **Rediger profil saves per field.** Each editor sends only its field through the existing profile update. The header Gem is removed. Username availability uses the existing availability request, debounced.
- **Indstillinger** becomes one screen. The pages it replaces are removed with their routes: the hub's group pages, Profiloplysninger, Skift adgangskode, and the separate push and e-mail pages. Language, appearance, cookies, Mine data and change e-mail remain as leaves.
- **Gender** is a new optional field on the account with the values `female`, `male`, `other`, `undisclosed`; unset is distinct from `undisclosed`. Birthday already exists and stays optional. Both are set and cleared through the existing account update.
- **Private profile facts never leave the owner.** They are returned only on the Collector's own account response, never on a peer response, never in search, and they are included in the data export and removed on account deletion.
- **Statistics.** This spec adds no reporting surface. When reporting comes, it reads these fields only as counts per group, never per Collector, and suppresses groups under a minimum size.
- **Phone** is removed from the app. The column is left in place and no longer written.
- **Notification preferences** are one screen over the existing preferences: three push switches (bids, messages, wishlist matches) and two e-mail switches (bids and messages; news, default off). Preferences the old pages had and the new screen lacks are dropped from the client and treated as on by the server unless they were marketing, which are treated as off.
- **Blocks.** New: a request listing the Collectors the Collector has blocked (Handle, Avatar, when), and one lifting a block. Lifting a block removes only the Collector's own block; a block in the other direction still hides both from each other.
- **Peer response** gains the number of non-private jerseys and the number åben for bud. The peer jersey list accepts an åben-for-bud filter.
- **Se som andre** opens Peer Profil for the Collector's own Handle in a read-only mode without Skriv besked, Rapportér or Blokér. The server allows a Collector to fetch their own peer view.
- **KitCollective+ screen** derives its state from the Entitlement the client already has (source, live, expires): trial, paid, lapsed, none. Vælg plan opens the paywall Sheet from Ønsker & KitCollective+ 1.0; Administrer abonnement opens the platform's subscription page.
- **Skriv besked** on Peer Profil is the entry built in KIT-298; this spec places the button and does not build messaging.
- **Profil view-model** (new, pure, mobile): from account, Entitlement and preferences it returns the home rows with the KitCollective+ status text, the Indstillinger rows with their values, the state of the username Sheet (can save, availability text), and the KitCollective+ screen's title, line and button.

## Testing Decisions

A good test here exercises what a Collector or a client can observe: the response of a request, or what a screen would show for a given account. It does not assert on private helpers.

Seams (confirmed by Nicklas, 2026-10-10)
- **API, the HTTP boundary of identity and moderation** (existing). With real requests: gender and birthday can be set and cleared and appear on the own account only, never on a peer response, and are in the export; the block list and lifting a block, including that a block in the other direction still hides; the peer response carries the two counts and the filter works; a taken username is refused; a Collector can fetch their own peer view.
- **Mobile, the pure view-model of Profil** (new, one module): home rows and Plus status text per Entitlement state; Indstillinger rows and values; username Sheet state; KitCollective+ screen content.
- **Device flows** (Maestro): a seventh flow, `profile`: Profil home, Rediger profil, the username Sheet with a free name, Indstillinger, Notifikationer, the KitCollective+ screen, and another Collector's profile filtered to åben for bud. `CONTEXT.md` → Device flow names seven.

Prior art: the identity and conversation-moderation suites in the API tests; the profile-location unit test and other screen-logic tests in the mobile app; the existing Device flows and their Evidence run.

Not tested: the store's subscription page; pixel layout beyond the Device flow screenshots.

## Out of Scope

- Messaging itself (KIT-298) and the paywall Sheet (Ønsker & KitCollective+ 1.0).
- Any report or dashboard over birthday and gender.
- Showing age or gender to other Collectors, or using them to tailor what a Collector sees.
- Followers, ratings or verification on Peer Profil.
- Redesign of Favoritter and Min lokation beyond the canvas.
- Dropping the phone column from the database.
- Changing e-mail by code beyond what First session 1.0 delivers.
- Dark mode.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **Profil & Indstillinger 1.0** — complete when on staging Profil home shows identity, Favoritter and the KitCollective+ status on a white canvas; Rediger profil saves each field on its own with username availability; Indstillinger is one list with optional private birthday and gender; Notifikationer is one screen; the KitCollective+ screen shows the state and leads to a plan or the store; a Collector can see and lift blocks; Peer Profil has Skriv besked and the Åbne for bud filter; the Profil Device flow is green with before/after evidence.

## Further Notes

Gaps the lock leaves open (flag, do not invent): the birthday picker; Mine data; change e-mail with a code; dark mode.

Dependencies: KIT-276 (password removed from the app) for the Konto rows; KIT-298 for Skriv besked; KIT-302 for the paywall Sheet that Vælg plan opens; KIT-286 for the shared Jersey tile.

Personal data: birthday and gender are personal data. Before any statistics are built, the privacy text shown to Collectors must name them and their purpose.
