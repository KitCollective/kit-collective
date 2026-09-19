import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { Sheet } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
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
  return (
    <Sheet visible={visible} title={title} sentence={consequence} onDismiss={onDismiss}>
      <Button
        label={confirmLabel}
        variant="destructive"
        width="fill"
        loading={loading}
        onPress={onConfirm}
      />
      <Button label="Annuller" variant="tertiary" width="fill" onPress={onDismiss} />
    </Sheet>
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
  sectionLabel: {
    paddingHorizontal: space.insetMd,
    paddingBottom: space.gapSm,
    textTransform: "uppercase",
  },
});
