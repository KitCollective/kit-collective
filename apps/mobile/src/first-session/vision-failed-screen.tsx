import { PHOTO_ROLES } from "@kit/domain";
import { useMemo } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadPersistedCaptureSession } from "@/capture/captureFlow";
import { getActiveDraft, photoUriForRole } from "@/capture/captureSession";
import { OnDarkButton } from "@/first-session/on-dark-button";
import {
  VISION_FAILED_BODY,
  VISION_FAILED_FILL_SELF_LABEL,
  VISION_FAILED_TITLE,
  VISION_FAILED_TRY_ANOTHER_LABEL,
} from "@/first-session/vision-failed-copy";
import { stageRectFor, visionStageStyles } from "@/first-session/vision-stage";
import { useTypography } from "@/theme/brand-fonts";
import { color, space } from "@/theme/tokens";

type VisionFailedScreenProps = {
  captureSessionId: string | null;
  /** Opens the door; the photo carries on to jersey details. */
  onFillSelf: () => void;
  /** Back to the source sheet. */
  onTryAnother: () => void;
};

/**
 * Own photo only: Vision could not recognise the jersey. The photo stays on the
 * 4:5 stage, the message says what happened, and both ways out sit on this
 * screen. The error uses the danger token on border and text only. On a dark
 * plate in both appearances, like the demo.
 */
export function VisionFailedScreen({
  captureSessionId,
  onFillSelf,
  onTryAnother,
}: VisionFailedScreenProps) {
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stage = stageRectFor(width, insets.top + space.insetLg);

  const photoUri = useMemo(() => {
    const state = captureSessionId ? loadPersistedCaptureSession(captureSessionId) : null;
    const draft = state ? getActiveDraft(state) : null;
    if (!draft) {
      return null;
    }
    for (const role of PHOTO_ROLES) {
      const uri = photoUriForRole(draft, role);
      if (uri) {
        return uri;
      }
    }
    return null;
  }, [captureSessionId]);

  return (
    <View style={[styles.screen, { backgroundColor: color.fillPrimary }]}>
      <View
        testID="vision-failed-stage"
        style={[
          visionStageStyles.stage,
          styles.stageBorder,
          { left: stage.x, top: stage.y, width: stage.width, height: stage.height },
        ]}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            resizeMode="cover"
            style={visionStageStyles.stageImage}
          />
        ) : null}
      </View>

      <View
        style={[visionStageStyles.rows, { top: stage.y + stage.height + space.insetLg }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        <Text style={[typography.title, { color: color.danger }]}>{VISION_FAILED_TITLE}</Text>
        <Text style={[typography.body, { color: color.contentInverse }]}>{VISION_FAILED_BODY}</Text>
      </View>

      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, space.insetMd) }]}>
        <View style={styles.dockStack}>
          <OnDarkButton
            label={VISION_FAILED_FILL_SELF_LABEL}
            testID="vision-failed-fill-self"
            variant="primary"
            onPress={onFillSelf}
          />
          <OnDarkButton
            label={VISION_FAILED_TRY_ANOTHER_LABEL}
            testID="vision-failed-try-another"
            variant="secondary"
            onPress={onTryAnother}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stageBorder: {
    borderWidth: 1,
    borderColor: color.danger,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.insetLg,
  },
  dockStack: {
    gap: space.gapMd,
  },
});
