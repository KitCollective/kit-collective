# Profil IA — verdict

Throwaway Expo prototype: `apps/mobile/src/prototype-profile/`. Run `pnpm prototype:profile`. Not product. Do not land into `development` as UI.

## Question

How should KitCollective's **Profil** place hold collector identity (avatar, username, About me, location), favourites, and settings (account, push, email, language, dark mode, privacy, cookies, log out) without Vinted marketplace chrome?

## Verdict

**Winner: A — Liste og drill.** Nicklas, 2026-08-28.

Settings live **under Profil**. Identity card at the top (avatar + unique username that follows the collector around). Drill-down list for edit profile, location (country → city search / popular cities / free tag), favourites, settings hub, cookies. No payments, postage, security, “view my listings”, help, or about as primary chrome.

Rejected for this surface:

- **B — Samler-canvas** (hero identity, settings in a Sheet)
- **C — Kontrolcenter** (inline chips and accordions on one scroll)

Prototype code stays the primary source for all three. Fold A into `/to-design` (hi-fi prompt in `claude-design/CLAUDE-PROMPT.md`), then `/to-spec`. Rewrite properly at implement — do not copy the prototype.

## Scope locked by the walkthrough

In:

- Avatar, unique username, About me, My location (country → search / popular cities → typed tag if no match)
- Favourites as other collectors’ UserJerseys (4:5 tiles), not marketplace listings
- Settings: profile details, account, push, email, language, dark mode, privacy, log out
- Cookie preferences that actually choose (all / essential / custom)

Out:

- View my listings, payments, postage, security, help centre, about, legal as a primary place
