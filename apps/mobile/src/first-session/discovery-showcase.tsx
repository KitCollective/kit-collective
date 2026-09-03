import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";
import { fetchShowcaseJerseys } from "@/api/showcase";
import { Button, ButtonDock } from "@/components/ui";
import {
  DISCOVERY_ADD_FIRST_LABEL,
  DISCOVERY_HAVE_ACCOUNT_LABEL,
} from "@/first-session/discovery-copy";
import { DiscoveryMarquee } from "@/first-session/discovery-marquee";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type DiscoveryShowcaseScreenProps = {
  onAddFirst: () => void;
  onHaveAccount: () => void;
};

export function DiscoveryShowcaseScreen({
  onAddFirst,
  onHaveAccount,
}: DiscoveryShowcaseScreenProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const tileWidth = (width - space.insetMd * 2 - space.gapMd) / 2;
  const [loading, setLoading] = useState(true);
  const [jerseys, setJerseys] = useState<
    Awaited<ReturnType<typeof fetchShowcaseJerseys>>["jerseys"]
  >([]);

  useEffect(() => {
    let cancelled = false;

    void fetchShowcaseJerseys()
      .then((body) => {
        if (!cancelled) {
          setJerseys(body.jerseys);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJerseys([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <View style={styles.stageRegion}>
        {loading ? (
          <ActivityIndicator color={theme.contentPrimary} />
        ) : (
          <DiscoveryMarquee jerseys={jerseys} reduceMotion={reduceMotion} tileWidth={tileWidth} />
        )}
      </View>
      <ButtonDock>
        <Button label={DISCOVERY_ADD_FIRST_LABEL} width="fill" onPress={onAddFirst} />
        <Button label={DISCOVERY_HAVE_ACCOUNT_LABEL} variant="tertiary" onPress={onHaveAccount} />
      </ButtonDock>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stageRegion: {
    flex: 1,
    justifyContent: "center",
  },
});
