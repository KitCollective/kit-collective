# Ønsker & KitCollective+ 1.0

## Problem Statement

Ønsker is the reason to pay for KitCollective+ and the reason to come back, and today it does neither job:

- The Nest-trial starts when a Collector opens the tab. A curious tap spends the trial before the Collector has a wish or has seen a Match.
- The paywall says one sentence with an internal name in it, shows prices as "…", and offers two equal buttons called Månedlig and Årlig. It names no benefit, no trial and no saving.
- The empty tab speaks system language ("Tilføj en ønskerække…") and does not say that the Collector gets told when the jersey turns up.
- A Match is nearly invisible: a wish is two lines of text with a pencil and a bin, and a Match is a grey row background. A wish remembers only one Match.
- A wish can only be created from the tab, never from the jersey or Kit the Collector is looking at in Søg.

## Solution

Ønsker and the paywall follow `docs/design-system.md` → **Ønsker** and **KitCollective+ paywall** (Revision 2026-10-10) and Paper page *07 Ønsker & KitCollective+*.

- **Without Plus the tab sells itself**: one headline, one line, an example wish with Matches, one button. No Sheet opens until the Collector asks.
- **The trial starts only on Start gratis prøve.** The paywall's trial body shows a three-line timeline and promises that nothing is charged; it asks for no plan.
- **The buy body** shows two plans with the yearly one preselected, its saving and price per month, and one button.
- **With Plus each wish shows its Matches** as jersey thumbs with the owner's Handle and a count of unseen ones; the tab badge counts unseen Matches.
- **Nyt ønske is one screen** and shows how many jerseys match right now before saving.
- **When Plus lapses** a card in the list says so and offers the way back; wishes stay and can be deleted.
- **Ønsk denne** turns a dead end in Søg into a prefilled wish.

## User Stories

Without Plus
1. As a Collector without Plus, I want the Ønsker tab to say in one line what it does, so that I understand it without reading a manual.
2. As a Collector without Plus, I want to see an example wish with Matches, so that I know what I would get.
3. As a Collector without Plus, I want the example marked as an example, so that I do not think it is mine.
4. As a Collector who has not used the trial, I want one button that says how many days I can try for free, so that I know the offer before I tap.
5. As a Collector, I want the monthly price under the button, so that I know what it costs afterwards.
6. As a Collector, I want opening the tab to start nothing, so that I do not spend my trial by looking.
7. As a Collector who has used the trial, I want the button to say Fortsæt med Plus, so that I am not offered a trial I cannot have.

Paywall, trial
8. As a Collector, I want the paywall to name what Plus gives me in two short lines, so that I can decide quickly.
9. As a Collector, I want a timeline of today, the reminder and the end of the trial, so that I know what happens when.
10. As a Collector, I want to be told that nothing is charged automatically, so that I dare start.
11. As a Collector, I want one button, Start gratis prøve, so that there is no doubt what I am doing.
12. As a Collector, I want not to choose a plan before the trial, so that I am not asked about payment for something free.
13. As a Collector who started the trial, I want to land in Ønsker ready to add my first wish, so that I use the trial at once.
14. As a Collector, I want to close the paywall and be where I was, so that looking costs nothing.

Paywall, buy
15. As a Collector whose trial is over, I want to see a yearly and a monthly plan, so that I can choose.
16. As a Collector, I want the yearly plan preselected with its saving and its price per month, so that I can compare it with the monthly price.
17. As a Collector, I want the prices shown as the store charges them in my currency, so that there is no surprise.
18. As a Collector, I want a placeholder while prices load, never "…", so that the screen does not look broken.
19. As a Collector, I want one button that names the plan I picked, so that I confirm the right one.
20. As a Collector, I want Gendan køb, so that I get Plus back on a new phone.
21. As a Collector, I want links to terms and privacy, so that I can read them before I pay.
22. As a Collector, I want a clear message when a purchase fails or is cancelled, so that I know I was not charged.
23. As a Collector who bought Plus, I want the Sheet to close and my wishes to work at once, so that I see what I paid for.

