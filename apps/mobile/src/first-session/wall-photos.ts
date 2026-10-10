import type { ImageSourcePropType } from "react-native";
import type { DemoExampleId } from "@/first-session/session";

export type WallTile = {
  id: string;
  source: ImageSourcePropType;
};

/**
 * Bundled PLACEHOLDER tiles (flat colour, labelled PLACEHOLDER in the image).
 * Replace with KitCollective's own photos when Nicklas delivers them.
 * The first three double as the example jerseys; one example per wall column.
 */
export const WALL_TILES: readonly WallTile[] = [
  // SAFETY: Metro static assets; the PNGs are committed under apps/mobile/assets/first-session.
  { id: "wall-01", source: require("../../assets/first-session/placeholder-wall-01.png") },
  { id: "wall-02", source: require("../../assets/first-session/placeholder-wall-02.png") },
  { id: "wall-03", source: require("../../assets/first-session/placeholder-wall-03.png") },
  { id: "wall-04", source: require("../../assets/first-session/placeholder-wall-04.png") },
  { id: "wall-05", source: require("../../assets/first-session/placeholder-wall-05.png") },
  { id: "wall-06", source: require("../../assets/first-session/placeholder-wall-06.png") },
  { id: "wall-07", source: require("../../assets/first-session/placeholder-wall-07.png") },
  { id: "wall-08", source: require("../../assets/first-session/placeholder-wall-08.png") },
  { id: "wall-09", source: require("../../assets/first-session/placeholder-wall-09.png") },
];

const EXAMPLE_TILE_INDEX: Record<DemoExampleId, number> = {
  "example-1": 0,
  "example-2": 1,
  "example-3": 2,
};

export function examplePhoto(id: DemoExampleId): ImageSourcePropType {
  const tile = WALL_TILES[EXAMPLE_TILE_INDEX[id]];
  if (!tile) {
    throw new Error(`Missing wall tile for ${id}`);
  }
  return tile.source;
}

/** Three drifting columns; index % 3 keeps one example in each column. */
export function wallColumns(): WallTile[][] {
  const columns: WallTile[][] = [[], [], []];
  WALL_TILES.forEach((tile, index) => {
    columns[index % 3]?.push(tile);
  });
  return columns;
}
