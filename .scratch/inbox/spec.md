# Indbakke — collector messages and bud

Feature spec for the KitCollective Linear project, milestone **Indbakke**. Design lock: `docs/design-system.md` (Gap 2026-08-28 Indbakke). Domain nouns: `CONTEXT.md`. Architecture: `.scratch/Architecture/tech-stack.md` and `data-model.md`. Visual evidence: `.scratch/inbox/claude-design/KitCollective-indbakke.html` (frames 4a–4i). Throwaway Expo prototype (`apps/mobile/src/prototype-inbox/`, gate `EXPO_PUBLIC_PROTOTYPE=inbox`) is not the contract and must not be copied into product UI.

This spec **supersedes** Collection home stories that locked tab slot 4 as Heart / Ønske and that forbade a badge on a tab. Ønske **content** stays the **Wishlist and premium** milestone. Capture, Save, Samling grid, and genveje stay as in **Collection home** and **Tilføj trøje**.

## Problem Statement

A collector who can already Save UserJerseys still has no way to talk to another collector about a shirt. Slot 4 is an empty Ønske place. A bud has nowhere to land, so agents will either invent marketplace checkout on Samling tiles or copy the throwaway inbox prototype. Without a locked conversation model, Beskeder and Aktivitet become two inboxes, and unread fights the Samling bell.

## Solution

Slot 4 is **Indbakke** (envelope). The collector sees **Beskeder** (thread rows) and **Aktivitet** (bid/event cards) as two views of **one conversation**. Sending a **bud** on another collector’s bidding-enabled UserJersey (from **Søg**, never from own Samling tiles) creates that conversation. Replies are text and photos. Incoming pending buds show Accepter / Afvis. Detaljer is report, block, and delete — no Help. Unread is a shared count: row/card `fill.secondary`, envelope badge, Samling bell left for other notifications. A bud is a message, not payment.

## User Stories

