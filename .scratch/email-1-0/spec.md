# E-mail 1.0

## Problem Statement

A Collector only learns what happened in KitCollective by opening the app. A bid on their jersey, an answer to their own bid, a message, or a wished jersey turning up all wait silently until the next visit. The trial of KitCollective+ ends without a warning. Changes to the account (a new e-mail, a deleted account, a jersey taken down by an operator) leave no trace outside the app.

The one mail that exists today, the login code, is plain text with no brand and no design. No mail can actually be delivered: the sender adapter is empty. The server stores no notification choices, so the switches on the Notifikationer screen have nothing to save to, and nothing on the server can run at a set time.

## Solution

KitCollective sends twelve transactional mails on one template, as locked in `docs/design-system.md` → Transactional e-mail: a soft top with a curved edge and a tactical board, a short body built from a fixed set of parts, at most one button, and a footer that says why the mail was sent. Each mail tells the Collector one thing and takes them to exactly that place in the app.

Bid, message, wish and Plus mails follow the Collector's switches under Notifikationer. Account mails are always sent. A message mail is held back for 15 minutes and only sent if the message is still unread, at most once per conversation until it is opened. Mails go out from `noreply@kitcollective.app` through Amazon SES, in light and dark, and read well on a phone.

## User Stories

1. As a Collector signing in, I want the login code in a designed mail, so that I trust it comes from KitCollective.
2. As a Collector signing in, I want the code first in the subject, so that I can read it from the lock screen.
3. As a Collector, I want the code mail to say how long the code is valid, so that I know whether to hurry.
4. As a person who did not ask for a code, I want the mail to say I can ignore it, so that I am not alarmed.
5. As a Collector changing my e-mail, I want a code sent to the new address, so that I prove I own it.
6. As a Collector whose e-mail was changed, I want a mail at the old address, so that I notice if it was not me.
7. As a Collector reading that mail, I want the new address masked, so that it does not leak in full.
8. As a Collector reading that mail, I want a support address to write to, so that I can act when I cannot reply.
9. As a Collector who deleted my account, I want a confirmation mail, so that I know the deletion happened.
10. As a Collector whose account was deleted by someone else, I want a way to contact support, so that I can react.
11. As a jersey owner, I want a mail when someone bids, so that I do not miss it.
12. As a jersey owner, I want to see the jersey photo, club, type and season in the mail, so that I know which jersey it is.
13. As a jersey owner, I want the amount and the bidder's handle and city as fact rows, so that I can judge the bid at a glance.
14. As a jersey owner, I want the amount kept out of the subject and preview, so that it does not show on my lock screen.
15. As a jersey owner, I want **Se buddet** to open the conversation at the bid, so that I can accept or decline at once.
16. As a bidder, I want a mail when my bid is accepted, so that I can arrange the rest.
17. As a bidder, I want **Åbn samtalen** to open the conversation with the owner, so that I can write right away.
18. As a bidder, I want a mail when my bid is declined, so that I am not left waiting.
19. As a bidder with a declined bid, I want **Send nyt bud** to open Send bud for that jersey, so that I can try again.
20. As a bidder whose bid was declined because the jersey went to someone else, I want the mail to say so and offer no button, so that I do not bid on a closed jersey.
21. As a Collector, I want a mail for a new message only if I have not read it after 15 minutes, so that I am not mailed while I am in the conversation.
22. As a Collector, I want at most one message mail per conversation until I open it, so that a long exchange does not fill my inbox.
23. As a Collector, I want the message text and the sender's handle in the mail, so that I know what it is about.
24. As a Collector, I want **Svar** to open that conversation, so that I can answer.
25. As a blocked Collector's counterpart, I want no mail about messages or bids from someone I blocked, so that blocking holds outside the app.
26. As a Collector with KitCollective+, I want a mail when a jersey matching my wish becomes open for bids, so that I can act before others.
27. As a Collector, I want the wish mail to show the jersey, the owner with city, and the status, so that I can decide to look.
28. As a Collector, I want **Se trøjen** to open that foreign jersey, so that I can bid.
29. As a Collector with several new finds on one wish, I want one mail per find, not a digest, in this version, so that each takes me to one jersey.
30. As a Collector in a trial, I want a mail the day before the trial ends, so that the end is not a surprise.
31. As a Collector in a trial, I want that mail to say nothing is charged automatically, so that I am not worried.
32. As a Collector in a trial, I want **Fortsæt med Plus** to open the paywall, so that I can choose a plan.
33. As a Collector whose trial or subscription ended, I want a mail saying Plus has expired and my wishes are kept, so that I know what changed.
34. As a Collector who already bought a plan, I want no trial-ending mail, so that I am not told something untrue.
35. As a Collector whose jersey was taken down, I want a mail naming the jersey and the reason, so that I understand.
36. As a Collector whose jersey was taken down, I want a support address, so that I can object.
37. As a Collector, I want to switch off mails about bids and messages, so that I decide what reaches me.
38. As a Collector, I want to switch off mails about wish matches and Plus, so that I decide what reaches me.
39. As a Collector, I want account mails to arrive whatever my switches say, so that security notices are never lost.
40. As a Collector, I want my switches saved on the server, so that they hold on a new phone.
41. As a new Collector, I want bid, message and wish mails on by default and news off, so that I get what matters without asking.
42. As a Collector, I want every footer to say why I got the mail and where to switch it off, so that I am never puzzled.
43. As a Collector, I want the legal sender line in the footer, so that I know who sends the mail.
44. As a Collector using dark mode, I want the mail designed for dark, so that it is not a white flash.
45. As a Collector on a phone, I want the board small in the corner and the headline at full width, so that the mail reads well.
46. As a Collector whose mail client blocks images, I want the headline, facts and button to remain, so that the mail still works.
47. As a Collector with a text-only client or a screen reader, I want a plain-text version and alt text, so that I get the same content.
48. As a Collector, I want a button in a mail to open the app on the right screen when it is installed, so that I do not have to search.
49. As a Collector without the app on this device, I want the link to land on a web page that sends me to the store, so that it is not a dead end.
50. As a signed-out Collector following a link, I want to land on the right screen after signing in, so that the mail's promise holds.
51. As a Collector, I want an action I took to succeed even if the mail to the other person fails, so that mail trouble never breaks the app.
52. As an operator, I want failed sends logged with mail type and reason, without the mail body, so that I can see trouble without reading private text.
53. As an operator, I want each timed mail sent at most once, also after a restart, so that nobody gets duplicates.
54. As an operator, I want bounces and complaints to stop further non-account mails to that address, so that the sender reputation holds.
55. As Nicklas, I want the domain verified with SES and out of the sandbox, so that mails reach real inboxes.
56. As Nicklas, I want development and staging to record mails instead of sending them, so that no test mail reaches a real person.
57. As an implementing agent, I want one template module with the seven body parts, so that a thirteenth mail is content, not layout.
58. As an implementing agent, I want the three boards and the lockup as hosted images in both schemes, so that mail clients can render them.

