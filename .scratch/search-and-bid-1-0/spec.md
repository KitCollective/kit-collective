# Søg & Send bud 1.0

## Problem Statement

A Collector who opens Søg today can find another Collector's UserJersey, but the path to a Bud is weak at every step:

- The typeahead is cut into up to six sections with a heading each, so one short query fills the screen with headings before hits.
- The foreign UserJersey detail shows the photo, the club and the season and nothing else. Size, condition, badge and player are missing, so the Collector bids without knowing what the copy is.
- Send bud spends most of the screen on a photo the Collector has just seen, the amount field is small, and the Tab bar lies over the button.
- After sending, the app steps back and the jersey still says **Send bud**. Nothing tells the Collector the Bud went through, and nothing stops a second one.
- The server sends every viewer the latest amount another Collector bid on the jersey.

## Solution

Søg becomes the shortest path from the tab to a Bud, following `docs/design-system.md` → **Søg home and typeahead**, **Foreign UserJersey detail** and **Send bid** (Revision 2026-10-10) and Paper page *05 Søg & Send bud*.

- **Søg home** starts with the search field, then three shelves: Åbne for bud, Klubber og landshold, Samlere.
- **Typeahead** is one flat list where the kind is a caption under the name, with the matching UserJerseys in the Samling tile grid under it.
- **Foreign UserJersey detail** is the same 4:5 scrolling column as the own detail: photo, title and season, player, facts, and the owner last. The dock at the bottom shows **Send bud**, or the Collector's own pending Bud, or nothing when the jersey is not åben for bud.
- **Send bud** shows a small jersey summary with the facts that set the price, one large amount with the number pad open, and a button that carries the amount.
- **After sending**, a Toast confirms once and the dock shows **Dit bud · amount · Afventer svar**, which opens the thread. A Collector has at most one pending Bud per UserJersey.
- No Collector sees another Collector's amount outside a thread they are part of.

## User Stories

Søg home
1. As a Collector, I want the search field to be the first thing on Søg, so that I can start typing without scrolling.
2. As a Collector, I want a placeholder that says what I can search for (club, player or collector), so that I know the field is not only for clubs.
3. As a Collector, I want a shelf of jerseys that are åben for bud, so that I see what I can actually bid on.
4. As a Collector, I want each tile on that shelf to show club, season, type and the owner's size, so that I can skip copies that do not fit me.
5. As a Collector, I want to open **Se alle** from that shelf, so that I can browse every jersey that is åben for bud.
6. As a Collector, I want a row of clubs and national teams as chips, most collected first, so that I can jump to a popular side in one tap.
7. As a Collector, I want a chip to open that side's catalog drill, so that I see every non-private copy of it.
8. As a Collector, I want a shelf of collectors with Handle, number of jerseys and how many are åben for bud, so that I can pick whose collection to look at.
9. As a Collector, I want a collector row to open Peer Profil, so that I see their whole collection.
10. As a Collector, I want my own jerseys left out of Søg, so that I do not browse what I already own.
11. As a Collector, I want private jerseys and blocked collectors left out of every shelf, so that Søg never shows what I must not see.
12. As a Collector, I want the Tab bar visible on Søg home, so that I can move to the other places.
13. As a Collector with no shelves to show, I want an Empty state that says so, so that an empty Søg does not look broken.

Typeahead
14. As a Collector, I want hits from the first character I type, so that I do not have to submit.
15. As a Collector, I want Back in the field while I type, so that I return to Søg home in one tap.
16. As a Collector, I want a clear control in the field, so that I can start a new query without deleting letter by letter.
17. As a Collector, I want all hits in one list, so that I read names instead of headings.
18. As a Collector, I want each hit to say what it is under its name (Klub, Landshold, Spiller, Kit, Samler), so that I do not confuse a club with a collector of the same name.
19. As a Collector, I want a club or national team hit to show its initials, so that I recognise the kind at a glance.
20. As a Collector, I want a player hit to show his shirt number in a Number emblem, so that players stand out from clubs.
21. As a Collector, I want a kit hit to show a small jersey photo, so that I can tell designs apart.
22. As a Collector, I want a collector hit to show a round Avatar, so that people look different from catalog entries.
23. As a Collector, I want each catalog hit to say how many jerseys it has, so that I do not open an empty drill.
24. As a Collector, I want the matching UserJerseys under the hits, in the same tile as Samling, so that I can go straight to a copy.
25. As a Collector, I want the number of matching jerseys beside the **Trøjer** heading, so that I know how much there is.
26. As a Collector, I want a hit to open its drill, Peer Profil or jersey detail, so that every row leads somewhere.
27. As a Collector, I want a clear message when nothing matches, so that I know to change the query.
28. As a Collector, I want no bid badge and no amount on tiles in Søg, so that Søg does not look like a shop.