1. As a collector after login, I want tab slot 4 to be Indbakke (envelope), so that messages have a primary place.
2. As a collector, I want slot 4’s accessible name to be Indbakke, so that VoiceOver is not Ønske.
3. As a collector, I want no heart icon in the tab bar, so that Ønske is not pretending to be this place.
4. As a collector, I want the other four slots unchanged (Samling, Søg, Tilføj trøje, Profil), so that capture and home stay.
5. As a collector on Indbakke, I want the title Indbakke in Archivo `title` 24, so that Samling’s display 28 stays special.
6. As a collector on Indbakke, I want no Samling bell in that header, so that inbox unread is not a second bell.
7. As a collector, I want underline tabs Beskeder | Aktivitet, so that I can scan threads or bid events.
8. As a collector, I want Beskeder and Aktivitet to be two views of the same conversations, so that I do not keep two unread models.
9. As a collector, I want opening a conversation from either tab to mark that conversation read in both tabs, so that unread stays shared.
10. As a collector with no conversations, I want Empty state inbox (“Ingen beskeder endnu” plus one honest sentence), so that I am not looking at fake threads.
11. As a collector on that empty state, I want no primary that invents “start a chat” without a recipient, so that compose-to-nobody does not ship.
12. As a collector, I want the Tab bar visible on the Indbakke list (including empty), so that I can leave the place.
13. As a collector, I want last list rows to clear the floating pill, so that threads are not hidden.
14. As a collector, I want a Thread row with 44px initial, handle, one-line snippet, and relative time, so that Beskeder scans like the lock.
15. As a collector, I want an unread Thread row on `fill.secondary` with a stronger snippet, so that unread is visible without a row badge.
16. As a collector, I want an Activity card with title, club · season · type, amount in the card body, status, and handle, so that a bud is not a price overlay on a tile.
17. As a collector, I want unread Activity cards on `fill.secondary` and read cards with a hairline border, so that the same unread rule applies.
18. As a collector, I want tapping a Thread row or Activity card to open that Samtale, so that both tabs go to the same thread.
19. As a collector in Samtale, I want the Tab bar hidden, so that the composer is the footer.
20. As a collector in Samtale, I want back to return to Indbakke with the Tab bar shown again, so that I am not stuck in a thread.
21. As a collector in Samtale, I want the other collector’s handle centred and an overflow control named Detaljer, so that chrome matches 4c.
22. As a collector in Samtale, I want an optional one-line jersey context (club · season · type in mono), so that I know which UserJersey the thread is about.
23. As a collector in Samtale, I want incoming bubbles on the left (them) and outgoing on the right (me), so that alignment is not guessed.
24. As a collector, I want incoming bubbles on `fill.secondary` and outgoing on `fill.primary` with inverse text, so that grayscale hierarchy holds in light and dark.
25. As a collector, I want centred date lines in mono, so that the timeline is not a third bubble style.
26. As a collector, I want a pending incoming bud as a Bid card with amount, Afventer, Accepter, and Afvis, so that I can answer without a payment sheet.
27. As a collector who sent a bud, I want no Accepter/Afvis on my own pending card, so that only the owner decides.
28. As a collector, I want Accepter to mark that bud accepted, so that the thread records the outcome.
29. As a collector, I want Afvis to mark that bud declined, so that the thread records the outcome.
30. As a collector, I want accept/decline never to move money or open checkout, so that a bud stays a message.
31. As a collector, I want to send a text reply from the composer, so that we can talk after a bud.
32. As a collector, I want to attach a photo (4:5 in the thread), so that a neck label or wear can be shown.
33. As a collector, I want a dismissible reply-to line when I reply to one message, so that quoting is optional.
34. As a collector, I want Send disabled when there is no text and no pending image, so that empty sends do not create rows.
35. As a collector, I want the composer above the OS keyboard, so that Android/iOS keyboards are platform exceptions, not a second composer.
36. As a collector, I want Detaljer to hide the Tab bar, so that grouped lists are the whole screen.
37. As a collector on Detaljer, I want a profile stub (handle, jersey count, city when present) that navigates only as far as that stub, so that we do not invent settings.
38. As a collector, I want Rapportér {handle}, so that a safety report exists for staff later.
39. As a collector, I want Blokér {handle} to hide our conversations from each other, so that I am not forced to keep reading.
40. As a collector, I want Slet samtale to remove the thread only for me, so that the other collector still has their copy.
41. As a collector, I want helper copy that blocking is mutual-hide and delete is mine-only, so that I am not surprised.
42. As a collector, I want no Help row on Detaljer, so that agents do not copy Vinted Help.
43. As a collector, I want destructive rows to use danger colour plus an icon, so that colour is not the only signal.
44. As a collector on Søg, I want to find another collector’s UserJersey by club/season CatalogLabel text when that copy is åben for bud, so that Send bud has an entry that is not my Samling grid.
45. As a collector viewing someone else’s bidding-enabled UserJersey, I want Send bud (title, 4:5 photo, club, season · type, owner handle), so that I can start a conversation.
46. As a collector on Send bud, I want the Tab bar visible with Søg selected, so that this screen lives under compass, not envelope.
47. As a collector on Send bud, I want an integer DKK amount field with kr suffix, so that we do not invent a currency picker.
48. As a collector, I want helper text for the most recent bud on that UserJersey when one exists, so that I have a floor without a live auction.
49. As a collector, I want primary Send bud to create or reuse the conversation for me + owner + that UserJersey and insert a pending Bid card, so that the owner’s Indbakke lights up.
50. As a collector, I want caption that the owner gets a message and this is not a purchase, so that checkout is not implied.
51. As a collector, I want Send bud to fail if the UserJersey is mine, so that I cannot bid on my own copy.
52. As a collector, I want Send bud to fail if bidding is not enabled, so that “åben for bud” is real.
53. As a collector on my own UserJersey detail, I want to turn bidding on or off, so that listing status is opt-in.
54. As a collector, I want that control never to put a price or buy chrome on a Samling tile, so that the catalog stays photo-first.
55. As a collector, I want the envelope badge to show the count of unread conversations (shared model), black fill not red, hidden at zero, so that I see inbox waiting without leaving Samling.
56. As a collector, I want the Samling header bell to remain a separate control that does not show that inbox count, so that Q3’s three signals keep different jobs.
57. As a collector, VoiceOver on slot 4 should include the unread count when the badge is visible, so that the badge is not the only signal.
58. As a collector who blocked someone, I want their threads gone from Beskeder and Aktivitet, so that block is effective.
59. As a collector, I want a blocked peer not to create a new visible thread with me until unblock (unblock UI may be later — flag if missing), so that block is not a toggle we invent on Detaljer twice.
60. As a collector, I want report to persist for Staff access later without opening Admin SPA in this milestone, so that Rapportér is not a no-op.
61. As a collector on dark appearance, I want the same semantic tokens (4d), so that we do not invent a third palette.
62. As a collector on a ≥1024-wide host, I want list + conversation side by side (4i) with the selected row’s leading primary edge, so that wide is the same product.
63. As a collector on Expo Web, I want no promise that Indbakke is first-class, so that 4i does not ship a desktop web app.
64. As a collector, I want Danish chrome, so that handles and copy match the first market.
65. As a collector, I want hit targets ≥ 44×44, so that the accessibility floor holds.
66. As a collector with reduced motion, I want tab underline and sheet-like pushes without required travel, so that motion is not the only way to open a thread.
67. As a collector, I want never to see archive KitPhoto in Indbakke, so that unresolved rights do not leak.
68. As a collector, I want conversation images to be the sender’s upload, so that product photos in chat stay collector-owned.
69. As Nest Collection, I want one conversation row per (UserJersey, unordered pair of Collectors), so that a second bud on the same shirt reuses the thread.
70. As Nest Collection, I want messages ordered by time, with kind text | image | bid, so that the client does not invent kinds.
71. As Nest Collection, I want a bid amount stored as integer DKK, so that “350 kr” is data, not a display-only string.
72. As Nest Collection, I want participant lastReadAt, so that unread is server truth.
73. As Nest Collection, I want GET inbox list, GET conversation, POST message, POST bid, POST accept/decline as authenticated owner-scoped resources, so that Expo never talks to Postgres.
74. As Nest Collection, I want Aktivitet to be a projection of bid (and bid-status) messages, so that we do not store a second inbox table.
75. As Nest Collection, I want GET of another collector’s UserJersey by id when I am signed in, so that Send bud and jersey context have a contract.
76. As Nest Collection, I want Søg-over-others to return only bidding-enabled UserJerseys that are not mine, so that Send bud cannot target a closed copy.
77. As Nest Identity, I want each Collector to have a unique public handle, so that Thread rows do not show raw email.
78. As Nest Identity, I want handle assigned at register if the collector has none (email local-part plus a suffix on collision), so that inbox can ship before Profil edit.
79. As Nest Identity, I want optional city on the stub only when a value exists, so that we do not invent a city picker in this milestone.
80. As Nest Moderation, I want block and report rows, so that Detaljer actions are not client-only flags.
81. As a client app, I want to import only `packages/api-contract` and `packages/domain`, so that Expo never imports `packages/db` or `apps/api`.
82. As an implementing agent, I want to follow `docs/design-system.md` and flag gaps, so that I do not copy `prototype-inbox` or Vinted teal.
83. As Nicklas, I want this milestone demoable on a device build against staging with two Collectors: A enables bidding on a UserJersey, B finds it on Søg, sends a bud, A sees Indbakke unread, opens Samtale, accepts or replies, so that Indbakke can promote independently of Wishlist IAP and Astro.

