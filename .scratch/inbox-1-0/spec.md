# Indbakke 1.0

## Problem Statement

A Collector's Indbakke today is hard to act on and hard to read:

- Two tabs, Beskeder and Aktivitet, show the same Conversations twice. The Collector has to work out where a Bud is waiting.
- A Conversation is tied to one UserJersey, so two Collectors who trade more than once get a new thread for every jersey, and there is no way to write to another Collector without bidding.
- Rows show an initial and a Handle. Nothing shows which jersey a Bud is about until the thread is open, and even there it is one optional line of text.
- Accepting a Bud changes a status label and nothing else. Neither side is told what happens next, the jersey stays åben for bud, and other Buds on it stay pending.
- A declined Bud is a dead end; the bidder must find the jersey again through Søg to try a new amount.
- Blokér and Slet samtale run the moment they are tapped.
- Deleting a UserJersey silently deletes every Conversation about it.

## Solution

Indbakke follows `docs/design-system.md` → **Inbox** and **Conversation** (Revision 2026-10-10) and Paper page *06 Indbakke*, artboards *01*–*07*.

- **One list.** **Venter på dit svar** first, with one row per incoming pending Bud showing the jersey; then **Samtaler**, one row per Collector.
- **One Conversation per pair of Collectors.** It holds every message and every Bud between them. Each Bud card carries its own jersey.
- **Messages without a Bud.** A Collector can write from a foreign UserJersey detail and from Peer Profil.
- **Accepting means something.** The jersey stops being åben for bud, other pending Buds on it are declined, and both sides get a line saying payment and delivery are agreed in the thread.
- **A declined Bud offers the next step.** The bidder gets **Send nyt bud** on the card.
- **More is a Sheet**, with the profile, Rapportér, Blokér and Slet samtale; the last two ask first.
- **A deleted jersey leaves the Conversation standing.**

Handel (the guided steps after an accepted Bud) is designed but not part of this spec.

## User Stories

Indbakke list
1. As a Collector, I want one list in Indbakke, so that I do not check two tabs for the same thing.
2. As an owner, I want incoming Buds I have not answered at the top under **Venter på dit svar**, so that I see what needs me first.
3. As an owner, I want each of those rows to show the jersey photo, so that I know which jersey the Bud is about before I open it.
4. As an owner, I want the bidder's Handle, the jersey's club, season and type, and the amount on the row, so that I can judge the Bud at a glance.
5. As an owner, I want the count of waiting Buds beside the heading, so that I know how many there are.
6. As a Collector with nothing waiting, I want that section to be absent, so that I am not shown an empty heading.
7. As a Collector, I want **Samtaler** to list the people I talk to, one row each, newest first, so that I find a person, not a jersey.
8. As a Collector, I want each of those rows to show the person's Avatar or initial, their Handle and the latest message, so that I recognise the thread.
9. As a Collector, I want a Bud as the latest event to read as a sentence (**Dit bud på 400 kr · Afventer svar**), so that I know the state without opening.
10. As a Collector, I want unread rows marked with a dot and a heavier snippet, so that I can tell new from read without relying on colour.
11. As a Collector, I want the Indbakke tab badge to count unread Conversations, so that I know there is something new from anywhere in the app.
12. As a Collector, I want the time of the latest event on each row, so that I know how old it is.
13. As a Collector, I want a row under **Venter på dit svar** to open the thread at that Bud, so that I can answer at once.
14. As a new Collector, I want an empty Indbakke to say that a Conversation starts with a Bud or a message, so that I understand why it is empty.
15. As a new Collector, I want **Find trøjer** and **Åbn for bud** on the empty Indbakke, so that I can start one.
16. As a Collector, I want blocked Collectors and Conversations I deleted left out, so that I do not see what I removed.

Conversation
17. As a Collector, I want one thread with each Collector, so that everything between us is in one place.
18. As a Collector, I want the header to show who I am talking to, so that I never write to the wrong person.
19. As a Collector, I want their messages on the left and mine on the right, so that I can follow who said what.
20. As a Collector, I want dates between days of messages, so that I can place them in time.
21. As a Collector, I want to send text and a photo, so that I can ask for and show details of a jersey.
22. As a Collector, I want the thread to open at the newest message, so that I do not scroll through history.
23. As a Collector, I want opening a thread to mark it read, so that the badge and the dot go away.
24. As a Collector, I want a clear message when a send fails, so that I know to try again.
25. As a Collector, I want the Tab bar hidden in a thread, so that the composer sits at the bottom.

Bud in the thread
26. As a Collector, I want each Bud as a card with the jersey's photo, club, season, type and size on it, so that Buds on different jerseys in one thread cannot be confused.
27. As a Collector, I want the jersey row on the card to open that jersey, so that I can look at it again.
28. As a Collector, I want the amount as the largest thing on the card, so that I read the offer first.
29. As an owner, I want **Accepter** and **Afvis** on an incoming pending Bud, so that I can answer in one tap.
30. As a bidder, I want my pending Bud to say **Afventer svar** with no buttons, so that I know it is the owner's turn.
31. As a Collector, I want an answered Bud to show **Accepteret** or **Afvist** instead of buttons, so that the outcome stays in the thread.
32. As a bidder whose Bud was declined, I want **Send nyt bud** on that card, so that I can make a new offer without finding the jersey again.
33. As a bidder, I want **Send nyt bud** to open Send bud for that jersey, so that the new Bud lands in the same thread.
34. As a bidder, I want **Send nyt bud** absent when the jersey is no longer åben for bud, so that I am not sent to a dead end.
35. As a Collector, I want a card whose jersey was deleted or made private to say so and not open, so that the thread still makes sense.

