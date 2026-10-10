import { StyleSheet, View } from "react-native";
import { Banner } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { space } from "@/theme/tokens";
import {
  PROFILE_PROMPT_DISMISS_LABEL,
  PROFILE_PROMPT_MESSAGE,
  PROFILE_PROMPT_OPEN_LABEL,
} from "./copy";

type ProfilePromptProps = {
  onOpen: () => void;
  onDismiss: () => void;
};

/** Dismissible prompt in Samling that offers the profile once the first jersey is saved. */
export function ProfilePrompt({ onOpen, onDismiss }: ProfilePromptProps) {
  return (
    <View style={styles.wrap} testID="profile-prompt">
      <Banner
        tone="info"
        message={PROFILE_PROMPT_MESSAGE}
        action={
          <View style={styles.actions}>
            <Button
              label={PROFILE_PROMPT_OPEN_LABEL}
              variant="tertiary"
              width="hug"
              testID="profile-prompt-open"
              onPress={onOpen}
            />
            <Button
              label={PROFILE_PROMPT_DISMISS_LABEL}
              variant="tertiary"
              width="hug"
              testID="profile-prompt-dismiss"
              onPress={onDismiss}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetSm,
  },
  actions: {
    flexDirection: "row",
    gap: space.gapSm,
  },
});