## Implementation Decisions

- **Linear:** Feature on existing project KitCollective. New milestone **Indbakke** (own staging increment). Do not attach this to **Wishlist and premium** (that milestone is structured wishlist + IAP). No second Linear project.
- **Visual lock:** `docs/design-system.md` wins. 4a–4i HTML is visual reference. Wireframe PNGs in `.scratch/inbox/claude-design/` are IA only. Root `DESIGN.md` is the token snapshot; design-system wins on conflict. `apps/mobile/src/prototype-inbox/` is throwaway; do not `/land` that branch as product UI.
- **Modules (architecture lock):** No new Nest module. **Collection** owns UserJersey `biddingEnabled`, Conversation, Message, Bid, inbox list/projection. **Moderation** owns block and report (already named in tech-stack). **Identity** owns unique `handle` and optional stub city. **Notify** is unused this milestone (no Expo Push for inbox). **Wishlist** is unused.
- **Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Callers and tests cross this interface. Inbox, foreign UserJersey read, bidding flag, discover-for-bid, handle, block, and report are resources on this seam, not seven competing seams. Expo talks only to that contract.
- **Conversation identity:** Unique per `userJerseyId` + canonical pair of collector ids. Reuse on a later bud or message. Reject self-conversations and bidding on own UserJersey.
- **Activity:** Derived from bid messages (created, accepted, declined) on conversations the collector participates in. Do not persist a parallel activity table.
- **Unread:** Per-participant `lastReadAt`. Envelope `unreadCount` = conversations where the latest message is from the other collector and is newer than `lastReadAt`. Opening Samtale updates `lastReadAt`. Badge hidden at 0. Do not invent a 99+ cap.
- **Bell vs badge:** Samling bell stays Collection-home behaviour (not this count). Envelope badge is inbox only.
- **Bid:** Integer DKK ≥ 1. Status `pending` | `accepted` | `declined`. Only the UserJersey owner may accept or decline a pending incoming bid. No payment provider, no hold, no fee.
- **biddingEnabled:** Boolean on UserJersey, default false. Owner PATCH on own copy. Samling Jersey tile never shows amount, buy, or boost.
- **Discover:** Authenticated search of other collectors’ UserJerseys with `biddingEnabled` true, matching CatalogLabel text (club/season) in the request locale fallback. Own-collection Søg from Collection home remains. Send bud is a Søg-stack screen.
- **Foreign jersey GET:** Authenticated GET by id returns labels, photos (collector bytes), owner handle stub, `biddingEnabled`. 404 if taken down or unknown. Not KitPhoto.
- **Handle:** Unique, public, not email. Register fills a unique handle from the email local-part; collision gets a numeric suffix. Editing handle is Profil (out of scope).
- **City:** Optional string on User; omit from Detaljer when null. No city catalog in this milestone.
- **Photos in chat:** Same byte-upload idea as collection Save photos (base64 or existing object-store path), object keys under the sender’s user prefix plus conversation id. Serve via the contract’s photo URL pattern, never archive KitPhoto.
- **Delete conversation:** Soft-hide for the deleter (`hiddenAt` on the participant). The peer still lists it. Messages remain.
- **Block:** Moderation row. Both directions stop listing and creating conversations until a later unblock surface exists — flag unblock UI; do not invent it on Detaljer.
- **Report:** Moderation row (reporter, peer, conversation, optional reason). 201. No Admin SPA queue in this milestone.
- **Expo chrome:** Patterns Inbox, Conversation, Conversation details, Send bid. Tab bar slot 4 envelope + `unreadCount`. Hide Tab bar on Samtale and Detaljer (and existing capture). Update the mobile tab-bar ratchet that still expects Ønske/heart so CI matches the lock.
- **Wide:** Apply 4i when the host width is ≥1024. Do not treat Expo Web as a first-class surface.
- **Clients:** `apps/mobile` must not import `apps/api` or `packages/db`.
- **Lanes:** Demo against staging catalog after promote. Development Nest remains in VMs.
- **CONTEXT.md:** First implement slice should add glossary nouns **Indbakke**, **Conversation**, **Bud** (message about a UserJersey, not checkout) — product names, not a second design system.

