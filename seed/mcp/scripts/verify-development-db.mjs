/**
 * Query development Postgres squad counts for seed proof evidence.
 * Requires DATABASE_URL (real CX33 development lane — not localhost/kit_test).
 * stdout: JSON { connection, totals, bySeason }
 */
import { createDb } from "@kit/db";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const { pool } = createDb(url);

const connection = await pool.query(
  "SELECT inet_server_addr()::text AS server_addr, current_database() AS database_name",
);

const totals = await pool.query(`
  SELECT
    (SELECT count(*)::int FROM season) AS seasons,
    (SELECT count(*)::int FROM club) AS clubs,
    (SELECT count(*)::int FROM team_season) AS team_seasons,
    (SELECT count(*)::int FROM player) AS players,
    (SELECT count(*)::int FROM player_club_season) AS player_club_seasons,
    (SELECT count(*)::int FROM player_club_season WHERE squad_number IS NOT NULL) AS jersey_numbers
`);

const bySeason = await pool.query(`
  SELECT
    s.label,
    count(DISTINCT pcs.club_id)::int AS clubs,
    count(pcs.id)::int AS player_club_seasons,
    count(pcs.id) FILTER (WHERE pcs.squad_number IS NOT NULL)::int AS jersey_numbers
  FROM season s
  LEFT JOIN player_club_season pcs ON pcs.season_id = s.id
  GROUP BY s.label
  ORDER BY s.label
`);

await pool.end();

const output = {
  connection: connection.rows[0],
  totals: totals.rows[0],
  bySeason: bySeason.rows,
};

console.log(JSON.stringify(output, null, 2));
