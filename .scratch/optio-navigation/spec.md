# Optio navigation and Inbox

## Problem Statement

Nicklas runs KitCollective's engineering through Optio and Max, but he steers it from three places that were never built for it: Linear, the bb thread sidebar, and this kind of chat with an agent doing the steps by hand. Everything that needs him (an issue in `Approval`, a run's `### Waiting` question, a mention, a watchdog alarm) is scattered across Linear comments and labels, and acting on it means several manual moves: approving a merge takes setting `Merging`, enqueueing the PR, waiting for the merge, running the land gate and setting `Done`. The bb sidebar is one flat list of threads, where an issue's work is split over several threads and Max's routine wakes crowd out what matters. Max has no place to talk to Nicklas, and nothing in bb lets him pause a Loop or change a limit without a pull request.

## Solution

Optio gets its own main menu in bb, built around one page that holds everything waiting on Nicklas, and around the Staff as people he talks to.

- **Inbox** (the first menu item, and a "Venter på dig" section on bb's Home): every issue in `Approval`, every run question, Linear mention, watchdog alarm and Staff question, as cards he answers where they show. Approve takes a merge all the way to `Done`; Reject needs a comment and sends the issue back to `To-do`; an answer becomes his Linear comment and sends the issue back to `To-do`, so Max resumes it. Linear stays the source of truth and keeps working beside it.
- **Staff**: a list of the Staff; each opens one **Staff chat** that remembers, with the Staff member's details and an Update button at the top and their routine work as an activity log.
- **Optio's thread list** in the sidebar: **Issue threads** grouped by what they wait on (*Waiting on you · Running · Landing · Done today*), child threads folded in, Staff on top, finished threads archived after a day.
- **Operating settings** for Loops and Staff (on or off, caps, schedules, models, budgets, pauses) changed in Optio and logged; what a Loop or Staff member is and may do stays in the repo (ADR-0065).

Board (KIT-360) and Runs (KIT-365) keep their own menu items.

## User Stories

### Inbox

1. As Nicklas, I want one menu item in bb that shows everything waiting on me, so that I never have to search Linear for what needs me.
2. As Nicklas, I want a "Venter på dig" section on bb's Home with the count and the newest cards, so that I see what waits the moment I open bb.
3. As Nicklas, I want each issue in `Approval` with a green review as a card with the issue, its PR, what changed and the review verdict, so that I can decide without opening GitHub.
4. As Nicklas, I want an Approve button on a green-review card, so that one click is my merge permission.
5. As Nicklas, I want Approve to take the PR all the way (set `Merging`, enqueue it, wait for the merge, run the land gate, set `Done`), so that I never finish a landing by hand.
6. As Nicklas, I want the card to show how the landing goes (queued, merged, `Done`, or why it stopped), so that I know my approval took effect.
7. As Nicklas, I want a Reject button that requires a comment, so that the next round gets my reason as feedback.
8. As Nicklas, I want a rejected issue to go to `To-do` with my comment on it, so that Max resumes it with my feedback.
9. As Nicklas, I want a run's `### Waiting` question as a card with the question, the stage it came from and the issue, so that I can answer without reading the workpad.
10. As Nicklas, I want to answer a question in a text field on the card, so that I answer where I read it.
11. As Nicklas, I want my answer written as my comment in Linear and the issue moved to `To-do` in the same click, so that the run resumes without another step.
12. As Nicklas, I want a question the run asked as a choice (A or B) to show those choices as buttons next to the field, so that the common answer is one click.
13. As Nicklas, I want `needs-info` and `ready-for-human` cards to look different from a green-review card, so that I never approve a merge when I meant to answer a question.
14. As Nicklas, I want my Linear mentions as cards with the comment and a link, so that I see them without Linear's inbox.
15. As Nicklas, I want a mention I handled in the Inbox marked read in Linear, so that I do not see it twice.
16. As Nicklas, I want watchdog alarms as cards that close themselves when the watchdog says they cleared, so that an old alarm never looks current.
17. As Nicklas, I want a question a Staff member asked me in their chat as a card too, so that nothing that needs an answer is only in a chat.
18. As Nicklas, I want a bb notification for a new card that blocks work (an `Approval` or a question), and none for mentions or alarms, so that I am interrupted only when the factory waits on me.
19. As Nicklas, I want approving or answering in Linear to remove the card from the Inbox, so that both places agree.
20. As Nicklas, I want the cards ordered by what blocks most (merges and questions first, then Staff questions, mentions, alarms), so that the top card is always the next thing to do.

### Staff chat

21. As Nicklas, I want a Staff menu item that lists the Staff (Max now; Chris, Sophie and Brad later), so that I can reach each one.
22. As Nicklas, I want Max to open as one standing chat, so that I talk to the same Max every time, not a new thread per task.
23. As Nicklas, I want Max to remember what we agreed between chats, through his memory, so that I never repeat myself.
24. As Nicklas, I want Max's details at the top of the chat (title, status, last Heartbeat, budget used), so that I see how he is doing before I write.
25. As Nicklas, I want an Update button at the top that opens Max's settings, so that I adjust him where I talk to him.
26. As Nicklas, I want Max's daily status written into his chat, so that the status is part of our conversation.
27. As Nicklas, I want Max's routine wakes in an activity log under him, not in the chat, so that the chat stays readable.
28. As Max, I want to write to Nicklas in our chat when something is his to decide, so that the question reaches him where he talks to me.

### Optio's thread list

29. As Nicklas, I want the sidebar to show Issue threads grouped as *Waiting on you · Running · Landing · Done today*, so that I see at a glance where each issue is.
30. As Nicklas, I want each issue to be one Issue thread from plan to land, so that its whole history is in one place.
31. As Nicklas, I want the Lead, Engineer and Reviewer threads folded under their Issue thread, so that the list shows issues, not every helper.
32. As Nicklas, I want the Staff at the top of the list, so that Max's chat is one click away from anywhere.
33. As Nicklas, I want threads that are no issue and no Staff under *Other*, so that my own work still has a place.
34. As Nicklas, I want an Issue thread archived a day after its issue is `Done`, so that the list stays short without losing history.

### Operating settings

35. As Nicklas, I want a Loops page with each Loop's on/off, caps and schedule, so that I can pause the AFK developer at night without a pull request.
36. As Nicklas, I want every change of an Operating setting recorded with who and when, so that I can see why the factory behaved as it did.
37. As Nicklas, I want an override shown next to the value from `factory.config.json` or the Charter, so that I know the file is not what runs.
38. As Nicklas, I want to clear an override and fall back to the file, so that undoing is one click.
39. As Nicklas, I want Max's Update to change only his Operating settings directly (on/off, model, budget, Heartbeat schedule, pause), so that his access never grows without a review.
40. As Nicklas, I want a change to what Max may do (tools, access, what he owns, what he must never do) to open a pull request to his Charter, so that it lands like any other factory change.
41. As Max, I want my tick and watchdog to read my Operating settings, so that a pause Nicklas sets stops me at the next wake.

## Implementation Decisions

- **Terms**: Inbox, Issue thread, Staff chat and Operating setting are defined in `CONTEXT.md`; ADR-0065 decides where Operating settings live. Existing terms (Approval, Merging, Loop, Board, Staff, Charter, Heartbeat) keep their meaning; approving still means setting `Merging` (ADR-0061).
- **Menu**: Optio registers one bb nav panel per menu item: Inbox (first), Board, Staff, Loops, Runs. The current single Agents panel becomes the Staff item. Inbox also registers a bb homepage section.
- **Inbox module (Optio server)**: a deep module that builds the cards from one Linear read (issues in `Approval` with their labels, the workpad's `### Waiting` section, the PR and its review result; Nicklas's notifications through his API key), the watchdog's alarm issue and Staff questions, and orders them. Its actions are RPCs: list, approve, reject (comment required), answer (comment, then `To-do`), and mark a mention read. Writes go to Linear as Nicklas; Linear changes made elsewhere remove the card on the next read.
- **Card kinds** come from the Approval shapes in `CONTEXT.md`: green review gets Approve and Reject; `needs-info` gets an answer field; `ready-for-human` gets an answer field plus the run's choices as buttons when the `### Waiting` text offers them.
- **Landing an approved PR**: a new repo script does the human landing path end to end (`Merging` is already set by the approval, then enqueue, wait for the merge, land gate, `Done`; on any failure, `Approval` with `ready-for-human` and the reason). Optio's server calls it through the host bundle on the runs machine (proved by KIT-361), never with a model in between, and reports its verdict on the card.
- **Notifications**: a new blocking card (`Approval` or a question) raises a bb notification when bb's API offers one; otherwise the card and Linear's inbox suffice.
- **Staff chat**: one standing thread per Staff member, created by Optio and found again by it; Max's daily status and his questions to Nicklas go there. His dispatch wakes stay in his daily activity thread (built: "Max · <date>" in the Max section, `staff/max/tick.js`). The chat's header shows the Staff member's details and the Update button through a thread-header action.
- **Thread list**: Optio registers bb's thread-list replacement (experimental; chosen in bb's appearance settings). Groups are computed from each Issue thread's issue state in Linear; child threads are nested by their parent; Staff are pinned at the top; threads with no issue go under *Other*. Until it ships, the bb sections Max and Issues hold the same split (built).
- **One thread per issue**: a resume goes to the issue's existing thread (built in `staff/max/tick.js`); the Board (KIT-360) must keep the rule when it takes over dispatch.
- **Archiving**: an Issue thread is archived one day after its issue reached `Done`; archiving is reversible.
- **Operating settings**: stored in Optio's database with who and when, overriding `factory.config.json` and the Charter while set (ADR-0065). The Loops page and the Staff Update dialog change them; the tick, the watchdog and the Board read values through Optio's override-or-file rule. Changes to what a Loop or Staff member is go through a pull request opened from the page.
- **Order of work**: Inbox, then Staff chat and the thread list, then Operating settings.

