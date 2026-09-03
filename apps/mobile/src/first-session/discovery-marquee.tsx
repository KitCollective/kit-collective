import type { CollectionShowcaseJersey } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { JerseyTile } from "@/components/jersey-tile";
import { resolveShowcasePhotoUrl } from "@/api/showcase";
import { space } from "@/theme/tokens";

const STAGE_TILT_DEG = 2.5;
const MARQUEE_DURATION_MS = 28000;
const TILE_GAP = space.gapMd;

type DiscoveryMarqueeProps = {
  jerseys: CollectionShowcaseJersey[];
  reduceMotion: boolean;
  tileWidth: number;
};

function splitColumns(jerseys: CollectionShowcaseJersey[]) {
  const left: CollectionShowcaseJersey[] = [];
  const right: CollectionShowcaseJersey[] = [];
  jerseys.forEach((jersey, index) => {
    if (index % 2 === 0) {
      left.push(jersey);
    } else {
      right.push(jersey);
    }
  });
  return { left, right };
}

function loopedJerseys(jerseys: CollectionShowcaseJersey[]) {
  if (jerseys.length === 0) {
    return jerseys;
  }
  return [...jerseys, ...jerseys];
}

function MarqueeColumn({
  jerseys,
  direction,
  reduceMotion,
  tileWidth,
}: {
  jerseys: CollectionShowcaseJersey[];
  direction: "up" | "down";
  reduceMotion: boolean;
  tileWidth: number;
}) {
  const travel = useSharedValue(0);
  const looped = loopedJerseys(jerseys);
  const columnHeight = looped.length * (tileWidth * (5 / 4) + TILE_GAP);

  useEffect(() => {
    if (reduceMotion || jerseys.length === 0) {
      cancelAnimation(travel);
      travel.value = 0;
      return;
    }

    const halfHeight = columnHeight / 2;
    travel.value = direction === "up" ? 0 : -halfHeight;
    travel.value = withRepeat(
      withTiming(direction === "up" ? -halfHeight : 0, {
        duration: MARQUEE_DURATION_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(travel);
    };
  }, [columnHeight, direction, jerseys.length, reduceMotion, travel]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: travel.value }],
  }));

  if (jerseys.length === 0) {
    return <View style={[styles.column, { width: tileWidth }]} />;
  }

  const content = (
    <View style={{ gap: TILE_GAP }}>
      {looped.map((jersey, index) => (
        <View key={`${jersey.id}-${index}`} style={{ width: tileWidth }}>
          <JerseyTile
            displayOnly
            photoSource={{ uri: resolveShowcasePhotoUrl(jersey.photos[0]!.photoUrl) }}
            clubLabel={jersey.clubLabel}
            seasonLabel={jersey.seasonLabel}
            typeLabel={KIT_TYPE_LABELS_DA[jersey.type]}
          />
        </View>
      ))}
    </View>
  );

  if (reduceMotion) {
    return <View style={[styles.column, { width: tileWidth }]}>{content}</View>;
  }

  return (
    <View style={[styles.column, { width: tileWidth, overflow: "hidden" }]}>
      <Animated.View style={animatedStyle}>{content}</Animated.View>
    </View>
  );
}

export function DiscoveryMarquee({ jerseys, reduceMotion, tileWidth }: DiscoveryMarqueeProps) {
  const { left, right } = splitColumns(jerseys);

  return (
    <View style={[styles.stage, !reduceMotion && styles.stageTilted]}>
      <View style={styles.columns}>
        <MarqueeColumn
          jerseys={left}
          direction="up"
          reduceMotion={reduceMotion}
          tileWidth={tileWidth}
        />
        <MarqueeColumn
          jerseys={right}
          direction="down"
          reduceMotion={reduceMotion}
          tileWidth={tileWidth}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.insetMd,
  },
  stageTilted: {
    transform: [{ rotate: `${STAGE_TILT_DEG}deg` }],
  },
  columns: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.gapMd,
    flex: 1,
  },
  column: {
    flex: 1,
    maxWidth: "48%",
  },
});
