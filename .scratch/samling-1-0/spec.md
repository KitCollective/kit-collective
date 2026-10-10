# Samling 1.0

Status: draft for Nicklas. Written 2026-10-10. Spec type: `feature` on **KitCollective v1**. Design approved by Nicklas on 2026-10-10.

Design reference: Paper file "KitCollective App", page `04 Samling`: row `Samling / 01`–`05` and row `Egen trøje / 01`–`09`, with the current build above them. Rules: `docs/design-system.md` → **Typography → Numerals**, **Components → Number emblem**, **Samling** (headed by a **Revision 2026-10-10** block that wins over the older composition beneath it) and **Own UserJersey detail**. Where Paper and the lock disagree, the lock wins and the gap is flagged.

## Problem Statement

Samling is where a collector feels the collection, and today it shows very little of it. The screen is a title, a small count and a grid of photos with two lines of text. A collector cannot see which jerseys have bids waiting, which are private, or anything about the collection as a whole. There is no sorting, so a collection of a hundred jerseys can only be narrowed by a shortcut.

The collector's own jersey is worse. The photo is cropped so it shows a collar and not a shirt. Every fact about the jersey sits in one long line that cannot be tapped. To correct a single fact the collector opens a separate edit screen. The largest and most coloured button on the screen is **Slet**. A jersey that is open for bids says nothing about the bids it has received; the collector has to go to Indbakke to find out.

## Solution

Samling shows the collection, and a jersey shows itself and lets the collector fix one thing in one step.

1. **Samling** opens with three facts about the collection in a shirt-print numeral: jerseys, clubs, oldest season. A view-and-sort control leads the chip row. Sorted by club, the jerseys sit under club headings. A tile carries one badge: unanswered bids, or a lock when private.
2. **Vis og sortér** is one sheet: show all, open for bids, with bids, or private; sort by latest, club, or season. The choice is remembered.
3. **Own jersey** shows the photo in full at 4:5 with a strip of thumbs, the club with the season beside it in the numeral, and, when bids are waiting, a quiet row straight under the title that opens the thread.
4. **The player** is a row with a number emblem: the shirt number as an object.
5. **Every fact is its own target.** Type, size, condition and badge open a small sheet; season opens the club's seasons; player and club open the full-screen picker. A tap saves. There is no edit screen.
6. **Changing club asks first**, because it is the only edit that resets other facts.
7. **Delete lives behind More**, and the red button exists only in the confirmation, which says what is removed.

## User Stories

Samling
1. As a collector, I want to see how many jerseys I own as a large number, so that the collection feels like something.
2. As a collector, I want to see how many clubs and national teams my collection spans, so that I can see its breadth.
3. As a collector, I want to see my oldest season, so that the collection has a past.
4. As a collector with an empty collection, I want no facts block, so that I am not shown three zeros.
5. As a collector, I want a clear capture button in the header, so that adding a jersey is the most obvious action.
6. As a collector, I want unselected shortcuts to look quiet, so that the selected one stands out.

View and sort
7. As a collector, I want one control that opens view and sort, so that I do not hunt for it.
8. As a collector, I want to show only jerseys open for bids, so that I can see what I am offering.
9. As a collector, I want to show only jerseys with unanswered bids, so that I can answer them.
10. As a collector, I want to show only private jerseys, so that I can review what is hidden.
11. As a collector, I want each view to show its count, so that I know what a tap will give me.
12. As a collector, I want to sort by latest added, so that new jerseys are on top.
13. As a collector, I want to sort by club A–Å, so that I can find a club.
14. As a collector, I want to sort by season, newest or oldest first, so that I can browse by era.
15. As a collector, I want a tap on a view or a sort to apply and close the sheet, so that it takes one tap.
16. As a collector, I want my view and sort remembered, so that Samling opens the way I left it.
17. As a collector with a view active, I want the control to show the view's name and count with a clear cross, so that I know I am not seeing everything.
18. As a collector, I want a view and a shortcut to combine, so that I can see my Arsenal jerseys that are open for bids.

Tiles and grouping
19. As a collector sorting by club, I want jerseys grouped under the club name with a count, so that the page has rhythm.
20. As a collector sorting by club, I want the tile to lead with the season, so that the club name is not repeated on every tile.
21. As a collector in any other sort, I want the club on the tile, so that I always know what I am looking at.
22. As a collector, I want the size on the tile, so that I can tell two copies apart.
23. As a collector, I want a badge on a tile that has unanswered bids, so that I see it without opening the jersey.
24. As a collector, I want a lock on a private tile, so that I know others cannot see it.
25. As a collector, I want no bid amount on a tile, so that my collection does not look like a shop.

