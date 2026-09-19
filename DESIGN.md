---
version: alpha
name: KitCollective
description: Machine-readable tokens for coding agents. Interaction rules, unsupported uses, and patterns live in docs/design-system.md. If this file and that file disagree, docs/design-system.md wins.
colors:
  primary: "#000000"
  on-primary: "#FFFFFF"
  canvas: "#FFFFFF"
  surface: "#FFFFFF"
  surface-raised: "#FFFFFF"
  fill-secondary: "#F4F4F4"
  content-secondary: "#5E5E5E"
  content-muted: "#6B6B6B"
  border-subtle: "#E8E8E8"
  danger: "#B42318"
  on-danger: "#FFFFFF"
  warning: "#F5A623"
  success: "#0E8345"
  info: "#276EF1"
  wash-start: "#00D4F5"
  wash-end: "#6B2FFF"
  canvas-dark: "#000000"
  surface-dark: "#1A1A1A"
  surface-raised-dark: "#2A2A2A"
  on-primary-dark: "#000000"
  fill-secondary-dark: "#2A2A2A"
  content-secondary-dark: "#C2C2C2"
  content-muted-dark: "#8A8A8A"
  border-subtle-dark: "#333333"
typography:
  display:
    fontFamily: Archivo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 32px
    fontWeight: 600
    lineHeight: 37px
  title:
    fontFamily: Archivo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 29px
  section:
    fontFamily: Archivo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 25px
  heading-sm:
    fontFamily: Archivo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 15px
    fontWeight: 600
    lineHeight: 20px
  body:
    fontFamily: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 25px
  label:
    fontFamily: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 20px
  caption:
    fontFamily: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
  mono:
    fontFamily: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  "2xl": 32px
  "3xl": 48px
  inset-sm: 8px
  inset-md: 16px
  inset-lg: 24px
  gap-sm: 8px
  gap-md: 12px
  gap-lg: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 48px
  button-secondary:
    backgroundColor: "{colors.fill-secondary}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 12px
    height: 44px
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 12px
    height: 44px
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 8px
    height: 44px
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: 12px
    height: 44px
  jersey-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.content-secondary}"
    typography: "{typography.heading-sm}"
    rounded: "{rounded.md}"
  sheet:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.primary}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: 16px
  empty-state:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  tab-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.content-secondary}"
    typography: "{typography.caption}"
    height: 44px
  tab-bar-inactive:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.content-muted}"
    typography: "{typography.caption}"
    height: 44px
  banner-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px
  banner-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px
  banner-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px
  banner-info:
    backgroundColor: "{colors.info}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px
  button-primary-dark:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.on-primary-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 48px
---

## Overview

KitCollective is a Nordic football-shirt collector catalog. The UI feels like Vinted for scanability (photo grid, short captions, search, chips, tab bar) and like Uber Base for structure (black, white, gray; quiet motion). It is not a marketplace and not a brand-hue product.

The collector’s own jersey photo is the interface. Chrome recedes. Primary actions are black on light / white on dark — never cyan, never a gradient fill.

**Authority:** This file is the Google Labs `DESIGN.md` token layer (spec alpha). Full contracts, patterns, accessibility, and “flag don’t invent” rules are in [`docs/design-system.md`](docs/design-system.md). Domain nouns are in `CONTEXT.md`. If files disagree, `docs/design-system.md` wins.

## Colors

Light is the default canvas. Dark is a full token mode that follows the system appearance (see `*-dark` tokens). Status colors are functional only.

- **Primary (`#000000`):** Ink. Primary button fill on light, titles, selected chip. Not a mascot hue. Do not invent a second brand color.
- **On-primary (`#FFFFFF`):** Text on primary fill.
- **Canvas / surface (`#FFFFFF`):** Page and card. Cards are flat.
- **Content secondary / muted:** Captions and placeholders.
- **Danger / warning / success / info:** Error, caution, saved, neutral notice. Never the identity wash.
- **Wash start/end (`#00D4F5` → `#6B2FFF`):** One cyan→violet garnish (thin rule, empty-state strip, OG top strip) at low opacity. Forbidden: behind a jersey photo, on body text, on a primary CTA, as success/error.

Do not use `wash-start` / `wash-end` as `tertiary` interaction color.

## Typography

Brand webfonts: **Archivo** (headings, logo), **IBM Plex Sans** (body, labels, buttons), **IBM Plex Mono** (season, counts, IDs). System-ui is fallback only. No UberMove. Collection home “Samling” uses `display` at **28px** (not 32). Full roles, tracking, and constraints: `docs/design-system.md`.

