import { asset, BOARD_ALT, type Board, type SchemeName } from "../assets.js";
import { type EmailConfig, readEmailConfig } from "../email-config.js";
import { esc } from "./escape.js";
import { buttonPart, renderPart } from "./parts.js";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DARK,
  FONT_SANS,
  GAP,
  GAP_AFTER_JERSEY_OPENER,
  INSET,
  LIGHT,
  PHONE_BOARD_HEIGHT,
  PHONE_BOARD_WIDTH,
  PHONE_INSET,
  TEXT_BLOCK_WIDTH,
} from "./tokens.js";
import type { MailDefinition, RenderedMail } from "./types.js";

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const FLUID = "width:100%;max-width:600px;";

/**
 * Light and dark art are both in the mail; the dark media block swaps which one shows. The dark
 * image is hidden inline so a client that drops the style block still shows only the light one.
 */
function themedImage(
  url: (scheme: SchemeName) => string,
  attrs: { alt: string; width?: number; height?: number; style?: string },
): string {
  const size = `${attrs.width ? ` width="${attrs.width}"` : ""}${attrs.height ? ` height="${attrs.height}"` : ""}`;
  const base = `display:block;border:0;${attrs.style ?? ""}`;
  return (
    `<img class="light-only" src="${esc(url("light"))}"${size} alt="${esc(attrs.alt)}" style="${base}">` +
    `<img class="dark-only" src="${esc(url("dark"))}"${size} alt="${esc(attrs.alt)}" style="${base}display:none;">`
  );
}

function stylesheet(): string {
  return `
:root{color-scheme:light dark;supported-color-schemes:light dark}
.dark-only{display:none}
@media (prefers-color-scheme: dark){
.bg-canvas{background:${DARK.canvas}!important}
.bg-field{background:${DARK.field}!important}
.bg-block{background:${DARK.block}!important}
.c-primary{color:${DARK.primary}!important}
.c-secondary{color:${DARK.secondary}!important}
.c-muted{color:${DARK.muted}!important}
.hairline{border-color:${DARK.hairline}!important}
.btn{background:${DARK.buttonFill}!important}
.btn-link{color:${DARK.buttonText}!important}
.light-only{display:none!important}
.dark-only{display:block!important}
}
@media (max-width:600px){
.desk{display:none!important}
.phone{display:table!important;max-height:none!important;overflow:visible!important}
.inset{padding-left:${PHONE_INSET}px!important;padding-right:${PHONE_INSET}px!important}
}`;
}

function lockup(base: string): string {
  return themedImage((scheme) => `${base}/${asset.lockup(scheme)}`, {
    alt: "KitCollective",
    height: 28,
    style: "height:28px;width:auto;",
  });
}

function edge(base: string, phone: boolean): string {
  return themedImage((scheme) => `${base}/${asset.edge(scheme, phone)}`, {
    alt: "",
    width: phone ? 375 : 600,
    style: `${FLUID}height:auto;`,
  });
}

function board(base: string, which: Board, phone: boolean): string {
  return themedImage((scheme) => `${base}/${asset.board(which, scheme, phone)}`, {
    alt: BOARD_ALT[which],
    width: phone ? PHONE_BOARD_WIDTH : BOARD_WIDTH,
    height: phone ? PHONE_BOARD_HEIGHT : BOARD_HEIGHT,
    style: `width:${phone ? PHONE_BOARD_WIDTH : BOARD_WIDTH}px;height:auto;`,
  });
}

function headlineBlock(headline: string, supporting: string, size: 32 | 28): string {
  const line = size === 32 ? 37 : 34;
  return (
    `<h1 class="c-primary" style="margin:0;font-family:${FONT_SANS};font-size:${size}px;line-height:${line}px;font-weight:600;letter-spacing:-0.03em;color:${LIGHT.primary};">${esc(headline)}</h1>` +
    `<p class="c-secondary" style="margin:8px 0 0;font-family:${FONT_SANS};font-size:16px;line-height:24px;color:${LIGHT.secondary};">${esc(supporting)}</p>`
  );
}

