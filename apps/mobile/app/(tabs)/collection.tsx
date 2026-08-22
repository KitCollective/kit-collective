import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { fetchCollectionJerseys } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { Button, EmptyState } from "@/components/ui";
import { color, space, type } from "@/theme/tokens";

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
        <ActivityIndicator color={color.fillPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Samling</Text>
      <EmptyState
        title="Ingen trøjer endnu"
        body="Tilføj din første trøje for at starte samlingen."
        action={
          <Button
            label="Tilføj trøje"
            variant="primary"
            onPress={() => router.push("/(tabs)/add")}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
    padding: space.insetLg,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.canvas,
  },
  title: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: type.title.fontWeight,
    color: color.contentPrimary,
    marginBottom: space.insetLg,
  },
});