Own jersey
26. As a collector, I want the whole photo at 4:5, so that I see the jersey and not a crop of it.
27. As a collector, I want to swipe between photos and see which one I am on, so that I can look at front and back.
28. As a collector, I want a strip of thumbs under the photo, so that I can jump to a photo.
29. As a collector, I want to add a photo from the strip, so that I do not open a menu for it.
30. As a collector, I want the club as the title with the season beside it in the numeral, so that the two facts that name a jersey are the largest things on the screen.
31. As a collector, I want the jersey's number in my collection above the title, so that I know where it sits.
32. As a collector, I want the facts as rows with a label and a value, so that I can read them.
33. As a collector, I want an unset optional fact to say **Tilføj**, so that I know I can fill it in.

Bids on own jersey
34. As a collector with unanswered bids on a jersey, I want a row straight under the title, so that I never miss a bid.
35. As a collector, I want that row to show who bid most recently and when, so that it reads like a message.
36. As a collector, I want a tap on the row to open the thread, so that I can answer.
37. As a collector, I want no amount in that row, so that a bid stays a message and not a price.
38. As a collector with no unanswered bids, I want the row gone, so that the screen stays quiet.

Player
39. As a collector, I want the player shown with the shirt number as an emblem, so that it reads as the name on the back.
40. As a collector without a player set, I want **Tilføj spiller**, so that I can add one.
41. As a collector, I want to pick the player from that club's squad that season, with numbers, so that I pick the right one.
42. As a collector, I want to search the squad, so that I find the player fast.
43. As a collector, I want to remove the player, so that an unprinted shirt can be right.

Editing one fact
44. As a collector, I want to change type with one tap in a sheet, so that fixing a wrong type is quick.
45. As a collector, I want to change size and condition the same way, so that every small fact works alike.
46. As a collector, I want to change badge the same way, so that I can add one later.
47. As a collector, I want to change season from a list of that club's seasons with decade jumps, so that I do not scroll through thirty years.
48. As a collector changing season, I want the player kept only if he was in that squad, so that the jersey stays true.
49. As a collector, I want to change club in the full-screen picker with search, so that I can find any club.
50. As a collector changing club, I want to be told what is kept and what is reset before it happens, so that I do not lose the player by surprise.
51. As a collector, I want **Behold *klub*** as the way out, so that a mistaken tap costs nothing.
52. As a collector, I want every change saved as I make it, so that there is no Gem button to forget.
53. As a collector, I want a failed save to put the old value back and tell me, so that the screen never lies.

Settings and delete
54. As a collector, I want **Åben for bud** and **Privat** as two rows with a switch, so that they read like settings.
55. As a collector, I want turning **Privat** on to turn bids off and say why, so that the rule is visible.
56. As a collector, I want **Slet** behind More, so that I cannot hit it by accident.
57. As a collector deleting a jersey, I want to see the jersey and what is removed with it, so that I know what I am doing.
58. As a collector, I want **Behold** as the quiet way out of delete, so that changing my mind is easy.

Accessibility
59. As a collector using a screen reader, I want each fact row to announce its label, value and that it can be changed, so that I can edit without seeing.
60. As a collector with large text, I want the facts and rows to grow without clipping the numeral, so that the screen stays readable.

## Implementation Decisions

Design tokens and type
- Add the `numeral` role to the mobile theme tokens (Saira Extra Condensed 700 at the four sizes the lock names) and load the face with the other fonts. The design-token checks must accept the new role. Line height equals size; the face clips if set tighter.
- **Number emblem** is a new shared component with `md` and `lg` sizes and three states (selected, rest, add). It is used in the player row and the player picker and nowhere else.
- Fact rows reuse the existing List row; no new row component.

Samling list
- The collection list module returns, per jersey, the number of **unanswered bids**, and the list is sortable and filterable by the client's remembered choice. Sorting and the three status views are computed on the client from the list the app already holds; the list is one page today and the lock defines no pagination. If the list is ever paged, sorting moves to the server and this decision is revisited.
- **Unanswered bid** means a bid message in a conversation about this jersey, from the other collector, that the owner has neither answered nor declined. The exact rule is taken from how Indbakke already marks a bid as pending; this spec does not invent a second definition.
- **Collection facts** are derived on the client from the same list: count of jerseys, count of distinct clubs plus national teams, and the start year of the earliest season. With an empty collection the block is hidden.
- View and sort are stored on the device with the other collector preferences, per account.
- A view combines with a shortcut: the shortcut narrows first, the view filters the result.

