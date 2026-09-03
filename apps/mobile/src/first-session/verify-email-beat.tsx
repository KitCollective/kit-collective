import { Modal, StyleSheet, Text, View } from "react-native";
import { Button, ButtonDock } from "@/components/ui";
import {
  VERIFY_EMAIL_BODY,
  VERIFY_EMAIL_CONTINUE,
  VERIFY_EMAIL_TITLE,
} from "@/first-session/door-copy";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type VerifyEmailBeatProps = {
  visible: boolean;
  onDismiss: () => void;
  onDismissVerify?: () => void;
  email?: string;
};

export function VerifyEmailBeat({
  visible,
  onDismiss,
  onDismissVerify,
  email,
}: VerifyEmailBeatProps) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const dismiss = onDismissVerify ?? onDismiss;

  return (
    <Modal
      animationType={reduceMotion ? "none" : "fade"}
      transparent
      visible={visible}
      onRequestClose={dismiss}
    >
      <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
        <View style={styles.body}>
          <Text style={[typography.title, { color: theme.contentPrimary }]}>
            {VERIFY_EMAIL_TITLE}
          </Text>
          <Text style={[typography.body, { color: theme.contentMuted }]}>{VERIFY_EMAIL_BODY}</Text>
          {email ? (
            <Text style={[typography.monoSm, { color: theme.contentSecondary }]}>{email}</Text>
          ) : null}
        </View>
        <ButtonDock>
          <Button label={VERIFY_EMAIL_CONTINUE} variant="primary" width="fill" onPress={dismiss} />
        </ButtonDock>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
  },
});