Foreign UserJersey detail
29. As a Collector, I want the jersey photo in 4:5 across the full width, so that I see the copy properly.
30. As a Collector, I want to swipe between the photos and see a count, so that I know there are more.
31. As a Collector, I want the club and the season as the largest text, so that I know which shirt this is.
32. As a Collector, I want the type, and whether the jersey is åben for bud, in the line above the club, so that I know at once if I can bid.
33. As a Collector, I want the player and number on the back shown as its own row, so that I see the print without reading the photo.
34. As a Collector, I want size, condition and badge as fact rows, so that I can judge what the copy is worth to me.
35. As a Collector, I want facts the owner has not set to be left out, so that I am not shown empty rows.
36. As a Collector, I want nothing on this screen to look editable, so that I do not try to change someone else's jersey.
37. As a Collector, I want the owner last, under the facts, with Handle, city and number of jerseys, so that the jersey comes first and the person second.
38. As a Collector, I want the owner row to open Peer Profil, so that I can see what else they have.
39. As a Collector, I want the owner's city shown only as their Vis by setting allows, so that nobody's location is shown against their choice.
40. As a Collector, I want to mark the jersey as a Favorit from the photo, so that I can find it again.
41. As a Collector, I want Rapportér and Blokér behind More, so that I can act on a bad listing without a thread.
42. As a Collector, I want **Send bud** fixed at the bottom while I scroll, so that the one action is always in reach.
43. As a Collector, I want no button when the jersey is not åben for bud, so that I am not offered something the owner turned off.
44. As a Collector, I want the Tab bar hidden on this screen, so that nothing covers the button.
45. As a Collector, I want a private or blocked jersey to read as not found, so that I learn nothing about it.

Send bud
46. As a Collector, I want a small summary of the jersey (photo, club, season, type, size, condition, player, owner), so that I am sure what I am bidding on.
47. As a Collector, I want the number pad open when the screen opens, so that I can type the amount at once.
48. As a Collector, I want the amount as the largest thing on the screen, so that I see exactly what I am about to send.
49. As a Collector, I want to enter whole kroner only, so that I cannot send an amount the product does not handle.
50. As a Collector, I want the button to repeat my amount (**Send bud på 250 kr**), so that I confirm the number, not just the action.
51. As a Collector, I want the button disabled until I have entered an amount above zero, so that I cannot send an empty Bud.
52. As a Collector, I want a line saying the owner gets my Bud in Indbakke and that this is not a purchase, so that I know no money moves.
53. As a Collector, I want no other Collector's amount shown, so that bids stay between the two of us.
54. As a Collector, I want the Tab bar hidden here too, so that the button sits right above the number pad.
55. As a Collector, I want Back to return to the jersey without sending, so that I can change my mind.
56. As a Collector, I want a clear message if the send fails, with my amount kept, so that I can try again.

After sending
57. As a Collector, I want to land back on the jersey after sending, so that I see where my Bud belongs.
58. As a Collector, I want a Toast that says my Bud was sent to the owner, once, so that I know it went through.
59. As a Collector, I want the button replaced by **Dit bud**, my amount and **Afventer svar**, so that the screen remembers what I did.
60. As a Collector, I want that row to open the thread, so that I can follow the answer.
61. As a Collector, I want that row whenever I open the jersey again while my Bud is pending, so that I am never invited to bid twice.
62. As a Collector, I want the server to refuse a second Bud while my first is pending, so that the rule holds on every client.
63. As a Collector whose Bud was declined, I want **Send bud** back, so that I can make a new offer.
64. As an owner, I want at most one pending Bud per Collector on each jersey, so that my Indbakke is not filled with repeats.
65. As an owner, I want other Collectors not to see the amounts I receive, so that bids on my jersey stay private.

Quality
66. As a Collector using a screen reader, I want every hit, row and button named with its content, so that I can search and bid without seeing the screen.
67. As Nicklas, I want the Søg and bud Device flow to walk the new screens with a screenshot at each step, so that I can review the change before and after.

## Implementation Decisions

