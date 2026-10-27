/**
 * The image files a mail may point at. One manifest drives both the template (which URL to write)
 * and the asset controller (which names it will serve), so the two cannot drift apart.
 * Names carry a version; a changed drawing gets a new version, never an overwrite.
 */
export type Board = 1 | 2 | 3;
export type SchemeName = "light" | "dark";

const VERSION = "v1";
const BOARDS: readonly Board[] = [1, 2, 3];
const SCHEMES: readonly SchemeName[] = ["light", "dark"];

export const asset = {
  lockup: (scheme: SchemeName) => `lockup-${scheme}.${VERSION}.png`,
  board: (board: Board, scheme: SchemeName, phone: boolean) =>
    `board-${board}-${scheme}${phone ? "-phone" : ""}.${VERSION}.png`,
  edge: (scheme: SchemeName, phone: boolean) =>
    `edge-${scheme}-${phone ? "375" : "600"}.${VERSION}.png`,
};

export const EMAIL_ASSET_FILES: readonly string[] = SCHEMES.flatMap((scheme) => [
  asset.lockup(scheme),
  asset.edge(scheme, false),
  asset.edge(scheme, true),
  ...BOARDS.flatMap((board) => [
    asset.board(board, scheme, false),
    asset.board(board, scheme, true),
  ]),
]);

export const BOARD_ALT: Record<Board, string> = {
  1: "Taktisk tavle: angreb",
  2: "Taktisk tavle: midtbane",
  3: "Taktisk tavle: hjørnespark",
};
