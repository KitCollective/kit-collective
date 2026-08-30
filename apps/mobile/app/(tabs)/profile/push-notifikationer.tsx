import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DrillHeader } from "@/components/profile-ui";
import { EmptyState } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

function SettingsShellScreen({ title }: { title: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title={title} onBack={() => router.back()} />
      </View>
      <EmptyState title="Kommer snart" body="Du kan snart styre push-notifikationer her." />
    </View>
  );
}

export default function PushNotifikationerScreen() {
  return <SettingsShellScreen title="Push-notifikationer" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
});
