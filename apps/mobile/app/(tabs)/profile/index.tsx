import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveAvatarUrl } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { IdentityCard, ListNavigateRow, ProfileSurfaceGroup } from "@/components/profile-ui";
import { ScreenHeader } from "@/components/screen-header";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function ProfileHomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, accessToken } = useAuth();

  const tabBarPadding =
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd;

  const avatarHeaders =
    accessToken && user?.avatarUrl ? { Authorization: `Bearer ${accessToken}` } : undefined;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.fillSecondary, paddingBottom: tabBarPadding },
      ]}
    >
      <ScreenHeader title="Profil" />
      <ScrollView contentContainerStyle={styles.content}>
        {user ? (
          <IdentityCard
            handle={user.handle}
            avatarUri={resolveAvatarUrl(user.avatarUrl ?? null)}
            avatarHeaders={avatarHeaders}
            onEditPress={() => router.push("/(tabs)/profile/edit")}
          />
        ) : null}

        <ProfileSurfaceGroup>
          <ListNavigateRow
            title="Favoritter"
            meta="0 trøjer"
            icon="heart-outline"
            onPress={() => router.push("/(tabs)/profile/favoritter")}
          />
        </ProfileSurfaceGroup>

        <ProfileSurfaceGroup>
          <ListNavigateRow
            title="Indstillinger"
            icon="settings-outline"
            onPress={() => router.push("/(tabs)/profile/indstillinger")}
          />
          <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
          <ListNavigateRow
            title="Cookie-indstillinger"
            icon="shield-outline"
            onPress={() => router.push("/(tabs)/profile/cookie-indstillinger")}
          />
        </ProfileSurfaceGroup>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  content: {
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: space.insetMd + 22 + space.gapMd,
  },
});