## Implementation Decisions

- **Notify owns mail.** The Notify module grows from "auth mail" to one interface: a caller hands it a typed event (one of twelve kinds with its data), Notify decides whether to send (preferences, blocks, suppression), renders, and hands a finished mail to the mailer adapter. Identity, Collection, Wishlist, Billing and Moderation call Notify; none of them build mail content.
- **Outbound mail shape.** The mailer adapter receives recipient, subject, preheader, HTML body and text body. The existing link-and-code shape is replaced; the legacy verify and reset kinds leave with the password (KIT-276).
- **Template module.** One renderer for the locked anatomy (Top with board and curved edge, Body, Footer) and the seven body parts (Code, Jersey, Fact rows, Message, Text, Note, Button). Each mail kind is a small definition: board, subject, preheader, headline, supporting line, parts, button target, footer reason. HTML is table-based with inline styles for client compatibility; dark is done with `prefers-color-scheme` and colours chosen to survive forced inversion. Fonts fall back to system sans and mono; brand fonts are not required to render.
- **Images.** The lockup (light, dark) and the three boards (light, dark, and the 160-wide phone size) are static PNGs with alt text, served from a public, cache-friendly URL owned by the product. The curved edge is part of the Top image area or a hosted image, not CSS that clients drop. Jersey photos use the existing public photo URL at a small size. Final artwork is a design gap; the Paper vectors are exported for 1.0.
- **Sender.** `KitCollective <noreply@kitcollective.app>` through Amazon SES. The SES adapter is implemented behind the existing adapter interface and selected by lane configuration; every lane that is not production keeps the recording adapter. Credentials are lane secrets and never appear in code or logs.
- **Failure isolation.** Sending happens after the triggering transaction commits and never fails it. A failed send is logged with kind, recipient hash and reason, and retried a bounded number of times.
- **Outbox and timing.** A persisted outbox table holds scheduled and pending mails with kind, recipient, payload, due time, a uniqueness key and state. A single in-process worker claims due rows with a database lock so that several instances do not double-send. It covers: the 15-minute message delay, the trial-ends-tomorrow mail, and retries. No external queue is added.
- **Message rule.** On a new message, schedule one mail due in 15 minutes with a uniqueness key per conversation and recipient. At due time it is sent only if the recipient still has unread messages in that conversation; it is dropped otherwise. No further message mail is scheduled for that conversation and recipient until they open it.
- **Trial rule.** When a trial starts, schedule the reminder for 24 hours before it ends (for a trial shorter than 48 hours, at the midpoint). It is dropped if the Collector has an active plan at due time. Plus expired is sent when access ends, for a trial or a subscription.
- **Bid rules.** New bid → owner. Accept → bidder. Decline → bidder. Bids auto-declined because another was accepted, or because the jersey was deleted, send the "went to another collector" variant without a button (the deleted-jersey wording follows the lock's variant line). Depends on the Accept behaviour in KIT-297 and the pair-conversation model in KIT-295.
- **Wish rule.** One mail per new find, sent when the find is recorded (KIT-303), only while the Collector has access to KitCollective+.
- **Account mails.** Code and confirm-new-e-mail carry the code first in the subject. E-mail changed goes to the old address with the new one masked. Account deleted is sent to the address as it was at deletion, composed before the data is removed. Jersey taken down is sent by the Take-down action with its reason.
- **Preferences.** A per-Collector record with e-mail switches `bidsAndMessages` (default on), `wishMatches` (default on; also governs trial and expiry mails), `news` (default off, unused in 1.0), and the push switches the Notifikationer screen shows (stored now, used when push is built). Read and written through the identity HTTP interface; KIT-312 binds its screen to it. Account mails ignore preferences.
- **Blocks and suppression.** No bid or message mail when either side has blocked the other. An address with a hard bounce or complaint is suppressed for all non-account mails; SES feedback arrives on a webhook that verifies its signature.
- **Links.** Every button is an HTTPS universal link on the product domain with only opaque ids in the path (no e-mail, no amount, no handle in the URL). The mobile app maps a link to a screen through one pure resolver: conversation (optionally at a bid), foreign jersey, Send bud for a jersey, paywall. Without the app, the web surface shows a short page with the store link. A signed-out Collector is taken to the target after signing in.
- **Language.** Danish only in 1.0; copy lives in one place per mail so a second language is an addition.
- **Privacy.** Mail bodies are not stored after sending; the outbox keeps ids, not message text, and renders at send time. Logs carry no body, no code and no amount.

## Testing Decisions

A good test states an event or an action and checks the mail a person would receive: who gets it, the subject, the preheader, the visible facts, and where the button leads. It does not assert on markup structure, table nesting or class names.

- **Seam 1, Notify interface** (existing, widened): event in, recorded mail out, using the recording mailer already used by the identity tests. One case per mail kind and variant: recipient, subject, preheader, text body contains the facts, HTML contains the same facts and the right button link, the right board image, both colour schemes present, alt text present; no amount in subject or preheader; code first in subject. Also the decision cases: preference off, blocked pair, suppressed address, account mail ignores preferences.
- **Seam 2, HTTP boundary** (existing): real calls against the test database with the recording mailer and a controllable clock. Bid, accept, decline, auto-decline and deleted jersey; message unread after 15 minutes, read before 15 minutes, second message in the same conversation, reopened conversation; wish find with and without Plus; trial start then reminder, reminder dropped after purchase, expiry; e-mail change (both mails), account deletion, take-down; preferences read and write with defaults; an action still succeeds when the mailer throws; the worker sends a due row once when run twice.
- **Seam 3, SES mailer adapter** (interface exists, adapter new): against a stubbed SES client. Sends from the configured sender with subject, HTML and text; maps provider errors to a retryable or permanent failure; refuses to start in a lane without sender configuration. The feedback webhook rejects a bad signature and suppresses on bounce and complaint.
- **Seam 4, mobile link resolver** (new, pure): URL in, route and parameters out, for every button target, unknown links, and the signed-out case.

Prior art: identity service and controller tests with the recording mailer; the collection HTTP tests for bids and conversations; the pure view-model tests added in Samling 1.0 for the resolver style. A visual check of the rendered HTML against the Paper artboards is done once by hand in Apple Mail, Gmail and Outlook and recorded as evidence on the template issue; it is not an automated seam.

## Out of Scope

- Push notifications and any Indbakke row for the same events.
- Newsletters, a welcome mail, digests, and the **Nyheder** switch doing anything.
- Mails for Handel (address, payment, shipping); they belong to Handel 1.0.
- Languages other than Danish.
- An unsubscribe link that works without signing in, and list-unsubscribe headers beyond what SES requires for transactional mail.
- Final illustrated artwork for the boards; 1.0 ships the exported Paper drawings.
- An operator view of sent mail in Admin.
- Replies: `noreply@` is not read.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. **E-mail 1.0** — complete when on staging each of the twelve mails is produced by its real trigger and matches the locked template in light, dark and phone width; preferences are saved on the server and respected; the message mail is delayed and limited; the trial reminder and expiry mails are sent once at the right time; every button opens the right screen in the app; and production can deliver through SES from `noreply@kitcollective.app` with bounces suppressed.

## Further Notes

Decided in conversation (2026-10-10): sender `noreply@kitcollective.app`; a third e-mail switch **Match på ønsker** that also governs trial and expiry mails; the 15-minute, once-per-conversation rule for message mails. The lock lists the last two as proposed; the lock is updated with this spec.

Open, to be supplied by Nicklas before production (flag, do not invent): the support address; the legal sender line (company name, address, CVR); the list of take-down reasons.

Human-only setup (one `ready-for-human` issue): verify the domain with SES (DKIM, SPF, DMARC), request production access, create the lane secrets, and host the universal-link association files.

Dependencies: KIT-295 and KIT-297 (pair conversation, Accept closes the jersey) for bid and message mails; KIT-303 for wish finds; KIT-301 for the explicit trial start; KIT-312 for the Notifikationer screen; KIT-276 for removing the verify and reset mails; KIT-290 and KIT-291 for the screens the links open.

Personal data: mails carry handles, cities, amounts and message text to the recipient's mailbox. The privacy text must name e-mail notifications and SES as a processor.