- **The lock is the visual source.** The three patterns named above, plus Search field `discover` and the bid amount size under Typography. Paper page *05 Søg & Send bud* is the drawing; where they disagree the lock wins and the gap is flagged.
- **Foreign UserJersey detail is rebuilt as the own detail's column.** It reuses the photo stage, title block, player row and fact rows built for Samling 1.0 in read-only form. The immersive stage with a bottom sheet is removed. `CONTEXT.md` → UserJersey detail already says so.
- **Peer jersey response grows.** It gains size, condition, badge label, player name and number, the owner's city (already filtered by Vis by), the owner's count of non-private jerseys, and `myPendingBid` (`{ amountDkk, conversationId }` or null) for the requesting Collector. It loses `latestBidAmountDkk`.
- **One pending Bud per Collector per UserJersey, enforced on the server.** Sending a Bud while the sender has a pending Bud on that jersey is refused with a conflict. Accepted or declined Buds do not block a new one. The rule lives where a Bud is created; no schema change is expected, since pending status is already on the bid message.
- **Send bud response** carries what the client needs to show the own bid row and open the thread (amount and conversation id) without a second request.
- **Søg home response** gains, per collector, the number of non-private jerseys and how many are åben for bud; the clubs and national teams are ordered by number of non-private copies. The shelf of jerseys åben for bud carries the owner's size.
- **Typeahead response** gains a jersey count per club, national team, player and kit hit and per collector, a shirt number for a player hit when one is known, and a photo for a kit hit taken from a matching non-private UserJersey (never archive bytes). Jersey hits carry the owner's size.
- **Hit order** in the flat list: clubs and national teams, players, kits, collectors; inside a kind, by jersey count. The order is decided in the mobile view-model, not on the server.
- **Se alle** opens the existing list of discoverable jerseys filtered to åben for bud.
- **Søg view-model** (new, pure, mobile): turns the home response into shelves and the typeahead response into the flat hit list (name, caption, leading slot, target) plus the jersey tiles.
- **Bid rules** (new, pure, mobile): turn typed text into a whole-krone amount, the button label and its enabled state; and turn a peer jersey into the dock state (`send`, `own-pending`, `none`).
- **Navigation.** Foreign detail and Send bud hide the Tab bar. After a successful send the client returns to the foreign detail with the Toast and the own bid row, not a blind step back.
- **Send bud** drops the large photo and the last-bid helper. The amount is a hidden-chrome numeric input styled as the lock describes; whole kroner, no decimals, no leading zero.
- **Unchanged:** catalog drills, Peer Profil, Favorit, Rapportér and Blokér, Entitlement (Søg and Send bud stay free), and the thread itself.

## Testing Decisions

A good test here exercises what a Collector or a client can observe: the response of a request, or what a screen would show for a given response. It does not assert on private helpers or on query internals.

Seams (confirmed by Nicklas, 2026-10-10)
- **API, the HTTP boundary of the collection module** (existing). Tested with real requests against the test database: the peer jersey response carries the new facts and `myPendingBid` and no other Collector's amount; a second Bud while one is pending is refused and a new Bud after a decline is accepted; Søg home and typeahead return the counts and order described above; private and blocked rows stay out.
- **Mobile, the pure view-model of Søg** (new, one module): given a home or typeahead response, it returns the shelves, the flat hit list with captions and leading slots, and the tiles.
- **Mobile, the pure bid rules** (new, one module): amount parsing, button label and state, and the dock state for a peer jersey.
- **Device flows** (existing, Maestro): the `search-bid` flow is rewritten for the new screens and gains steps for the own bid row after sending and for a jersey that is not åben for bud. Fixed test data gains one foreign jersey with size, condition, badge and player, and one that is not åben for bud.

Prior art: the collection and conversations suites in the API tests; the existing unit tests of screen logic in the mobile app (for example the national-team catalog drill test); the five Device flows and their before/after Evidence run.

Not tested: pixel layout beyond the Device flow screenshots.

## Out of Scope

- Any action on a jersey that is not åben for bud other than Favorit (decided 2026-10-10).
- Bidding again while a Bud is pending, counter-offers, and editing or withdrawing a Bud.
- Showing other Collectors' amounts anywhere outside a thread.
- Recent searches, search filters, and League or Season landings.
- Redesign of the catalog drills and Peer Profil beyond what the shared tile gives them.
- Indbakke, the thread and the Bid card (Paper page 06).
- Push for a new Bud (KIT-137), payment, shipping.
- Dark mode.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **Søg & Send bud 1.0** — complete when a Collector on staging searches from the new Søg home, finds a jersey through the flat typeahead, reads its facts and owner on the new foreign detail, sends a Bud from the new Send bud screen, sees the own bid row afterwards and cannot bid twice; no other Collector's amount is sent to the client; the Søg and bud Device flow is green with before/after evidence.

## Further Notes

Gaps the lock leaves open (flag, do not invent): the dock after a Bud is accepted or declined beyond "Send bud returns after a decline"; a failed send beyond keeping the amount; an upper limit on the amount; no-hit and loading states of typeahead; dark mode.

Dependencies
- **KIT-285** (numeral face and Number emblem) is needed by the title block, the player row and the player hit.
- **KIT-287** (own jersey detail) builds the photo stage, title block, player row and fact rows this spec reuses read-only. Whichever lands second reuses the first's parts.
- **KIT-286** (Samling) owns the shared Jersey tile with the owner's size.
