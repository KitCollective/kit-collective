import { StyleSheet, Text, View } from "react-native";
import { color, space, type } from "@/theme/tokens";

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
    backgroundColor: color.canvas,
    padding: space.insetLg,
    gap: space.gapMd,
  },
  title: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: type.title.fontWeight,
    color: color.contentPrimary,
  },
  body: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.contentMuted,
  },
});
