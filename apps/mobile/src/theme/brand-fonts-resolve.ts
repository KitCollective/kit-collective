import { fontFamily, type } from "@/theme/tokens";

export type TypeRoleStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
};

export type ResolvedTypeRoles = {
  [K in keyof typeof type]: TypeRoleStyle;
};

/** system-ui fallback when brand webfonts fail (docs/design-system.md Typography). */
export function resolveFontFamily(
  brandFamily: string,
  brandEnabled: boolean,
  systemFallback = "system-ui",
): string {
  if (brandEnabled) {
    return brandFamily;
  }

  return systemFallback;
}

function resolveTypeRole(
  role: (typeof type)[keyof typeof type],
  brandEnabled: boolean,
  systemFallback: string,
): TypeRoleStyle {
  return {
    ...role,
    fontFamily: resolveFontFamily(role.fontFamily, brandEnabled, systemFallback),
  };
}

/**
 * Numeral roles (docs/design-system.md Typography → Numerals): Saira Extra Condensed 700,
 * and when only that webfont fails, Archivo 700 at the same size. Size and line height
 * never change with the face.
 */
function resolveNumeralRole(
  role: (typeof type)[keyof typeof type],
  brandEnabled: boolean,
  numeralEnabled: boolean,
  systemFallback: string,
): TypeRoleStyle {
  if (numeralEnabled) {
    return { ...role };
  }
  return {
    ...role,
    fontFamily: resolveFontFamily(fontFamily.displayBold, brandEnabled, systemFallback),
  };
}

/** Resolved typography roles with system-ui fallback when brand webfonts fail. */
export function resolveTypeRoles(
  brandEnabled: boolean,
  systemFallback = "system-ui",
  numeralEnabled = brandEnabled,
): ResolvedTypeRoles {
  return {
    displayLarge: resolveTypeRole(type.displayLarge, brandEnabled, systemFallback),
    display: resolveTypeRole(type.display, brandEnabled, systemFallback),
    title: resolveTypeRole(type.title, brandEnabled, systemFallback),
    section: resolveTypeRole(type.section, brandEnabled, systemFallback),
    headingSm: resolveTypeRole(type.headingSm, brandEnabled, systemFallback),
    body: resolveTypeRole(type.body, brandEnabled, systemFallback),
    label: resolveTypeRole(type.label, brandEnabled, systemFallback),
    labelSm: resolveTypeRole(type.labelSm, brandEnabled, systemFallback),
    caption: resolveTypeRole(type.caption, brandEnabled, systemFallback),
    captionSm: resolveTypeRole(type.captionSm, brandEnabled, systemFallback),
    mono: resolveTypeRole(type.mono, brandEnabled, systemFallback),
    monoSm: resolveTypeRole(type.monoSm, brandEnabled, systemFallback),
    numeral32: resolveNumeralRole(type.numeral32, brandEnabled, numeralEnabled, systemFallback),
    numeral38: resolveNumeralRole(type.numeral38, brandEnabled, numeralEnabled, systemFallback),
    numeral40: resolveNumeralRole(type.numeral40, brandEnabled, numeralEnabled, systemFallback),
    numeral44: resolveNumeralRole(type.numeral44, brandEnabled, numeralEnabled, systemFallback),
  };
}
