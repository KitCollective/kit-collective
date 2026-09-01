import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { DrillHeader } from "@/components/profile-ui";
import { EmptyState } from "@/components/ui";
import { useTheme } from "@/theme/use-theme";

export default function SearchClubDrillScreen() {
  const { label } = useLocalSearchParams<{ clubId: string; label?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const title = typeof label === "string" && label.trim() ? label : "Klub";

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <DrillHeader title={title} onBack={() => router.back()} />
      <EmptyState
        title="Klubbens trøjer"
        body="Synlige trøjer for denne klub lander her, når katalog-drillen er klar."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