## Testing Decisions

- A good test drives Optio the way bb does and checks what Nicklas would see or what lands in Linear: the cards a list returns, the Linear writes an action makes, the verdict a landing reports. It never inspects React state, SQL or private helpers.
- **Seam 1: Optio's server RPC contract**, the existing seam: tests load the plugin into bb's fake plugin host (`createFakePluginHost`) with a fake Linear behind `fetch`, and call RPCs. All Inbox, Staff chat, thread-list grouping and Operating setting behaviour is tested here. Prior art: the Agents page and Board tests in the plugin's server test file.
- **Seam 2: the landing script's command line**, tested with a fake `gh`, a fake git remote and a fake Linear CLI, as `scripts/tests/auto-land.test.mjs` does for auto-land. It covers merged to `Done`, ejected from the queue, red integration check, and the gate still waiting.
- **No unit seam in the React components.** The pages are proven after the merge by live checks (`optio-reload`, and a new `optio-inbox` that asks the Inbox RPC for its cards) and a screenshot on the issue, as Optio's existing pages are.

## Out of Scope

- A visual builder for workflows or Loops: a Loop's logic stays code in the repo and changes by pull request.
- Editing a Charter or the Loop registry from the UI (only a pull request is opened).
- Board and Runs pages themselves (KIT-360, KIT-365); this spec only places them in the menu.
- Hiring Chris, Sophie and Brad (Staff milestone).
- Replacing Linear: approvals and answers keep working there.
- Push to a phone beyond what bb's notifications already do.
- Holdout Scenarios for these milestones (see Linear).