Conversation list item (decision, not a host file):

```text
{
  id: uuid
  userJerseyId: uuid
  peer: { id: uuid, handle: string, initial: string, collectionCount: number, city?: string }
  clubLabel: string
  seasonLabel: string
  type: Kit type enum
  snippet: string
  lastMessageAt: iso
  unread: boolean
}
```

Bid payload on a message (from the throwaway prototype’s `BidPayload` / `MessageKind`, trimmed to persisted truth):

```text
kind: "text" | "image" | "bid"
bid?: { amountDkk: number, status: "pending" | "accepted" | "declined" }
```

`from: "me" | "them"` is a response projection for the signed-in collector, not a stored third “system” participant. Centred dates are derived from `createdAt`.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle column names, Expo component trees, glass blur, or font hashes.

**Good test:** HTTP (contract parse + Nest) with two signed-in Collectors, fixture club/season UserJerseys, owner sets `biddingEnabled`, peer POSTs a bud, owner lists inbox with unread 1, GET conversation sees pending Bid card, POST accept, peer sees status accepted, Aktivitet projection matches the same conversation id. 401 without session. Cannot bid on own jersey. Cannot bid when disabled. Block hides list both ways. Delete hides only for deleter. Handle is not email. Amounts are integers. No KitPhoto URLs.

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest. `/tdd` will not re-quiz this seam.

