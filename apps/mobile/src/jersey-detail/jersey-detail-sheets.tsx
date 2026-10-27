import type { CollectionJersey } from "@kit/api-contract";
import { Image, StyleSheet, Text, View } from "react-native";
import { resolvePhotoUrl } from "@/api/collection";
import { Sheet } from "@/components/catalog-ui";
import { ListDangerRow } from "@/components/profile-ui";
import { Button } from "@/components/ui";
import { jerseyDeleteConfirmCopy } from "@/jersey-detail/jersey-detail-view-model";
import { THUMB_HEIGHT, THUMB_WIDTH } from "@/jersey-detail/jersey-photos";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type MoreSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onModalHide: () => void;
  onDelete: () => void;
};

/**
 * More: Slet trøjen as a `danger` row. There is no edit row: every fact is edited where it is
 * shown. Adding a photo is the thumb strip's tile, not a row here. The `danger` row keeps its icon
 * because the lock's `danger` variant is "icon + label, never color alone".
 */
export function JerseyMoreSheet({ visible, onDismiss, onModalHide, onDelete }: MoreSheetProps) {
  return (
    <Sheet visible={visible} title="Mere" onDismiss={onDismiss} onModalHide={onModalHide}>
      <ListDangerRow
        title="Slet trøjen"
        icon="trash-outline"
        onPress={onDelete}
        testID="jersey-detail-more-delete"
      />
    </Sheet>
  );
}

type DeleteConfirmSheetProps = {
  visible: boolean;
  jersey: CollectionJersey;
  accessToken: string | null;
  loading: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
};

/**
 * Delete confirmation: shows the jersey and what happens. The `destructive` Button and the quiet
 * Behold live only here (docs/design-system.md -> Own UserJersey detail).
 */
export function JerseyDeleteConfirmSheet({
  visible,
  jersey,
  accessToken,
  loading,
  onConfirm,
  onDismiss,
}: DeleteConfirmSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const copy = jerseyDeleteConfirmCopy(jersey);
  const front = jersey.photos[0];

  return (
    <Sheet visible={visible} title={copy.title} onDismiss={onDismiss}>
      <View style={styles.body}>
        <View
          style={styles.jersey}
          accessible
          accessibilityLabel={`${copy.jerseyTitle}, ${copy.jerseyMeta}`}
        >
          <View style={[styles.thumb, { backgroundColor: theme.fillSecondary }]}>
            {front ? (
              <Image
                source={{
                  uri: resolvePhotoUrl(front.photoUrl, "grid"),
                  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                }}
                style={styles.thumbImage}
                resizeMode="cover"
                accessibilityElementsHidden
              />
            ) : null}
          </View>
          <View style={styles.jerseyText}>
            <Text style={[typography.label, { color: theme.contentPrimary }]} numberOfLines={2}>
              {copy.jerseyTitle}
            </Text>
            <Text style={[typography.mono, { color: theme.contentSecondary }]}>
              {copy.jerseyMeta}
            </Text>
          </View>
        </View>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>{copy.consequence}</Text>
        <View style={styles.actions}>
          <Button
            label={copy.confirmLabel}
            variant="destructive"
            width="fill"
            loading={loading}
            onPress={onConfirm}
            testID="jersey-detail-delete-confirm"
          />
          <Button
            label={copy.keepLabel}
            variant="tertiary"
            width="fill"
            disabled={loading}
            onPress={onDismiss}
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
  jersey: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  jerseyText: {
    flex: 1,
    gap: 2,
  },
  actions: {
    gap: space.gapSm,
  },
});
