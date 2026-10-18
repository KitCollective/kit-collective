import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { radius } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** docs/design-system.md → Foreign UserJersey detail → Button dock: a 54px `secondary` message Icon button. */
const WRITE_TO_PEER_BUTTON_SIZE = 54;
const ICON_SIZE = 24;

type WriteToPeerButtonProps = {
  /** Skriv til <handle>: the accessible name; the icon is not the only meaning. */
  name: string;
  onPress: () => void;
  testID?: string;
};

/**
 * The message Icon button beside **Send bud**. The Icon button primitive is 44 and has no
 * `secondary` fill, so this composes the 54px control from the `secondary` Button's tokens
 * (`fill.secondary`, `border.subtle`, `radius.sm`) until the lock names the 54 variant (design gap).
 */
export function WriteToPeerButton({ name, onPress, testID }: WriteToPeerButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.fillSecondary, borderColor: theme.borderSubtle },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name="chatbubble-outline"
        size={ICON_SIZE}
        color={theme.contentPrimary}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: WRITE_TO_PEER_BUTTON_SIZE,
    height: WRITE_TO_PEER_BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.9,
  },
});
