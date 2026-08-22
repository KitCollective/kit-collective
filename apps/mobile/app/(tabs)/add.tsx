import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/theme/tokens";

export default function AddScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tilføj</Text>
      <Text style={styles.body}>
        Her kommer tilføjelsesflowet i næste skive. Ingen kamera eller fototilladelser
        på første opstart.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.text,
  },
  body: {
    fontSize: typography.body,
    color: colors.textMuted,
    lineHeight: 24,
  },
});