Accepting
36. As an owner, I want accepting a Bud to turn åben for bud off on that jersey, so that I do not get more Buds on a jersey I have promised away.
37. As an owner, I want other pending Buds on that jersey declined for me, so that I do not answer each one by hand.
38. As a bidder whose Bud was declined that way, I want a line saying the jersey went to another Collector, so that I know it was not about my amount.
39. As an owner, I want a line after accepting that says payment and delivery are agreed with the bidder in the thread, so that I know what to do next.
40. As a bidder, I want the same line from my side when my Bud is accepted, so that I know to write to the owner.
41. As an owner, I want to turn åben for bud on again myself if the deal falls through, so that the jersey is not locked.
42. As a bidder, I want to be told in Indbakke that my Bud was accepted or declined, so that I notice the answer.

Messages without a Bud
43. As a Collector, I want to write to the owner from a jersey that is åben for bud, so that I can ask a question before I bid.
44. As a Collector, I want to write to the owner from a jersey that is not åben for bud, so that I can show interest anyway.
45. As a Collector, I want to write to a Collector from their Peer Profil, so that I can talk to them about their collection.
46. As a Collector, I want all three to open the one thread I have with that Collector, so that I never get a second thread.
47. As a Collector writing to someone for the first time, I want to see their Avatar, Handle, city and number of jerseys at the top of the empty thread, so that I know who I am writing to.
48. As a Collector who came from a jersey, I want that jersey shown above the composer as **Om trøjen**, so that the owner knows which one I mean.
49. As a Collector, I want to dismiss that jersey reference, so that I can write about something else.
50. As an owner, I want a first message to show which jersey it is about, so that I do not have to ask.
51. As a Collector, I want the thread created only when I send, so that opening and leaving does not create an empty Conversation for either of us.
52. As a Collector, I want not to be able to write to someone who blocked me or whom I blocked, so that a block holds.

More
53. As a Collector, I want More to open a Sheet over the thread, so that I do not leave it for a separate screen.
54. As a Collector, I want the other Collector's profile row there, so that I can open their Peer Profil.
55. As a Collector, I want Rapportér there, so that I can report a bad thread.
56. As a Collector, I want Blokér to ask before it happens and to say that it hides the thread for both of us, so that I do not block by accident.
57. As a Collector, I want Slet samtale to ask before it happens and to say that it removes the thread only for me, so that I know what I lose.
58. As a Collector who deleted a thread, I want it back in my list when the other Collector writes again, so that I do not miss a new Bud.

Jerseys and threads
59. As an owner, I want deleting a jersey to leave my Conversations in place, so that I keep what was said.
60. As an owner, I want deleting a jersey to decline its pending Buds, so that bidders are not left waiting.
61. As an owner, I want the delete confirmation to say that, so that I know what happens.
62. As a Collector with threads from before this change, I want them merged into one per Collector with nothing lost, so that my history is intact.

Quality
63. As a Collector using a screen reader, I want every row, card and button named with its content and state, so that I can use Indbakke without seeing it.
64. As a Collector on a wide screen, I want the list beside the open thread, so that I can move between threads.
65. As Nicklas, I want an Indbakke Device flow with a screenshot at each step, so that I can review the change before and after.

## Implementation Decisions

