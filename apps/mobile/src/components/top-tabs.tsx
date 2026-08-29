import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type TopTabsProps<T extends string> = {
  items: readonly [T, T];
  active: T;
  onChange: (value: T) => void;
};

export function TopTabs<T extends string>({ items, active, onChange }: TopTabsProps<T>) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={[styles.container, { borderBottomColor: theme.borderSubtle }]}>
      {items.map((item) => {
        const isActive = item === active;

        return (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(item)}
            style={styles.tab}
          >
            <Text
              style={[
                typography.body,
                { color: isActive ? theme.contentPrimary : theme.contentSecondary },
              ]}
            >
              {item}
            </Text>
            {isActive ? (
              <View style={[styles.underline, { backgroundColor: theme.fillPrimary }]} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: space.insetMd,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: space.insetSm,
  },
  underline: {
    position: "absolute",
    left: space.insetSm,
    right: space.insetSm,
    bottom: 0,
    height: 2,
  },
});