## Linear

- **Project:** Optio
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment):
  1. **Inbox**: complete when the Inbox menu item and the "Venter på dig" Home section show every `Approval`, question, mention, alarm and Staff question as cards; Approve lands a PR to `Done`, Reject (with a comment) and Answer send the issue to `To-do` with Nicklas's comment; blocking cards raise a bb notification. Demo: an issue in `Approval` is approved from the Inbox and reaches `Done` with nobody touching Linear or GitHub. — 0 Scenarios in the Holdout
  2. **Staff chat and thread list**: complete when each Staff member opens one standing Staff chat with details and Update at the top, Max's status and questions arrive there and his wakes are an activity log, and Optio's thread list groups Issue threads as *Waiting on you · Running · Landing · Done today* with child threads folded in and finished threads archived after a day. Demo: Nicklas follows one issue from plan to land in a single Issue thread and talks to Max in one chat. — 0 Scenarios in the Holdout
  3. **Operating settings**: complete when the Loops page and Max's Update change on/off, caps, schedules, models, budgets and pauses as logged overrides of `factory.config.json` and the Charter, the tick, watchdog and Board obey them, and a change to what a Loop or Staff member is opens a pull request instead. Demo: pausing the AFK developer Loop from the Loops page stops new runs at the next tick, and clearing it resumes them. — 0 Scenarios in the Holdout

## Further Notes

- **No Holdout Scenarios.** `/to-spec` asks for Scenarios on every new milestone, but the Scenario judge only runs Maestro flows against the KitCollective app (`flow` requires its `appId`, ADR-0060), so it cannot judge Optio. Each milestone is proven by its demo and live checks instead. The gap between the skill and ADR-0060 is filed as a signal-up.
- Decisions come from a `/grill-with-docs` with Nicklas on 2026-10-17 (17 questions) and `.scratch/optio/navigation.md`.
- The bb SDK pieces this relies on (nav panels, a homepage section, the thread-list replacement, thread-header actions) were read from the plugin SDK pinned in the plugin's package (0.6.37); the thread-list replacement is experimental there.
