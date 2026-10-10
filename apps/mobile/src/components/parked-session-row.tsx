import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useParkedRow } from "@/capture/parkedSession";
import { SessionSummaryRow } from "@/components/session-summary-row";
import { space } from "@/theme/tokens";

/**
 * Samling's one parked row (docs/design-system.md, Capture session, Revision 2026-10-09, item 3;
 * Paper *Add jersey / Gap 02*): what Gør resten færdig senere left behind. It reopens the bulk
 * overview and is gone once the session is finished or discarded.
 */
export function ParkedSessionRow() {
  const router = useRouter();
  const row = useParkedRow();

  if (!row) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <SessionSummaryRow
        testID="collection-parked-row"
        thumbUris={row.thumbUris}
        title={row.title}
        caption={row.caption}
        pillLabel={row.pill}
        onPress={() =>
          router.push({ pathname: "/(capture)/overview", params: { sessionId: row.sessionId } })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetSm,
  },
});
