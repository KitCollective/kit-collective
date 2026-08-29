import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type DrillHeaderProps = {
  title: string;
  onBack: () => void;
  trailing?: ReactNode;
};

export function DrillHeader({ title, onBack, trailing }: DrillHeaderProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.drillHeader}>
      <IconButton name="Tilbage" icon="arrow-back" onPress={onBack} />
      <Text style={[typography.title, styles.drillTitle, { color: theme.contentPrimary }]}>
        {title}
      </Text>
      <View style={styles.trailing}>{trailing ?? <View style={styles.trailingSpacer} />}</View>
    </View>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  helper?: string;
  helperTone?: "secondary" | "danger";
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
};

export function TextField({
  label,
  value,
  onChangeText,
  helper,
  helperTone = "secondary",
  multiline = false,
  autoCapitalize = "none",
}: TextFieldProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.field}>
      <Text style={[typography.labelSm, { color: theme.contentPrimary }]}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.input,
          typography.body,
          multiline && styles.inputMultiline,
          {
            borderColor: helperTone === "danger" ? theme.danger : theme.borderSubtle,
            color: theme.contentPrimary,
            backgroundColor: theme.surface,
          },
        ]}
        placeholderTextColor={theme.contentMuted}
      />
      {helper ? (
        <Text
          style={[
            typography.caption,
            { color: helperTone === "danger" ? theme.danger : theme.contentSecondary },
          ]}
        >
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

type ListNavigateRowProps = {
  title: string;
  meta?: string;
  icon: IoniconName;
  onPress: () => void;
};

export function ListNavigateRow({ title, meta, icon, onPress }: ListNavigateRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={theme.contentPrimary} accessibilityElementsHidden />
      <View style={styles.rowBody}>
        <Text style={[typography.body, { color: theme.contentPrimary }]}>{title}</Text>
        {meta ? <Text style={[typography.mono, { color: theme.contentMuted }]}>{meta}</Text> : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.contentMuted}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

type IdentityCardProps = {
  handle: string;
  avatarUri?: string | null;
  avatarHeaders?: Record<string, string>;
  onEditPress: () => void;
};

export function IdentityCard({ handle, avatarUri, avatarHeaders, onEditPress }: IdentityCardProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View
      style={[
        styles.identityCard,
        { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
      ]}
    >
      <View style={styles.identityRow}>
        <Avatar handle={handle} uri={avatarUri} uriHeaders={avatarHeaders} size="lg" />
        <Text style={[typography.headingSm, { color: theme.contentPrimary, flex: 1 }]}>
          {handle}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Rediger profil"
        onPress={onEditPress}
        style={({ pressed }) => [
          styles.editButton,
          {
            backgroundColor: theme.fillSecondary,
            borderColor: theme.borderSubtle,
          },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[typography.label, { color: theme.contentPrimary }]}>Rediger profil</Text>
      </Pressable>
    </View>
  );
}

type AvatarChangeRowProps = {
  handle: string;
  avatarUri?: string | null;
  avatarHeaders?: Record<string, string>;
  onPress: () => void;
};

export function AvatarChangeRow({
  handle,
  avatarUri,
  avatarHeaders,
  onPress,
}: AvatarChangeRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        styles.avatarRow,
        { borderColor: theme.borderSubtle },
        pressed && styles.pressed,
      ]}
    >
      <Avatar handle={handle} uri={avatarUri} uriHeaders={avatarHeaders} size="md" />
      <Text style={[typography.body, { color: theme.contentPrimary, flex: 1 }]}>Skift foto</Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.contentMuted}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export function ProfileSurfaceGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderSubtle,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  drillHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetMd,
    gap: space.gapSm,
  },
  drillTitle: {
    flex: 1,
    textAlign: "center",
  },
  trailing: {
    minWidth: 44,
    alignItems: "flex-end",
  },
  trailingSpacer: {
    width: 44,
    height: 44,
  },
  field: {
    gap: space.gapSm,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
  inputMultiline: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
  avatarRow: {
    borderBottomWidth: 1,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.9,
  },
  identityCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.insetMd,
    gap: space.gapMd,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  editButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.insetMd,
  },
  group: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
});
