import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteAccount, fetchCurrentUser, updateAccount } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import {
  ConfirmSheet,
  formatBirthday,
  linkedProviderLabel,
  maskPhone,
} from "@/components/account-ui";
import {
  DrillHeader,
  ListValueRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
  TextField,
} from "@/components/profile-ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function AccountSettingsScreen() {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, refreshUser, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(true);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [linkedAccounts, setLinkedAccounts] = useState<
    { provider: "google" | "facebook"; linked: boolean }[]
  >([]);
  const [editingPhone, setEditingPhone] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    try {
      const me = await fetchCurrentUser(accessToken);
      setEmail(me.email);
      setEmailVerified(me.emailVerified);
      setFullName(me.fullName ?? "");
      setPhone(me.phone ?? "");
      setBirthday(me.birthday ?? "");
      setLinkedAccounts(me.linkedAccounts);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const saveAccount = async () => {
    if (!accessToken) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateAccount(accessToken, {
        fullName: fullName.trim() === "" ? null : fullName.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        birthday: birthday.trim() === "" ? null : birthday.trim(),
      });
      await refreshUser();
      setEditingPhone(false);
    } catch {
      setError("Kunne ikke gemme kontooplysninger");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!accessToken) {
      return;
    }

    setDeleteLoading(true);
    try {
      await deleteAccount(accessToken);
      await signOut();
      setDeleteVisible(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader
          title="Kontoindstillinger"
          onBack={() => router.back()}
          trailing={
            <Pressable
              accessibilityRole="button"
              onPress={() => void saveAccount()}
              disabled={saving || loading}
              style={styles.saveAction}
            >
              <Text style={[typography.label, { color: theme.contentPrimary }]}>
                {saving ? "Gemmer…" : "Gem"}
              </Text>
            </Pressable>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text> : null}

        <ProfileSurfaceGroup>
          <ListValueRow
            title="E-mail"
            value={email}
            meta={emailVerified ? "Bekræftet" : undefined}
            actionLabel="Skift"
            onAction={() => router.push("/(tabs)/profile/skift-email")}
          />
          <ProfileRowDivider />
          {editingPhone ? (
            <View style={styles.fieldBlock}>
              <TextField
                label="Telefon (valgfri)"
                value={phone}
                onChangeText={setPhone}
                helper="Kun til login — vises aldrig på profil og bruges ikke til marketing."
              />
            </View>
          ) : (
            <ListValueRow
              title="Telefon"
              value={maskPhone(phone) ?? "Ikke angivet"}
              helper="Kun til login — vises aldrig på profil og bruges ikke til marketing."
              actionLabel="Skift"
              onAction={() => setEditingPhone(true)}
            />
          )}
        </ProfileSurfaceGroup>

        <ProfileSurfaceGroup>
          <View style={styles.fieldBlock}>
            <TextField
              label="Fulde navn"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              helper="Vises ikke på din profil."
            />
          </View>
          <ProfileRowDivider />
          <ListValueRow
            title="Fødselsdag"
            value={formatBirthday(birthday) ?? "Ikke angivet"}
            chevron
          />
        </ProfileSurfaceGroup>

        <ProfileSurfaceGroup>
          {linkedAccounts.map((account, index) => (
            <View key={account.provider}>
              {index > 0 ? <ProfileRowDivider /> : null}
              <ListValueRow
                title={account.provider === "google" ? "Google" : "Facebook"}
                value={linkedProviderLabel(account.provider, account.linked).split(" · ")[1]}
              />
            </View>
          ))}
          <ProfileRowDivider />
          <ListValueRow
            title="Skift adgangskode"
            onPress={() => router.push("/(tabs)/profile/skift-adgangskode")}
          />
          <ProfileRowDivider />
          <ListValueRow title="Slet min konto" onPress={() => setDeleteVisible(true)} />
        </ProfileSurfaceGroup>
      </ScrollView>

      <ConfirmSheet
        visible={deleteVisible}
        title="Slet min konto?"
        consequence="Din identitet og alle dine trøjer fjernes permanent. Dette kan ikke fortrydes."
        confirmLabel="Slet min konto"
        loading={deleteLoading || saving}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => setDeleteVisible(false)}
      />
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
  fieldBlock: {
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
  saveAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
