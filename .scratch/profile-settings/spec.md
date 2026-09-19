# Profil — own collector identity and settings

Feature spec for the KitCollective Linear project, milestone **Profil**. Design lock: `docs/design-system.md` (Gap 2026-08-28 own Profil — Switch, Avatar, Own Profil pattern, frames 5a–5o). Domain nouns: `CONTEXT.md`. Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md`. Visual evidence: `.scratch/profile-settings/claude-design/KitCollective-profil.html` (frames 5a–5o). Wireframe PNGs in that folder are IA only. Throwaway Expo prototype (`apps/mobile/src/prototype-profile/`, gate `EXPO_PUBLIC_PROTOTYPE=profile`) is not the contract and must not be copied into product UI.

This spec **does not** replace Indbakke, Collection home, or Tilføj trøje. It **supersedes** Collection home stories that left Profil as an empty place, and Indbakke stories that forbade a handle editor and city picker (those were deferred to this milestone). Other-collector Detaljer stays a stub. Ønske **content** stays the **Wishlist and premium** milestone.

Username in this spec is the Identity **handle** (unique, public, not email). Inbox may assign a handle at register; this milestone is where the collector edits it.

## Problem Statement

A collector who can already Save UserJerseys and reach tab slot 5 still has no own Profil: no avatar, no unique handle they chose, no About me, no location, no favorites of other collectors’ shirts, and no settings under that tab. Agents will either copy Vinted’s marketplace account hub or paste the throwaway prototype. Handle stays an email local-part. Cookie and notification rows will be fake switches.

## Solution

Slot 5 is **own Profil** (list + drill). Home shows an identity card (Avatar, handle, location caption, Rediger profil), Favoritter, Indstillinger, and Cookie-indstillinger. The collector edits identity, sets location as Catalog country then city search / popular / free tag, favourites other collectors’ UserJerseys as 4:5 tiles, and actually persists account, push/email preferences, language, appearance, privacy, and cookie consent. Log ud and Slet min konto confirm in a Sheet. The Tab bar shows only on Profil home. No listings, payments, postage, Help, or legal as primary places. No gender field.

## User Stories

1. As a collector after login, I want tab slot 5 to open own Profil, so that identity and settings have a primary place.
2. As a collector on Profil home, I want the title Profil in Archivo `title` 24, so that Samling’s display 28 stays special.
3. As a collector on Profil home, I want no KC mark and no Samling bell in that header, so that agents do not invent logo chrome.
4. As a collector on Profil home, I want the Tab bar visible with the person slot selected, so that I can leave the place.
5. As a collector on any Profil drill, I want the Tab bar hidden, so that grouped lists and docks are the footer.
6. As a collector who goes back from a drill, I want the Tab bar to return on Profil home, so that I am not stuck without navigation.
7. As a collector on Profil home, I want canvas `fill.secondary` with `surface` groups, so that chrome matches Detaljer and the lock.
8. As a collector on Profil home, I want an identity card that is not a List row, so that avatar and handle are not crammed into a chevron row.
9. As a collector, I want Avatar `lg` (64px circle) on that card, so that my photo is the identity — not the KC monogram.
10. As a collector with no photo, I want initials from my handle on `fill.secondary`, so that the slot is never empty artwork.
11. As a collector, I want my unique handle as `heading-sm` on the card, so that the name that follows me is visible.
12. As a collector with “Vis by” on, I want location `mono` as `{city} · {country}`, so that the card matches public stub city when I allow it.
13. As a collector with “Vis by” off, I want location `mono` as country only, so that city stays private.
14. As a collector, I want Button `secondary` Rediger profil with hit target ≥ 44, so that I can change identity without copying the hi-fi’s 36px control.
15. As a collector on home, I want a Favoritter row with leading icon, meta `{n} trøjer`, and chevron, so that favorites are one drill.
16. As a collector on home, I want Indstillinger and Cookie-indstillinger as two navigate rows with leading icons, so that settings are not a sixth tab.
17. As a collector on home, I want no debug line, balance, orders, Help, About, or legal rows, so that this is not a Vinted account hub.
18. As a collector, I want last home groups to clear the floating pill, so that Cookie-indstillinger is not hidden.
19. As a collector on Rediger profil, I want back, title, and trailing Gem, so that edit is a drill with an explicit save.
20. As a collector, I want Skift foto as a row with Avatar `md` (56px), so that I can replace the photo from the platform picker.
21. As a collector, I want no in-app crop editor, so that we do not invent a photo lab.
22. As a collector, I want a username Text field, so that I can change the public handle.
23. As a collector viewing my current handle, I want helper “Dit brugernavn — unikt og følger dig rundt.” in `content.secondary`, so that uniqueness is explained without green.
24. As a collector typing a free handle, I want helper “Ledigt.” in the same secondary role, so that available is not a success colour.
25. As a collector typing a taken handle, I want `danger` text that it is occupied, so that colour is not the only error signal.
26. As a collector, I want Gem to fail while the handle is taken, so that uniqueness is server truth.
27. As a collector, I want handle never to be my email, so that Thread rows and Profil stay public-safe.
28. As a collector, I want an About me multiline field, so that a short bio can exist without a new primitive.
29. As a collector, I want Min lokation as a navigate row with city/country meta, so that location is not a map.
30. As a collector, I want Vis by på profil as a Switch on the whole row, so that city privacy is one tap.
31. As a collector, I want helper that off shows country only, so that I know what the stub will show.
32. As a collector, I want no gender field, so that we do not store unused data.
33. As a collector on Min lokation, I want a country list from Catalog Country labels, so that country is stamdata, not a free string.
34. As a collector, I want the current country marked Nuværende with a chevron, so that I can still change it.
35. As a collector, I want no flags and no map on that list, so that Marks are not invented as country art.
36. As a collector after choosing a country, I want city search (Search field `city`) plus popular cities for that country, so that I am not in Google Places.
37. As a collector, I want a selected city to show a `fill.primary` check and no chevron, so that selected is not “Valgt” plus chevron.
38. As a collector whose query matches no popular city, I want Brug «{query}» as a normal row that saves a free tag, so that a missing city is not an error.
39. As a collector, I want live geocoding out of this milestone, so that fixtures and tags are enough to demo.
40. As a collector on Favoritter, I want a two-column 4:5 Jersey tile grid of other collectors’ UserJerseys I saved, so that favorites are shirts, not people-as-marketplace.
41. As a collector, I want no price, heart overlay, or owner handle on those tiles, so that the tile matches Samling anatomy.
42. As a collector tapping a favorite tile, I want that UserJersey’s collector-facing detail (existing foreign GET), so that owner lives on detail.
43. As a collector with zero favorites, I want an honest Empty state body and no primary that starts a chat, so that compose-to-nobody does not ship.
44. As a collector, I want to add and remove a favorite from another collector’s UserJersey (not from own Samling tiles), so that favorite is opt-in on others’ copies.
45. As a collector, I want favorite count on the home row to match the list, so that meta is not a stale fixture.
46. As a collector on Indstillinger, I want four grouped lists with mono section labels, so that the hub scans like 5g.
47. As a collector, I want Profiloplysninger and Kontoindstillinger as drills, so that identity vs account stay split.
48. As a collector, I want Push-notifikationer and E-mail-notifikationer as drills, so that Notify prefs have a place.
49. As a collector, I want Sprog with current language meta and chevron, so that locale is visible before the list.
50. As a collector, I want Mørk tilstand with current appearance meta (Systemindstilling / Lys / Mørk) and chevron, so that appearance is not a hidden OS-only switch.
51. As a collector, I want Privatlivsindstillinger as a drill, so that personalisation toggles are not on the hub.
52. As a collector, I want Log ud as a danger row (icon + label, no chevron) last in the privacy group, so that log out is reachable without a full-screen place.
53. As a collector tapping Log ud, I want Sheet confirm (title, consequence that collection and favorites stay, destructive Log ud, tertiary Annuller), so that a mis-tap does not drop the session.
54. As a collector who confirms Log ud, I want the session cleared and the auth stack shown, so that JWT is not left on the device.
55. As a collector on Konto, I want email with Bekræftet meta and trailing Skift, so that email change is explicit.
56. As a collector, I want phone shown masked with helper that it is login-only, never public, never marketing, so that we do not leak a number onto Profil home.
57. As a collector, I want SMS one-time login out of this milestone, so that Skift telefon is a stored value, not a new Identity provider.
58. As a collector, I want Fulde navn as a private account field, so that handle stays the public name.
59. As a collector, I want Fødselsdag as a date value with chevron, so that birthday exists; picker chrome may be the platform date control — do not invent a custom calendar if the host has none.
60. As a collector, I want linked Google to show Tilknyttet when Identity already has Google, and Facebook Ikke tilknyttet without inventing Facebook OAuth, so that the row is honest.
61. As a collector, I want Skift adgangskode, so that email+password remains the mandatory path.
62. As a collector, I want Slet min konto as a destructive path with the same Sheet confirm pattern as Log ud, so that delete is not a wizard.
63. As a collector who confirms delete, I want my Identity and collector-facing UserJerseys gone from Expo, so that delete is not a client-only hide.
64. As a collector on Push, I want grouped Switches (high priority vs other) and master Slå push til in its own last group, so that one off dims the rest.
65. As a collector with master push off, I want sibling rows at 40% opacity and not togglable, so that categories cannot fight the master.
66. As a collector, I want those preferences persisted on the server, so that reinstall does not reset Notify intent.
67. As a collector, I want Expo Push delivery jobs out of this milestone, so that prefs can ship before APNs/FCM.
68. As a collector, I want Daglig grænse as a navigate row whose picker chrome is flagged if missing, so that agents do not invent a stepper.
69. As a collector on E-mail, I want Nyheder off by default and high-priority on, so that marketing is opt-in.
70. As a collector, I want those email category flags persisted for Notify/SES later, so that the switches are not decorative.
71. As a collector on Privatliv, I want Switches for personalised content, recently seen, and favorite notifications, plus Administrer kontodata, so that privacy is three choices and one drill.
72. As a collector on Administrer kontodata, I want to request and receive a copy of my profile and UserJersey identifiers, so that download is not a no-op.
73. As a collector on Sprog, I want da / en / sv / no as a select list with a primary check on the current locale, so that CatalogLabel request locale and chrome locale stay aligned.
74. As a collector on Mørk tilstand, I want the same select list pattern for System / Light / Dark, so that we do not invent a second appearance control.
75. As a collector, I want appearance to follow existing dark semantic aliases, so that hi-fi `#0B0B0B` is not a new token.
76. As a collector on Cookie-indstillinger, I want necessary technologies as Altid aktive meta, not a dead Switch, so that required cookies are honest.
77. As a collector, I want Analysis and marketing as Switches, so that optional categories are a real choice.
78. As a collector, I want Button dock Acceptér alle (primary), Kun nødvendige (secondary), Bekræft mine valg (tertiary), so that three actions match the lock.
79. As a collector, I want that consent persisted and respected by the client (no analysis SDK if not granted), so that cookies actually choose.
80. As a collector, I want no legal essay on that screen, so that agents do not paste a privacy policy.
81. As a collector, I want Danish chrome, so that the first market can use Profil.
82. As a collector, I want hit targets ≥ 44×44, so that the accessibility floor holds.
83. As a collector with reduced motion, I want Switch thumbs and Sheet present without required travel, so that motion is not the only way to change a preference.
84. As a collector, I want never to see archive KitPhoto on Profil or Favoritter, so that unresolved rights do not leak.
85. As Nest Identity, I want unique handle on User, so that Profil and Indbakke share one public name.
86. As Nest Identity, I want PATCH of handle, about me, show-city, full name, birthday, phone, language, appearance, privacy flags, and cookie consent on the signed-in User, so that Expo does not talk to Postgres.
87. As Nest Identity, I want handle availability as a contract read before save, so that the three helper states are server-backed.
88. As Nest Identity, I want avatar bytes in R2 under the user prefix, never as Postgres bytea, so that photos match Collection objects.
89. As Nest Identity, I want location country as a Catalog Country id plus city as a string tag, so that city is not a Places id and not CatalogLabel text pretending to be a Club.
90. As Nest Identity, I want popular cities as a closed list per country (iso or country id), so that search has a fixture without geocoding.
91. As Nest Collection, I want a favorite row per (collector, UserJersey) for another collector’s copy only, so that I cannot favourite my own shirt in this milestone.
92. As Nest Collection, I want GET favorites to return Jersey tile fields (photo, club, season, type labels) without owner handle, so that the grid matches the lock.
93. As Nest Notify, I want push and email category booleans stored for this User, so that UI state is not AsyncStorage-only.
94. As a client app, I want to import only `packages/api-contract` and `packages/domain`, so that Expo never imports `packages/db` or `apps/api`.
95. As an implementing agent, I want to follow `docs/design-system.md` and flag gaps (empty Favoritter CTA, daily-limit picker, birthday picker, icon family), so that I do not copy `prototype-profile` or invent teal.
96. As Nicklas, I want this milestone demoable on a device build against staging: signed-in collector opens Profil, sets handle and location, favourites another collector’s UserJersey, changes a Switch that round-trips, sets cookie consent, and logs out via Sheet, so that Profil can promote independently of Wishlist IAP and other-collector Profil.

