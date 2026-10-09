import { useEffect } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { BRAND_MOMENTS } from "@/first-session/brand-moments";
import { type WallTile, wallColumns } from "@/first-session/wall-photos";
import { color, radius, space } from "@/theme/tokens";

const TILE_RATIO = 5 / 4;
const OVERSCAN = 1.4;

type WallColumnProps = {
  tiles: WallTile[];
  direction: "up" | "down";
  durationMs: number;
  tileWidth: number;
  viewportHeight: number;
  reduceMotion: boolean;
};

function WallColumn({
  tiles,
  direction,
  durationMs,
  tileWidth,
  viewportHeight,
  reduceMotion,
}: WallColumnProps) {
  const travel = useSharedValue(0);
  const tileHeight = tileWidth * TILE_RATIO;
  const setHeight = tiles.length * (tileHeight + space.gapMd);
  // Enough copies per half that the visible band never runs out of tiles.
  const copies = Math.max(1, Math.ceil(viewportHeight / Math.max(setHeight, 1)));
  const halfHeight = copies * setHeight;

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(travel);
      travel.set(0);
      return;
    }
    const from = direction === "up" ? 0 : -halfHeight;
    const to = direction === "up" ? -halfHeight : 0;
    travel.set(from);
    travel.set(withRepeat(withTiming(to, { duration: durationMs, easing: Easing.linear }), -1));
    return () => {
      cancelAnimation(travel);
    };
  }, [direction, durationMs, halfHeight, reduceMotion, travel]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: travel.get() }] }));
  const repeated = Array.from({ length: copies * 2 }, (_, copy) =>
    tiles.map((tile) => ({ tile, key: `${tile.id}-${copy}` })),
  ).flat();

  return (
    <View style={{ width: tileWidth, overflow: "hidden" }}>
      <Animated.View style={[style, { gap: space.gapMd }]}>
        {repeated.map(({ tile, key }) => (
          <Image
            key={key}
            source={tile.source}
            resizeMode="cover"
            style={{ width: tileWidth, height: tileHeight, borderRadius: radius.md }}
          />
        ))}
      </Animated.View>
    </View>
  );
}

type JerseyWallProps = {
  reduceMotion: boolean;
};

/**
 * Brand moment: Jersey wall (docs/design-system.md -> Motion -> Brand moments).
 * Three columns drift vertically, neighbours in opposite directions, the wall
 * tilted about 6 degrees. Reduce Motion: a still. Decorative, never tappable.
 */
export function JerseyWall({ reduceMotion }: JerseyWallProps) {
  const { width, height } = useWindowDimensions();
  const columns = wallColumns();
  const wallWidth = width * OVERSCAN;
  const tileWidth = (wallWidth - space.gapMd * 2) / 3;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.root, { backgroundColor: color.fillPrimary }]}
    >
      <View
        style={[
          styles.tilted,
          {
            width: wallWidth,
            height: height * OVERSCAN,
            transform: [{ rotate: `${BRAND_MOMENTS.wall.tiltDeg}deg` }],
          },
        ]}
      >
        {columns.map((tiles, index) => (
          <WallColumn
            key={tiles[0]?.id ?? index}
            tiles={tiles}
            direction={index % 2 === 0 ? "up" : "down"}
            durationMs={BRAND_MOMENTS.wall.columnDriftMs[index] ?? 27000}
            tileWidth={tileWidth}
            viewportHeight={height * OVERSCAN}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  tilted: {
    flexDirection: "row",
    gap: space.gapMd,
    justifyContent: "center",
  },
});