Wishes with Plus
24. As a Collector with Plus, I want an add button in the header, so that I can create a wish from anywhere in the list.
25. As a Collector, I want each wish to show club or national team and season as its name, so that I recognise it.
26. As a Collector, I want type and size under the name, with "Alle" where I left a facet open, so that I see what the wish covers.
27. As a Collector, I want each wish to show its Matches as jersey photos, so that I see the reward without opening anything.
28. As a Collector, I want the owner's Handle under each Match, so that I know whose jersey it is.
29. As a Collector, I want a Match to open that jersey, so that I can bid.
30. As a Collector, I want a count of new Matches on the wish, so that I know which wishes have news.
31. As a Collector, I want the count to go quiet once I have seen them, so that "new" means new.
32. As a Collector, I want a wish without Matches to say Ingen endnu, so that I know it is working and has found nothing.
33. As a Collector, I want all Matches of a wish kept, not only the latest, so that I can compare copies.
34. As a Collector, I want a Match to disappear when the jersey is closed for bids, made private, deleted or its owner is blocked, so that I am not sent to a dead end.
35. As a Collector, I want the Ønsker tab badge to count new Matches, so that I notice them from anywhere in the app.
36. As a Collector, I want to edit a wish from its menu, so that I can widen or narrow it.
37. As a Collector, I want to delete a wish from its menu and be asked first, so that I do not lose one by accident.
38. As a Collector with Plus and no wishes, I want one button, Nyt ønske, so that I know where to start.
39. As a Collector, I want my own jerseys never to match my wishes, so that Matches are always someone else's.

Nyt ønske
40. As a Collector, I want to set club or national team, season, type and size on one screen, so that creating a wish takes seconds.
41. As a Collector, I want club and season to open the same picker as elsewhere, so that I do not learn a new one.
42. As a Collector, I want type and size as chips with Alle first, so that leaving a facet open is one tap.
43. As a Collector, I want to see how many jerseys match right now as I choose, so that I know whether the wish is too narrow.
44. As a Collector, I want to see up to two of those jerseys as thumbs, so that the count feels real.
45. As a Collector, I want Gem ønske disabled until I have set a club, national team, season or type, so that I cannot save an empty wish.
46. As a Collector, I want to be asked for push permission after I save my first wish, so that I am told when a Match arrives.
47. As a Collector who edits a wish, I want its Matches recalculated, so that the row shows what the new wish finds.

Lapse
48. As a Collector whose Plus has ended, I want a card at the top of Ønsker saying so, so that I understand why nothing new arrives.
49. As a Collector, I want that card to offer Fortsæt, so that I can get Plus back in one tap.
50. As a Collector, I want my wishes still listed, so that I see what I would get back.
51. As a Collector, I want to delete wishes while lapsed, so that I can tidy up.
52. As a Collector, I want not to be able to add or edit while lapsed, so that it is clear what Plus gives.
53. As a Collector whose trial ended, I want the same lapsed view, so that trial and paid end alike.

Ønsk denne
54. As a Collector on a Kit drill where no copy is åben for bud, I want to see how many Collectors have it, so that I know it exists.
55. As a Collector, I want Ønsk denne there, so that I am told when one of them opens for bids.
56. As a Collector, I want it to open Nyt ønske with the Kit's facets filled in, so that I only confirm.
57. As a Collector without Plus, I want Ønsk denne to show the paywall first and then continue to the wish, so that I do not lose my place.
58. As a Collector whose search finds only closed jerseys, I want the same card, so that the search does not end in nothing.

Quality
59. As a Collector using a screen reader, I want each wish announced with its facets and its number of new Matches, and each Match with jersey and owner, so that I can use Ønsker without seeing it.
60. As Nicklas, I want the Ønske and paywall Device flow to walk the new screens with a screenshot at each step, so that I can review the change before and after.

## Implementation Decisions