## Implementation Decisions

- **Linear:** Feature on existing project KitCollective. New milestone **Profil** (own staging increment). Do not attach this to **Wishlist and premium** or **Indbakke**. No second Linear project.
- **Visual lock:** `docs/design-system.md` wins. 5a–5o HTML is visual reference. Wireframe PNGs are IA only. Root `DESIGN.md` is the token snapshot; design-system wins on conflict. `prototype-profile/` is throwaway; do not `/land` that branch as product UI.
- **Modules (architecture lock):** No new Nest module. **Identity** owns handle, about me, avatar, location (country id + city tag + showCity), private account fields (full name, birthday, optional phone), language, appearance, privacy flags, cookie consent, password change, email change, session end, account delete, handle availability. **Collection** owns favorites of others’ UserJerseys and the foreign jersey GET already specified for Indbakke. **Catalog** owns Country labels for the country picker (existing stamdata). **Notify** owns persisted push/email category booleans (no send jobs this milestone). **Moderation** unused beyond existing block/report. **Wishlist** unused.
- **Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Callers and tests cross this interface. Profile, availability, avatar, location lists, favorites, and export are resources on this seam, not a second public interface. Expo talks only to that contract.
- **Handle:** Unique, public, not email. Same field Indbakke uses. PATCH rejects collision with the taken helper. Availability read returns `yours` | `available` | `taken` for the signed-in collector. Register may still auto-assign; this milestone is the editor.
- **Location:** `countryId` → Catalog Country. `city` optional string tag. `showCity` boolean. Popular cities: closed list in domain or Identity keyed by country; free tag when search misses. No Places, no “use my location”.
- **Avatar:** Object keys `user/{userId}/avatar/…`. GET me returns a URL or null. Missing photo is initials. Not KitPhoto. Not the KC monogram.
- **Favorites:** Unique `(userId, userJerseyId)`. Target must not be owned by the collector. List uses Collection jersey photo URLs and CatalogLabel captions. Tile omits owner; detail uses existing foreign GET.
- **Preferences:** Language `da` | `en` | `sv` | `no`. Appearance `system` | `light` | `dark` (client maps to existing semantic aliases). Privacy booleans as in the lock. Cookie: necessary always true; analysis and marketing booleans; Accept all / essential only / confirm write those flags. Client must not load analysis when analysis is false.
- **Notify prefs:** Persist master push + categories and email categories. Do not require Expo Push token or SES send in this milestone.
- **Account delete:** Server-side; collector session invalid; owned UserJerseys not listed on collector surfaces. Do not soft-delete only on the device.
- **Log out:** Invalidate or drop the access token on device; optional server revoke if the session model has one. Collection rows remain.
- **Linked accounts:** Read existing Identity providers. Do not add Facebook OAuth. Google link only if Identity already supports it this increment; otherwise the row stays Ikke tilknyttet / Tilknyttet as data allows and agents flag.
- **Phone:** Optional stored value, masked in UI, never on the identity card. Not a second mandatory login path.
- **Export:** Authenticated copy of own profile fields and UserJersey ids (and photo keys). Email ZIP job can wait; a contract GET is enough to demo Administrer kontodata.
- **Expo chrome:** Pattern Own Profil. Primitives Switch, Avatar, List row leading/trailing as locked. Hide Tab bar on every drill including Favoritter. Show on home only.
- **Dark:** Existing dark aliases. Do not add `#0B0B0B` tokens.
- **Clients:** `apps/mobile` must not import `apps/api` or `packages/db`.
- **Lanes:** Demo against staging catalog after promote. Development Nest remains in VMs.
- **CONTEXT.md:** First implement slice should add glossary nouns **Profil** (own collector place), **Handle** (if not already from Indbakke), **Favorit** (saved foreign UserJersey). Product names, not a second design system.

