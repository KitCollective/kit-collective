import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { DrillHeader } from "@/components/profile-ui";
import { EmptyState } from "@/components/ui";
import { useTheme } from "@/theme/use-theme";

export default function SearchKitDrillStubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kitId?: string; label?: string }>();
  const title = typeof params.label === "string" && params.label.trim() ? params.label : "Kit";
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <DrillHeader title={title} onBack={() => router.back()} />
      <EmptyState
        title="Kit"
        body="Denne katalogside åbner, når Kit-drill lander. Klub- og spillerdrills er live."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
