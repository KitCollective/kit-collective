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
  title:
    fontFamily: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 22px
    fontWeight: 600
    lineHeight: 28px
  body:
    fontFamily: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  label:
    fontFamily: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 20px
  caption:
    fontFamily: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
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
    rounded: "{rounded.full}"
    padding: 12px
    height: 44px
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
    typography: "{typography.caption}"
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
    rounded: "{rounded.full}"
    padding: 12px
    height: 44px
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

Platform system UI only (San Francisco, Roboto, `system-ui`). No UberMove. No webfont until a logo pass. No display role.

- **Title:** 22px / 600 / 28px — screen titles.
- **Body:** 16px / 400 / 24px — minimum body size on mobile.
- **Label:** 16px / 500 / 20px — buttons, chips, field labels.
- **Caption:** 13px / 400 / 18px — club + season under a photo; max two lines, ellipsis.

## Layout

Mobile collection: two-column photo grid, page inset 16px, grid gap 12px, search in the header, chip filters, equal tab bar (Collection / Add). Add opens capture, not a listing compose. Jersey tiles crop **4:5**. Confirm/Save is a single column.

Web (Astro): single jersey max 640px; collection max 960px (2 / 3 / 4 columns at 0 / 768 / 1024px; never five). OG 1200×630; letterbox 4:5; wash as a thin top strip only.

Safe-area insets on mobile. Hit targets ≥ 44×44.

## Elevation & Depth

Flat cards: no drop shadow; `border-subtle` if the photo edge needs it. Overlay tasks use a scrim plus a raised sheet (16px radius). Do not elevate a tile on press. Camera preview is full-screen, not a card.

## Shapes

Two families: cards and photo tiles use 12px (`rounded.md`); sheets 16px (`rounded.lg`); nested children shrink one step. Buttons, chips, and search use pill (`rounded.full`). Do not pill a jersey tile. Do not use 0px on interactive elements.

## Components

Inventory and full contracts: `docs/design-system.md`. Token snapshots below are for agents that only read this file.

- **Button:** One primary per region. Primary = black pill, not wash. Destructive = danger fill. Loading keeps the label.
- **Chip:** Selected = primary fill. Not wash. No emoji.
- **Jersey tile:** User photo 4:5 + caption. No price, buy, boost, or archive `KitPhoto`.
- **Search field:** Pill. Club search returns catalog IDs, not free-text club as truth.
- **Tab bar:** Equal items; selected = primary ink; no FAB, no sell bubble. Wishlist tab ships later.
- **Banner:** One at a time for Save failures; keep the draft.

Deferred here (do not invent): switch, checkbox, avatar, paywall, wishlist row, admin tables.

## Do's and Don'ts

- Do read `docs/design-system.md` before composing a screen.
- Do use primary (black/white) for the single most important action per region.
- Do crop collection photos 4:5; letterbox on OG — do not crop the jersey to 16:9.
- Do use a monogram when a crest/flag/portrait asset is missing.
- Do honor `prefers-reduced-motion` (still equivalent; no transform travel).
- Don't invent tokens, variants, or components. Flag the gap.
- Don't put identity wash behind a jersey photo or on a CTA.
- Don't use emoji as icons or category marks.
- Don't build marketplace chrome (price, buy, boost, ratings).
- Don't copy UberMove or import Base Web. Base and Vinted are taste references only.
- Don't treat English seed strings as Danish UI labels (`CatalogLabel` wins).