/** Top for a wide client: the text block is 356 wide and the board sits in the right half. */
function desktopTop(base: string, which: Board, headline: string, supporting: string): string {
  return `<table class="desk bg-field" ${TABLE} width="600" bgcolor="${LIGHT.field}" style="${FLUID}background:${LIGHT.field};"><tr><td class="inset" style="padding:32px ${INSET}px 16px ${INSET}px;"><table ${TABLE} width="100%"><tr><td valign="top" width="${TEXT_BLOCK_WIDTH}" style="width:${TEXT_BLOCK_WIDTH}px;">${lockup(base)}<div style="padding-top:28px;">${headlineBlock(headline, supporting, 32)}</div></td><td valign="top" align="right">${board(base, which, false)}</td></tr></table></td></tr><tr><td style="font-size:0;line-height:0;">${edge(base, false)}</td></tr></table>`;
}

/** Top for a phone: board in the corner beside the lockup, headline full width underneath. */
function phoneTop(base: string, which: Board, headline: string, supporting: string): string {
  const hidden = "display:none;max-height:0;overflow:hidden;mso-hide:all;";
  return `<table class="phone bg-field" ${TABLE} width="375" bgcolor="${LIGHT.field}" style="${FLUID}background:${LIGHT.field};${hidden}"><tr><td class="inset" style="padding:20px ${PHONE_INSET}px 16px ${PHONE_INSET}px;"><table ${TABLE} width="100%"><tr><td valign="top">${lockup(base)}</td><td valign="top" align="right" width="${PHONE_BOARD_WIDTH}" style="width:${PHONE_BOARD_WIDTH}px;">${board(base, which, true)}</td></tr><tr><td colspan="2" style="padding-top:20px;">${headlineBlock(headline, supporting, 28)}</td></tr></table></td></tr><tr><td style="font-size:0;line-height:0;">${edge(base, true)}</td></tr></table>`;
}

function footerBlock(reason: string, config: EmailConfig): { html: string; text: string } {
  const legal = `${config.legalLine} · ${config.supportAddress}`;
  const line = (value: string, extra = "") =>
    `<div class="c-muted" style="${extra}font-family:${FONT_SANS};font-size:13px;line-height:20px;color:${LIGHT.muted};">${esc(value)}</div>`;
  return {
    html: `<tr><td class="inset" style="padding:40px ${INSET}px 40px ${INSET}px;"><table ${TABLE} width="100%"><tr><td class="hairline" style="border-top:1px solid ${LIGHT.hairline};padding-top:20px;">${line(reason)}${line(legal, "padding-top:4px;")}</td></tr></table></td></tr>`,
    text: `${reason}\n${legal}`,
  };
}

/**
 * Renders one mail from its definition: Top (lockup, headline, board, curved edge), Body (the
 * parts, then the one button) and Footer. Adding a mail kind never touches this file.
 */
export function renderMail<D>(
  definition: MailDefinition<D>,
  data: D,
  config: EmailConfig = readEmailConfig(),
): RenderedMail {
  const subject = definition.subject(data);
  const preheader = definition.preheader(data);
  const supporting = definition.supportingLine(data);
  const bodyParts = definition.parts(data);
  const parts = bodyParts.map(renderPart);
  if (definition.button) {
    parts.push(buttonPart(definition.button.label, definition.button.target(data)));
  }
  const gap = bodyParts[0]?.part === "jersey" ? GAP_AFTER_JERSEY_OPENER : GAP;
  const base = config.assetBaseUrl;
  const footer = footerBlock(definition.footerReason, config);

  const bodyRows = parts
    .map((part) => `<tr><td style="padding-top:${gap}px;">${part.html}</td></tr>`)
    .join("");

  const html = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title><style>${stylesheet()}</style></head><body class="bg-canvas" style="margin:0;padding:0;background:${LIGHT.canvas};"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0;">${esc(preheader)}${"&nbsp;&zwnj;".repeat(40)}</div><table class="bg-canvas" ${TABLE} width="100%" bgcolor="${LIGHT.canvas}" style="background:${LIGHT.canvas};"><tr><td align="center"><table ${TABLE} width="600" style="${FLUID}"><tr><td>${desktopTop(base, definition.board, definition.headline, supporting)}${phoneTop(base, definition.board, definition.headline, supporting)}</td></tr><tr><td class="inset" style="padding:0 ${INSET}px;"><table ${TABLE} width="100%">${bodyRows}</table></td></tr>${footer.html}</table></td></tr></table></body></html>`;

  const text = [
    definition.headline,
    supporting,
    ...parts.map((part) => part.text),
    footer.text,
  ].join("\n\n");

  return { subject, preheader, html, text };
}
