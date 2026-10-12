import type { ResolvedTypeRoles, TypeRoleStyle } from "@/theme/brand-fonts-resolve";
import type { ThemeColors } from "@/theme/tokens";

export type NumberEmblemSize = "md" | "lg";
export type NumberEmblemState = "selected" | "rest" | "add";

/** docs/design-system.md → Number emblem: radius 10 on both variants (not on the radius scale). */
export const NUMBER_EMBLEM_RADIUS = 10;

const TILE_SIZE: Record<NumberEmblemSize, number> = { md: 44, lg: 52 };
const NUMERAL_ROLE: Record<NumberEmblemSize, "numeral32" | "numeral38"> = {
  md: "numeral32",
  lg: "numeral38",
};

/** Plus glyph on the add state. The lock gives no size or colour; flagged as a gap. */
const ADD_ICON_SIZE = 24;

export type NumberEmblemTileStyle = {
  width: number;
  height: number;
  borderRadius: number;
  alignItems: "center";
  justifyContent: "center";
  borderWidth: number;
  borderStyle?: "dashed";
  borderColor?: string;
  backgroundColor?: string;
};

export type NumberEmblemNumeralStyle = TypeRoleStyle & { color: string };

export type NumberEmblemStyle = {
  tile: NumberEmblemTileStyle;
  /** Null on the add state: no numeral. */
  numeral: NumberEmblemNumeralStyle | null;
  /** Null unless the state is add. */
  icon: { size: number; color: string } | null;
  /** The tile is fixed; the numeral never follows Dynamic Type. */
  allowFontScaling: false;
};

export function numberEmblemStyle(
  size: NumberEmblemSize,
  state: NumberEmblemState,
  colors: ThemeColors,
  typography: ResolvedTypeRoles,
): NumberEmblemStyle {
  const dimension = TILE_SIZE[size];
  const base = {
    width: dimension,
    height: dimension,
    borderRadius: NUMBER_EMBLEM_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  } as const;

  if (state === "add") {
    return {
      tile: {
        ...base,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.borderSubtle,
      },
      numeral: null,
      icon: { size: ADD_ICON_SIZE, color: colors.contentSecondary },
      allowFontScaling: false,
    };
  }

  const selected = state === "selected";
  return {
    tile: {
      ...base,
      borderWidth: 0,
      backgroundColor: selected ? colors.fillPrimary : colors.fillSecondary,
    },
    numeral: {
      ...typography[NUMERAL_ROLE[size]],
      color: selected ? colors.contentInverse : colors.contentPrimary,
    },
    icon: null,
    allowFontScaling: false,
  };
}
