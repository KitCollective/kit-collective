import { type } from "@/theme/tokens";

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

/** Resolved typography roles with system-ui fallback when brand webfonts fail. */
export function resolveTypeRoles(
  brandEnabled: boolean,
  systemFallback = "system-ui",
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
  };
}