**Adapters behind the seam (not the test surface):** Postgres via `packages/db`; object store for chat images. Two adapters (real vs test DB / memory object store) make those internal seams real; tests still enter through HTTP.

**Do not add a seam** for Expo UI. Design lock + import-boundary tests are enough. Pixel tests are out. Do not test the throwaway prototype reducer.

**Modules tested:** Collection (conversations, messages, bids, biddingEnabled, discover). Identity (handle on register/session as needed for inbox). Moderation (block, report) insofar as the contract is the same `/v1` seam.

**Prior art:** `apps/api/tests/collection.test.ts` (register, fixture club/season, Save, list). Schema migrate tests on ephemeral Postgres. Use two `registerSession` users in one test, then call the new contract. Import-boundary tests stay.

## Out of Scope

- Wishlist **content**, IAP, premium, match push (**Wishlist and premium** milestone). Ønske has no tab in this increment; do not invent a sixth tab or a wishlist row.
- Payment, escrow, shipping, “køb nu”, listing price on Samling tiles.
- Expo Push / Notify jobs for new messages (in-app unread only).
- Unblock UI, Help centre, Admin SPA report queue.
- Profil settings, handle editor, city picker, KC mark on Profil.
- Public Astro inbox or OG of a conversation.
- Websockets / realtime; polling or refetch on focus is enough.
- Android-only composer chrome; 99+ badge cap.
- Expo Web as a first-class inbox product.
- Landing `prototype/inbox-ux` or copying `prototype-inbox` components.
- Serving KitPhoto to Expo.
- Apple / Google login.
- Changing Capture / Confirm / genveje behaviour.

## Linear

- **Project:** KitCollective
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Indbakke — Signed-in Expo slot 4 is Indbakke. Two Collectors can complete Send bud → thread → accept/reply with shared unread (row + envelope badge). Demoable on a device build against staging catalog. Ready to promote integration → staging when that works. Throwaway prototype is not this milestone.

## Further Notes

- Glossary: `CONTEXT.md` (add Indbakke / Conversation / Bud on implement). Visual: `docs/design-system.md`. Tokens snapshot: `DESIGN.md`.
- Collection home spec remains `.scratch/collection-main-screen/spec.md`. Where slot 4 / tab badge disagree, **this document and the Gap 2026-08-28 lock win**.
- Architecture already named Moderation for block/report — use it; do not skip to a client-only block list.
- Seed catalogs must exist so Søg-over-others has club/season labels; seed work stays on KitCollective Seed.
- Next slash: `/to-tickets` for vertical slices under Indbakke. Do not invent issues from this skill.
