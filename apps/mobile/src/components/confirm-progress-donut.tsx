import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { sectionProgressTone } from "@/capture/confirmSectionProgress";
import { useTypography } from "@/theme/brand-fonts";
import { useTheme } from "@/theme/use-theme";

const SIZE = 44;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type ConfirmProgressDonutProps = {
  filled: number;
  required: number;
};

export function ConfirmProgressDonut({ filled, required }: ConfirmProgressDonutProps) {
  const theme = useTheme();
  const typography = useTypography();
  const tone = sectionProgressTone(filled, required);
  const ratio = required <= 0 ? 0 : Math.min(1, filled / required);
  const dash = CIRCUMFERENCE * ratio;
  const stroke =
    tone === "complete" ? theme.fillPrimary : tone === "partial" ? theme.warning : undefined;

  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={SIZE} height={SIZE} style={styles.ring}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={theme.fillSecondary}
          strokeWidth={STROKE}
          fill="none"
        />
        {stroke ? (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={stroke}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ) : null}
      </Svg>
      <Text style={[typography.monoSm, styles.count, { color: theme.contentPrimary }]}>
        {filled}/{required}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
  },
  count: {
    textAlign: "center",
  },
});