- **Display:** Archivo 32px / 600 / 37px — rare large heading.
- **Title:** Archivo 24px / 600 / 29px — other screen titles.
- **Section:** Archivo 20px / 600 / 25px — mid headings.
- **Heading-sm:** Archivo 15px / 600 / 20px — club name on a jersey tile.
- **Body:** Plex Sans 16px / 400 / 25px — minimum body size on mobile.
- **Label:** Plex Sans 16px / 500 / 20px — buttons (chips use 14px of the same role).
- **Caption:** Plex Sans 12px / 400 / 18px — non-data meta.
- **Mono:** Plex Mono 14px / 400 / 20px — season · type under a tile; counts.

## Layout

Mobile collection home: two-column 4:5 grid, page inset 16px, grid gap 12px. Header is title + count + bell — **no search, no logo**. Search is the Søg tab. Chip row under the header. Tab bar is a **floating glass pill** with five icon-only slots (house · compass · raised plus · heart · person). Plus opens capture, not a listing compose. Confirm/Save is a single column.

Web (Astro): single jersey max 640px; collection max 960px (2 / 3 / 4 columns at 0 / 768 / 1024px; never five). OG 1200×630; letterbox 4:5; wash as a thin top strip only.

Safe-area insets on mobile. Hit targets ≥ 44×44.

## Elevation & Depth

Flat cards: no drop shadow; `border-subtle` if the photo edge needs it. Overlay tasks use a scrim plus a raised sheet (16px radius). Do not elevate a tile on press. Camera preview is full-screen, not a card.

## Shapes

Two families: cards and photo tiles use 12px (`rounded.md`); sheets 16px (`rounded.lg`); nested children shrink one step. Buttons use 8px (`rounded.sm`). Chips and search use pill (`rounded.full`). Do not pill a jersey tile. Do not use 0px on interactive elements.

## Components

Inventory and full contracts: `docs/design-system.md`. Token snapshots below are for agents that only read this file.

- **Button:** One primary per region. Dock primaries = black rectangular (`rounded.sm`), fill width, ≥ 48 tall. Inline/banner stay hug. Destructive = danger fill. Loading keeps the label.
- **Chip:** Selected = primary fill. Not wash. No emoji. Samling chips are genveje (`shortcut`) + Alle; kit type stays on Confirm. Tilpas is text, not a plus.
- **Select field:** 52px row; opens a searchable picker. Not free-text club.
- **Jersey tile:** User photo 4:5; club `heading-sm`, season · type `mono`. No price, buy, boost, or archive `KitPhoto`.
- **Search field:** Pill. Club search returns catalog IDs, not free-text club as truth.
- **Tab bar:** Five icon-only slots in a floating glass pill (Samling · Søg · Tilføj trøje · Ønske · Profil). Plus is capture, inside the pill. No FAB, no sell bubble, no visible labels.
- **Banner:** One at a time for Save failures; keep the draft.

Deferred here (do not invent): switch, checkbox, avatar, paywall, wishlist row, admin tables.

## Do's and Don'ts

- Do read `docs/design-system.md` before composing a screen.
- Do use primary (black/white) for the single most important action per region.
- Do crop collection photos 4:5; letterbox on OG — do not crop the jersey to 16:9.
- Do use a monogram when a crest/flag/portrait asset is missing.
- Do honor `prefers-reduced-motion` (still equivalent; no transform travel).
- Do put **lockup** on login / onboarding / splash; **wordmark** on app header and narrow chrome; **favicon / filled monogram** as the tab icon; **appicon** files on store / home screen. `admin` uses black variants only.
- Don't invent tokens, variants, stacked logos, or compact SVG files. Flag the gap.
- Don't put the wordmark, lockup, or KC monogram in the Samling header, tab bar, or on a jersey tile.
- Don't use white wordmark / lockup / monogram on `admin` (light only).
- Don't use the product KC monogram as a club Mark, operator profile, or `KitPhoto` crest.
- Don't put identity wash behind a jersey photo or on a CTA.
- Don't use emoji as icons or category marks.
- Don't build marketplace chrome (price, buy, boost, ratings).
- Don't copy UberMove or import Base Web. Base and Vinted are taste references only.
- Don't put kit-type chips (Hjemme/Ude) on Samling. Genveje manager is a Sheet, not a tab.
