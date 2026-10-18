import { StyleSheet, Text, View } from "react-native";
import { Sheet } from "@/components/catalog-ui";
import {
  ListDangerRow,
  ListNavigateRow,
  ListPeerStubRow,
  ProfileRowDivider,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import type { ConversationMore } from "@/inbox/thread-view-model";
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
        <ProfileSurfaceGroup>
          <ListNavigateRow
            title={more.rows.report.title}
            onPress={onReport}
            testID="conversation-more-report"
          />
          <ProfileRowDivider />
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

const styles = StyleSheet.create({
  body: {
    gap: space.gapLg,
  },
});
