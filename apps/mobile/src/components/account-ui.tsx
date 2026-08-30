import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, ButtonDock, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  consequence: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
  loading?: boolean;
};

export function ConfirmSheet({
  visible,
  title,
  consequence,
  confirmLabel,
  onConfirm,
  onDismiss,
  loading = false,
}: ConfirmSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();

  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      transparent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <Pressable
        style={[styles.scrim, { backgroundColor: theme.scrim }]}
        onPress={onDismiss}
        accessibilityLabel="Luk"
      />
      <View
        style={[styles.sheet, { backgroundColor: theme.surfaceRaised, borderRadius: radius.lg }]}
      >
        <View style={styles.header}>
          <Text style={[typography.title, { color: theme.contentPrimary }]}>{title}</Text>
          <IconButton name="Luk" icon="close" onPress={onDismiss} />
        </View>
        <Text style={[typography.body, styles.consequence, { color: theme.contentSecondary }]}>
          {consequence}
        </Text>
        <ButtonDock>
          <Button
            label={confirmLabel}
            variant="destructive"
            width="fill"
            loading={loading}
            onPress={onConfirm}
          />
          <Button label="Annuller" variant="tertiary" width="fill" onPress={onDismiss} />
        </ButtonDock>
      </View>
    </Modal>
  );
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) {
    return phone;
  }

  const lastFour = digits.slice(-4);
  return `•• •• ${lastFour.slice(0, 2)} ${lastFour.slice(2)}`;
}

export function formatBirthday(isoDate: string | null | undefined): string | null {
  if (!isoDate) {
    return null;
  }

  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }

  return `${day}.${month}.${year}`;
}

export function linkedProviderLabel(provider: "google" | "facebook", linked: boolean): string {
  const name = provider === "google" ? "Google" : "Facebook";
  return linked ? `${name} · Tilknyttet` : `${name} · Ikke tilknyttet`;
}

export function SettingsSectionLabel({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Text style={[typography.mono, styles.sectionLabel, { color: theme.contentMuted }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
  },
  sheet: {
    marginTop: "auto",
    paddingTop: space.insetMd,
    paddingHorizontal: space.insetMd,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapSm,
    marginBottom: space.gapMd,
  },
  consequence: {
    marginBottom: space.gapLg,
  },
  sectionLabel: {
    paddingHorizontal: space.insetMd,
    paddingBottom: space.gapSm,
    textTransform: "uppercase",
  },
});