- **The lock is the visual source**: Inbox, Conversation, Thread row, Bid card, Message composer (Revision 2026-10-10), and Foreign UserJersey detail for the two message entries. Where Paper and the lock disagree, the lock wins; gaps are flagged.
- **Conversation is per pair.** The Conversation no longer references a UserJersey; its uniqueness is the two Collectors. The UserJersey reference moves onto the message: required on a Bud, optional on an ordinary message (the jersey reference of a first message). The message keeps a snapshot of what the card shows (club or national team, season, type, size) so a card still reads after the jersey is deleted or made private; the photo and the link are dropped then.
- **Data migration.** Existing Conversations between the same two Collectors are merged into the oldest one: messages keep their time and sender, each Bud message gets its Conversation's former UserJersey, a participant's read time becomes the latest of the merged ones, a thread is hidden for a participant only if every merged thread was, and moderation reports follow the surviving Conversation. The migration is one step that can be run again without changing the result.
- **Indbakke response** is one request returning `waiting` (incoming pending Buds, each with jersey snapshot and thumb, bidder Handle, amount, time, Conversation id and message id) and `conversations` (one per peer: Handle, Avatar, latest event as kind plus the fields to render it, time, unread). The activity endpoint and the Beskeder/Aktivitet split are removed.
- **Starting a Conversation without a Bud.** Posting a message to a peer (by Collector id, with an optional UserJersey id) finds or creates the pair's Conversation and adds the message in one request. Refused when either Collector blocked the other, when the target is oneself, or when the referenced jersey is private or not the peer's.
- **Bud creation** finds or creates the pair's Conversation the same way. The rule of one pending Bud per Collector per UserJersey (Søg & Send bud 1.0) is unchanged.
- **Accepting a Bud**, in one transaction: marks the Bud accepted, turns åben for bud off on the UserJersey, declines every other pending Bud on it, and writes a system message into each affected Conversation. Declining a Bud changes only that Bud.
- **System message** is a new message kind with a fixed reason (`bid_accepted`, `jersey_gone`), rendered as a centred line. The text is composed on the client from the reason and the viewer's side.
- **Deleting a UserJersey** no longer deletes Conversations. Pending Buds on it are declined, and messages keep their snapshot.
- **Hidden Conversations** reappear for the participant when a new message or Bud arrives.
- **Indbakke and thread view-model** (new, pure, mobile): turns the Indbakke response into the two sections and their rows; turns a thread into a list of dates, bubbles, Bid cards and system lines; and decides for each Bid card what it shows (buttons, status, **Send nyt bud**, whether the jersey row opens).
- **More** is a Sheet; the Detaljer screen and its route are removed. Blokér and Slet samtale use Sheet `confirm`.
- **Entries.** The message Icon button and **Skriv til *handle*** on the foreign UserJersey detail, and **Skriv besked** on Peer Profil, all open the thread screen for that peer; with no Conversation yet it shows the thread start and creates the Conversation on send.
- **Removed:** Top tabs on Indbakke, Activity card, the Detaljer screen.
- **Unchanged:** Chat bubbles, photo messages, the unread model per participant, moderation rules, Entitlement (Indbakke stays free).

## Testing Decisions

A good test here exercises what a Collector or a client can observe: the response of a request, the rows left by the migration, or what a screen would show for a given response. It does not assert on private helpers.

Seams (confirmed by Nicklas, 2026-10-10)
- **API, the HTTP boundary of the collection module** (existing). With real requests against the test database: two Collectors have exactly one Conversation however many jerseys they bid on; a message without a Bud is accepted from a jersey and from a profile and refused across a block; the Indbakke response separates `waiting` from `conversations`; accepting closes the jersey, declines the other pending Buds and writes the system messages; deleting a jersey leaves the Conversation and declines its pending Buds; a hidden Conversation returns on a new message.
- **API, the data migration** (new, one seam): the migration is run against a database seeded with per-jersey Conversations, and the test checks one Conversation per pair, message order, read and hidden state, and the UserJersey on each Bud. Running it twice gives the same rows.
- **Mobile, the pure view-model of Indbakke and the thread** (new, one module): sections, row text and unread; the item list of a thread; the state of each Bid card.
- **Device flows** (Maestro): a sixth flow, `inbox`, from an incoming Bud over Accepter to a message without a Bud. Fixed test data gains an incoming pending Bud for the first test Collector. `CONTEXT.md` → Device flow is updated from five to six.

Prior art: the conversations, conversation-moderation and collection suites in the API tests; the existing unit tests of screen logic in the mobile app; the five Device flows and their Evidence run.

Not tested: pixel layout beyond the Device flow screenshots.

## Out of Scope

- **Handel**: the Deal card, addresses, payment method, receipts, tracking. Designed in the lock; own spec after consent, retention and deletion are settled.
- Push for a new Bud or message (KIT-137).
- Counter-offers, editing or withdrawing a Bud, more than one pending Bud per Collector per jersey.
- Group threads, reactions, read receipts shown to the other Collector, typing indicators.
- Message requests or limits on who may write first, beyond Blokér and Rapportér.
- Unread messages under **Venter på dit svar**.
- Redesign of Peer Profil beyond the **Skriv besked** entry (Paper page 08).
- Dark mode.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **Indbakke 1.0** — complete when on staging two Collectors share one Conversation across several jerseys; Indbakke shows Buds that wait first and people second; a Collector can write without a Bud from a jersey and from a profile; accepting closes the jersey for Buds and tells both sides what is next; More is a Sheet that asks before Blokér and Slet samtale; existing threads are merged with nothing lost; the Indbakke Device flow is green with before/after evidence.

## Further Notes

Corrections to issues already published
- **KIT-287** (own UserJersey detail): its delete confirmation must say that pending Buds are declined and Conversations are kept, not removed.
- **KIT-290** (foreign UserJersey detail): its dock gains the message Icon button, and **Skriv til *handle*** replaces the empty dock when the jersey is not åben for bud. Those two controls are built here, since they need the Conversation per pair; KIT-290 leaves room for them.
- **Samling 1.0 spec** says delete removes all Conversations; that line is superseded by this spec.

Gaps the lock leaves open (flag, do not invent): the system line after a plain decline; sending and failed states of a bubble; long lists and paging; dark mode.

Dependencies: KIT-290 and KIT-291 (Søg & Send bud 1.0) for the foreign detail and Send bud that **Send nyt bud** and the message entries build on.