- **The lock is the visual source**: Ønsker and KitCollective+ paywall (Revision 2026-10-10). Where Paper and the lock disagree, the lock wins; gaps are flagged.
- **Trial start.** The existing request that starts the Nest-trial is called only from Start gratis prøve. Every implicit start (opening the tab, tapping add) is removed on the client, and nothing on the server starts a trial as a side effect of another request.
- **Access states** the client works from: `none-trial-available`, `none-trial-used`, `live`, `lapsed`. `lapsed` means the Collector has had an Entitlement (trial or paid) that expired; it is derived from the Entitlement the server already returns.
- **Matches become many per wish.** A Match is its own record: Wishlist row, UserJersey, when it was found, and whether the Collector has seen it. The single matched-jersey field on a wish is replaced. The match job adds a record when a jersey starts satisfying a wish and removes it when it stops (closed for bids, private, deleted, owner blocked in either direction, wish edited).
- **Wishlist response** returns, per wish, its facets with labels, its Matches (jersey id, thumb, owner Handle, found time, seen) newest first, and the unseen count; plus the total unseen count. A capped number of Matches is returned per wish with the total alongside.
- **Seen.** Fetching the list marks the returned Matches as seen after the response is built, so the response still carries the unseen state it had on arrival. The tab badge reads the total unseen count from a light request that marks nothing.
- **Live count.** A new read-only request takes wish facets and returns how many non-private, åben-for-bud jerseys of other Collectors match now, with up to two thumbs. It needs a live Entitlement and uses the same matching rule as the job.
- **Lapse rules** are unchanged on the server (view and delete allowed; create and edit refused; job and push stop) and are now shown as the lock describes.
- **Paywall view-model** (new, pure, mobile, together with the Ønsker view-model): from access state, Offer (trial on, trial days) and store prices it returns which body to show, the timeline days, the saving of yearly against twelve months of monthly rounded down to a whole per cent, the price per month of the yearly plan, the button label, and placeholders while prices load.
- **Ønsker view-model** (same module): from access state and the wishlist response it returns which page the tab shows and the rows: name, facet line with Alle where open, unseen pill or seen count, thumbs.
- **Nyt ønske** is a stack screen with the Tab bar hidden, replacing the form mode inside the list screen. Edit uses the same screen.
- **Ønsk denne** lives on the Kit drill when the drill has copies and none is åben for bud, and on a search result whose jerseys are all closed. It passes the facets to Nyt ønske; without a live Entitlement it opens the paywall first and continues to Nyt ønske when the Collector becomes entitled.
- **Kit drill response** gains whether any copy is åben for bud and how many Collectors hold the Kit.
- **Copy** never uses internal names (Vision Matcher). The second benefit reads Ubegrænset fotogenkendelse.
- **Unchanged:** the Wishlist facets and their AND rule, the match rule itself, the push prompt after the first saved wish, Offer in Admin, IAP verify and restore, Comp.

## Testing Decisions

A good test here exercises what a Collector or a client can observe: the response of a request, or what a screen would show for a given state. It does not assert on the match job's internals.

Seams (confirmed by Nicklas, 2026-10-10)
- **API, the HTTP boundary of wishlist and billing** (existing). With real requests against the test database: a wish returns all its Matches and its unseen count; Matches come and go as jerseys open, close, go private, are deleted or blocked; fetching the list marks Matches seen and the badge count follows; the live count matches what the job would find; a trial starts only from the trial request and from no other; a lapsed Collector can list and delete but not create or edit.
- **Mobile, the pure view-model of Ønsker and the paywall** (new, one module): which page the tab shows per access state; row content; which paywall body with which numbers and labels.
- **Device flows** (existing, Maestro): the `wishlist-paywall` flow is rewritten: the tab without Plus, the trial paywall, starting the trial, Nyt ønske with the live count, the list with a Match, and Ønsk denne from a Kit drill. Fixed test data gains a Kit with a closed copy and a wish with a Match for the second test Collector.

Prior art: the wishlist, wishlist-match, entitlement and entitlement-gate suites in the API tests; the paywall offer and store billing unit tests in the mobile app; the existing `wishlist-paywall` Device flow.

Not tested: the store's own purchase sheet; pixel layout beyond the Device flow screenshots.

## Out of Scope

- The reminder the day before the trial ends, and Match push itself (KIT-137). The timeline names the reminder; sending it comes with push.
- A free wish, or any Ønsker function without Plus (decided 2026-10-10: everything stays behind Plus).
- Suggestions from the Collector's own Samling, and a first wish after the first saved jersey (the open decision in Notion).
- Ønsk denne on a foreign UserJersey detail.
- New Wishlist facets (player, condition, maximum price).
- Changing prices, products or the trial length (Offer and the stores).
- A paywall for Vision quota in Tilføj trøje beyond reusing this Sheet.
- Dark mode.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **Ønsker & KitCollective+ 1.0** — complete when on staging a Collector without Plus sees the tab sell itself and nothing starts by opening it; the trial starts only from the paywall button; the buy paywall shows two plans with yearly preselected and real store prices; a Collector with Plus creates a wish on one screen with a live count, sees all Matches as thumbs with unseen counts and a tab badge; a lapsed Collector sees the lapse card and can still delete; Ønsk denne creates a prefilled wish from a Kit drill; the Device flow is green with before/after evidence.

## Further Notes

Gaps the lock leaves open (flag, do not invent): many Matches on one wish beyond the cap; purchase in progress, failed and restored states; the store being unavailable; loading and offline; dark mode.

Numbers: the trial is 3 days at launch (Offer). The yearly price is not decided; the Paper artboard's 249 kr. is an example.

Dependencies: KIT-286 (shared Jersey tile) and KIT-290 (foreign UserJersey detail a Match opens). Ønsk denne touches the Kit drill, which Søg & Send bud 1.0 leaves as it is.
