import { StyleSheet, View } from "react-native";
import { Sheet } from "@/components/catalog-ui";
import { EmptyState } from "@/components/ui";
import { space } from "@/theme/tokens";

type WishlistSheetProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function WishlistSheet({ visible, onDismiss }: WishlistSheetProps) {
  return (
    <Sheet visible={visible} title="Ønske" onDismiss={onDismiss}>
      <View style={styles.body}>
        <EmptyState title="Ingen ønsker endnu" body="" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.gapMd,
  },
});