Handle availability (decision, not a host file):

```text
{ handle: string, status: "yours" | "available" | "taken" }
```

Favorite list item (tile contract, owner omitted on purpose):

```text
{
  userJerseyId: uuid
  photoUrl: string
  clubLabel: string
  seasonLabel: string
  type: Kit type enum
}
```

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle column names, Expo component trees, glass blur, Switch pixel size, or font hashes.

**Good test:** HTTP (contract parse + Nest) with two signed-in Collectors and fixture club/season UserJerseys. A patches handle to a unique value; B cannot take it (`taken`). A sets country + city tag + showCity; GET me returns them. A uploads an avatar; GET me URL is not a KitPhoto key. A favourites B’s UserJersey; list length 1 with club/season labels and no owner handle; A cannot favourite A’s own jersey. Cookie consent PATCH essential-only then GET shows analysis false. Log out / delete leave subsequent GET me 401. 401 without session.

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest. `/tdd` will not re-quiz this seam.

**Adapters behind the seam (not the test surface):** Postgres via `packages/db`; object store for avatars. Two adapters (real vs test DB / memory object store) make those internal seams real; tests still enter through HTTP.

**Do not add a seam** for Expo UI. Design lock + import-boundary tests are enough. Pixel tests are out. Do not test the throwaway prototype store.

