import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fetchCollectionJerseys } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { PrimaryButton } from "@/components/ui";
import { colors, spacing, typography } from "@/theme/tokens";

export default function CollectionScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCollection() {
      if (!accessToken) {
        return;
      }

      try {
        await fetchCollectionJerseys(accessToken);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCollection();

    return () => {
      active = false;
    };
  }, [accessToken]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Samling</Text>
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Ingen trøjer endnu</Text>
        <Text style={styles.emptyBody}>
          Tilføj din første trøje for at starte samlingen.
        </Text>
        <PrimaryButton
          label="Tilføj trøje"
          onPress={() => router.push("/(tabs)/add")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.md,
  },
});
