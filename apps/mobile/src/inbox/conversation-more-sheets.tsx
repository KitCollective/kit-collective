import { StyleSheet, Text, View } from "react-native";
import { Sheet } from "@/components/catalog-ui";
import {
  ListDangerRow,
  ListNavigateRow,
  ListPeerStubRow,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { Button } from "@/components/ui";
import type { ConversationConfirmCopy, ConversationMore } from "@/inbox/thread-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConversationMoreSheetProps = {
  visible: boolean;
  more: ConversationMore;
  onDismiss: () => void;
  onModalHide: () => void;
  onOpenProfile: () => void;
  onReport: () => void;
  onBlock: () => void;
  onDelete: () => void;
};

/**
 * Conversation → More (docs/design-system.md, Revision 2026-10-10): the other Collector's
 * profile row, Rapportér and Blokér as List rows, Slet samtale as `danger`, then the caption.
 * Rapportér is an action, not a drill, but the lock names no action-row variant, so it uses
 * `navigate` chrome (flagged).
 */
export function ConversationMoreSheet({
  visible,
  more,
  onDismiss,
  onModalHide,
  onOpenProfile,
  onReport,
  onBlock,
  onDelete,
}: ConversationMoreSheetProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Sheet visible={visible} title="Mere" onDismiss={onDismiss} onModalHide={onModalHide}>
      <View style={styles.body} testID="conversation-more-sheet">
        {/* ListPeerStubRow takes no testID; the wrapper gives the Device flow an id to tap. */}
        <View testID="conversation-more-profile" collapsable={false}>
          <ProfileSurfaceGroup>
            <ListPeerStubRow
              handle={more.profile.handle}
              meta={more.profile.meta}
              onPress={onOpenProfile}
            />
          </ProfileSurfaceGroup>
        </View>
        {/* One group per row: the navigate row has no hairline to divide two rows in one group. */}
        <ProfileSurfaceGroup>
          <ListNavigateRow
            title={more.rows.report.title}
            onPress={onReport}
            testID="conversation-more-report"
          />
        </ProfileSurfaceGroup>
        <ProfileSurfaceGroup>
          <ListNavigateRow
            title={more.rows.block.title}
            onPress={onBlock}
            testID="conversation-more-block"
          />
        </ProfileSurfaceGroup>
        <ProfileSurfaceGroup>
          <ListDangerRow
            title={more.rows.delete.title}
            icon="trash-outline"
            onPress={onDelete}
            testID="conversation-more-delete"
          />
        </ProfileSurfaceGroup>
        <Text style={[typography.caption, { color: theme.contentSecondary }]}>{more.caption}</Text>
      </View>
    </Sheet>
  );
}

type ConversationConfirmSheetProps = {
  visible: boolean;
  copy: ConversationConfirmCopy;
  loading: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
};

/** Blokér / Slet samtale `confirm`: title, consequence, `destructive` action and a quiet way out. */
export function ConversationConfirmSheet({
  visible,
  copy,
  loading,
  onConfirm,
  onDismiss,
}: ConversationConfirmSheetProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Sheet visible={visible} title={copy.title} onDismiss={onDismiss}>
      <View style={styles.body} testID="conversation-confirm-sheet">
        <Text style={[typography.body, { color: theme.contentSecondary }]}>{copy.consequence}</Text>
        <View style={styles.actions}>
          <Button
            label={copy.confirmLabel}
            variant="destructive"
            width="fill"
            loading={loading}
            onPress={onConfirm}
            testID="conversation-confirm-submit"
          />
          <Button
            label={copy.keepLabel}
            variant="tertiary"
            width="fill"
            disabled={loading}
            onPress={onDismiss}
            testID="conversation-confirm-keep"
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.gapLg,
  },
  actions: {
    gap: space.gapSm,
  },
});