Own jersey detail
- The detail screen is rebuilt to the lock's composition. Tab bar is hidden on it.
- The detail needs two things it does not have today: the jersey's ordinal in the collection (by date added) and the unanswered bids with the latest two bidders' initials and the time of the latest. The ordinal is derived from the list. The bid summary is added to the owner's view of the jersey.
- The bid row opens the conversation. With bids from several collectors it opens Indbakke filtered to this jersey; with one it opens that thread.
- Editing uses the existing jersey update interface. Each edit sends the whole jersey with one fact changed; no new per-field endpoints. Edits are optimistic and roll back on failure with a toast.
- The update interface already checks that the player belongs to the club and season and that badges belong to the season. The client applies the same rule before sending: a season change drops the player unless he is in the new squad; a club change drops the player and any badge that no longer applies. The squad for the current club and season is already part of the jersey payload; a club or season change fetches the new squad through the existing catalog picker.
- The separate edit screen is removed.
- **Delete**: the existing delete removes the jersey, its photos and every conversation about it, for both collectors. The confirmation says exactly that. It must not say bids are "declined", because nothing is sent to the bidder. Whether a bidder should be told is a product decision that is out of scope here and flagged below.

Decisions taken from the conversation
- One badge on a tile: unanswered bids, or the lock. No "open for bids" badge.
- No bid amount anywhere on Samling or on own jersey detail.
- No share action until the public web layer exists.
- The bid row is a quiet `fill.secondary` row with initials, not a `fill.primary` box.

## Testing Decisions

A good test here exercises what a collector or a client can observe: the response of a request, or what a screen shows for a given list. It does not assert on private helpers or on how the list was sorted internally.

Seams (confirmed by Nicklas, 2026-10-10)
- **API, the HTTP boundary of the collection module** (existing). The unanswered-bid count on the list, the bid summary on the owner's view, and delete removing conversations are tested through real requests against the test database, as the existing collection and conversation suites do.
- **Mobile, the pure view-model of Samling** (new, one module): given a list of jerseys, a shortcut, a view and a sort, it returns the facts, the groups and the tiles to render. All sorting, filtering, grouping and tile-caption rules are tested here without rendering.
- **Mobile, the pure edit rules of a jersey** (new, one module): given a jersey and an edit, it returns the jersey to send and what was reset. Season-keeps-player-if-in-squad and club-resets-player-and-badge are tested here.
- **Device flows** (existing, Maestro): the `collection` flow is rewritten for the new screens, and gains steps for changing type, changing club with the confirmation, and opening the bid row. Fixed test data gains one jersey with an unanswered bid and one private jersey.

Prior art: the collection, conversations and shortcuts suites in the API tests; the existing unit tests of screen logic in the mobile app; the five device flows and their before/after evidence.

Not tested: pixel layout beyond the device-flow screenshots; the font file itself.

## Out of Scope

- Another collector's jersey detail (a different pattern in the lock).
- Empty collection (covered by First session 1.0).
- The Genveje sheet behind **Tilpas**, which is unchanged.
- Server-side sorting and pagination of the collection.
- A share action and the public web layer.
- Free name and number on the back.
- A Note row on own jersey detail (dropped from 1.0 by Nicklas, 2026-10-10).
- Telling a bidder that a jersey they bid on was deleted.
- Dark mode for the new screens.
- The numeral face anywhere other than the three places the lock names, including Confirm in Add jersey.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **Samling 1.0** — complete when a collector on staging sees the facts block, can view and sort, sees bids and the lock on tiles, opens an own jersey in the new composition, changes every fact from its own row, and deletes from More; device flows are green with before/after evidence.

## Further Notes

Gaps to settle before or during tickets:
- **Delete and bids.** `CONTEXT.md` does not define what happens to open bids on delete; the code removes the conversations silently. The Paper artboard `Egen trøje / 09` says the bids are declined and must be reworded.
- **Empty result of a view**, and whether the facts block shows with one or two jerseys: not in the lock.
- **Heading weight.** Paper sets headings at 700; the lock says 600. The lock wins.
- **"Klubber"** counts national teams too. If that reads wrong, the label becomes **Hold**.
- The Hooked review (2026-10-08) scored variable reward 1 of 2 because nothing new appears on return. The tile badge and the bid row are this spec's answer; they do not replace push (KIT-137).

Dependencies: KIT-279 (Confirm on one screen) shares the size, condition and type choosers; whichever lands second reuses the first's sheets.