**Modules tested:** Identity (me, handle, location, avatar, prefs, consent, password, delete). Collection (favorites). Catalog Country labels insofar as the country list uses them. Notify persistence only if it is a distinct resource on the same `/v1` seam — otherwise it lives under Identity preferences.

**Prior art:** `apps/api/tests/identity.test.ts` (register, login, me). `apps/api/tests/collection.test.ts` (two users, Save, list). Schema migrate tests on ephemeral Postgres. Import-boundary tests stay.

## Out of Scope

- Other-collector Profil beyond the Indbakke Detaljer stub.
- Gender field.
- Marketplace account chrome (my listings, payments, postage, Help, About, legal as primary places).
- Wishlist **content**, IAP, Ønske placement (Profil vs Søg) — **Wishlist and premium**.
- Live geocoding / Places / “use my location”.
- Expo Push send and SES marketing/news send (persist prefs only).
- Facebook OAuth; Apple social unless already required by store social (email+password stays mandatory).
- SMS OTP as login.
- Custom birthday calendar or daily-limit stepper if not in the lock — flag.
- Empty Favoritter primary CTA — flag; do not invent “start a chat”.
- KC mark on Profil header.
- Copying `prototype-profile` into product UI or landing the prototype branch.
- Serving KitPhoto to Expo.
- Changing Capture / Confirm / genveje / Indbakke conversation behaviour.
- Public Astro Profil.

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Profil — Signed-in Expo slot 5 is own Profil (list + drill). Collector can set handle, avatar, location, favourite another collector’s UserJersey, persist a Switch (prefs/cookies), and log out via Sheet. Demoable on a device build against staging catalog. Ready to promote integration → staging when that works. Throwaway prototype is not this milestone.

## Further Notes

- Glossary: `CONTEXT.md`. Visual: `docs/design-system.md` Own Profil. Tokens snapshot: `DESIGN.md`.
- Indbakke spec remains `.scratch/inbox/spec.md`. Handle auto-assign at register stays; this spec is the editor and the location picker.
- Collection home spec remains `.scratch/collection-main-screen/spec.md`. Slot 5 is no longer an empty Profil place.
- Architecture already named Identity, Collection, Catalog, Notify — use them; do not add a Settings module.
- Seed catalogs must exist so another collector’s UserJersey can be favourited with club/season labels; seed work stays on KitCollective Seed.
- Next slash: `/to-tickets` for vertical slices under Profil. Do not invent issues from this skill.
