import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import {
  type NumberEmblemSize,
  type NumberEmblemState,
  numberEmblemStyle,
} from "@/components/number-emblem-style";
import { useTypography } from "@/theme/brand-fonts";
import { useTheme } from "@/theme/use-theme";

type NumberEmblemProps = {
  size: NumberEmblemSize;
  state: NumberEmblemState;
  /** One or two digits. Ignored on the add state. */
  number?: number;
};

/**
 * Number emblem (docs/design-system.md → Components → Number emblem): a rounded tile that
 * shows a shirt number as an object. Not an accessibility element itself; the number is a
 * Text child so the List row that leads with it reads it.
 */
export function NumberEmblem({ size, state, number }: NumberEmblemProps) {
  const theme = useTheme();
  const typography = useTypography();
  const style = numberEmblemStyle(size, state, theme, typography);

  return (
    <View style={style.tile}>
      {style.numeral ? (
        <Text allowFontScaling={style.allowFontScaling} style={style.numeral}>
          {number}
        </Text>
      ) : null}
      {style.icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="add" size={style.icon.size} color={style.icon.color} />
        </View>
      ) : null}
    </View>
  );
}
