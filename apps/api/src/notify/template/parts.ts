import { esc } from "./escape.js";
import { FONT_MONO, FONT_SANS, LIGHT } from "./tokens.js";
import type { BodyPart, PartOutput } from "./types.js";

/**
 * The seven body parts. Each returns the inner HTML of one body row plus its text-body lines.
 * Colours are inline (light) with a class that the dark media block overrides.
 */

export function codePart(code: string): PartOutput {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="bg-block" align="center" bgcolor="${LIGHT.block}" style="background:${LIGHT.block};border-radius:12px;padding:24px 16px;font-family:${FONT_MONO};font-size:44px;line-height:52px;font-weight:500;letter-spacing:0.14em;color:${LIGHT.primary};" ><span class="c-primary" style="color:${LIGHT.primary};">${esc(code)}</span></td></tr></table>`,
    text: code,
  };
}

export function jerseyPart(input: { photoUrl?: string; club: string; meta: string }): PartOutput {
  const photo = input.photoUrl
    ? `<img src="${esc(input.photoUrl)}" width="96" height="120" alt="${esc(input.club)}" style="display:block;width:96px;height:120px;border-radius:12px;object-fit:cover;">`
    : `<div class="bg-block" style="width:96px;height:120px;border-radius:12px;background:${LIGHT.block};"></div>`;
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="96" valign="top" style="width:96px;">${photo}</td><td valign="middle" style="padding-left:16px;font-family:${FONT_SANS};"><div class="c-primary" style="font-size:20px;line-height:26px;font-weight:600;color:${LIGHT.primary};">${esc(input.club)}</div><div class="c-secondary" style="font-size:14px;line-height:20px;color:${LIGHT.secondary};">${esc(input.meta)}</div></td></tr></table>`,
    text: `${input.club}\n${input.meta}`,
  };
}

export function factRowsPart(rows: { label: string; value: string; mono?: boolean }[]): PartOutput {
  const html = rows
    .map((row, index) => {
      const edge = `border-top:1px solid ${LIGHT.hairline};${index === rows.length - 1 ? `border-bottom:1px solid ${LIGHT.hairline};` : ""}`;
      return `<tr><td class="hairline c-secondary" height="56" style="height:56px;${edge}font-family:${FONT_SANS};font-size:16px;line-height:24px;color:${LIGHT.secondary};">${esc(row.label)}</td><td class="hairline c-primary" align="right" height="56" style="height:56px;${edge}font-family:${row.mono ? FONT_MONO : FONT_SANS};font-size:${row.mono ? 20 : 16}px;line-height:24px;font-weight:500;color:${LIGHT.primary};">${esc(row.value)}</td></tr>`;
    })
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${html}</table>`,
    text: rows.map((row) => `${row.label}: ${row.value}`).join("\n"),
  };
}

export function messagePart(message: string): PartOutput {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="bg-block c-primary" bgcolor="${LIGHT.block}" style="background:${LIGHT.block};border-radius:12px;padding:16px;font-family:${FONT_SANS};font-size:16px;line-height:24px;color:${LIGHT.primary};">${esc(message)}</td></tr></table>`,
    text: message,
  };
}

export function textPart(text: string): PartOutput {
  return {
    html: `<div class="c-secondary" style="font-family:${FONT_SANS};font-size:16px;line-height:24px;color:${LIGHT.secondary};">${esc(text)}</div>`,
    text,
  };
}

export function notePart(note: string): PartOutput {
  return {
    html: `<div class="c-muted" style="font-family:${FONT_SANS};font-size:14px;line-height:20px;color:${LIGHT.muted};">${esc(note)}</div>`,
    text: note,
  };
}

/** Full width, 52 high. A table cell button, so Outlook paints it too. */
export function buttonPart(label: string, url: string): PartOutput {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="btn" align="center" bgcolor="${LIGHT.buttonFill}" height="52" style="height:52px;background:${LIGHT.buttonFill};border-radius:8px;"><a class="btn-link" href="${esc(url)}" style="display:block;line-height:52px;font-family:${FONT_SANS};font-size:16px;font-weight:500;color:${LIGHT.buttonText};text-decoration:none;">${esc(label)}</a></td></tr></table>`,
    text: `${label}: ${url}`,
  };
}

export function renderPart(part: BodyPart): PartOutput {
  switch (part.part) {
    case "code":
      return codePart(part.code);
    case "jersey":
      return jerseyPart(part);
    case "factRows":
      return factRowsPart(part.rows);
    case "message":
      return messagePart(part.text);
    case "text":
      return textPart(part.text);
    case "note":
      return notePart(part.text);
    default: {
      // A Button smuggled into `parts` (the type forbids it): a mail has at most one, from `button`.
      const unsupported: never = part;
      throw new Error(`Unsupported body part: ${typeof unsupported}`);
    }
  }
}
