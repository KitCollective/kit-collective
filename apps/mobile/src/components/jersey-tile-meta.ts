/** Pure meta-line formatter for JerseyTile — testable without react-native. */
export function jerseyTileMetaLine(seasonLabel: string, typeLabel: string): string {
  return `${seasonLabel} · ${typeLabel}`;
}
