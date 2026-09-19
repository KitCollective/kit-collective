#!/usr/bin/env node
/**
 * Read-only development-lane catalog verification for KIT-34 proof.
 * Outputs JSON to stdout — do not hand-type counts; paste this output as evidence.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(repoRoot, "packages/db/package.json"));
const pg = require("pg");

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: "DATABASE_URL is required" })}\n`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

try {
  const meta = await pool.query(`
    SELECT
      inet_server_addr()::text AS server_addr,
      current_database() AS database_name,
      (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS public_tables,
      (SELECT COUNT(*)::int FROM drizzle.__drizzle_migrations) AS migration_rows
  `);

  const squad = await pool.query(`
    SELECT
      s.label,
      COUNT(pcs.id)::int AS squad_rows,
      COUNT(DISTINCT pcs.club_id)::int AS clubs,
      COUNT(*) FILTER (WHERE pcs.squad_number IS NOT NULL)::int AS with_jersey
    FROM season s
    LEFT JOIN player_club_season pcs ON pcs.season_id = s.id
    WHERE s.label IN ('2015/16', '2016/17', '2017/18')
    GROUP BY s.label
    ORDER BY s.label
  `);

  const byLabel = Object.fromEntries(squad.rows.map((r) => [r.label, r]));
  const s201718 = byLabel["2017/18"] ?? { squad_rows: 0, clubs: 0, with_jersey: 0 };
  const s201516 = byLabel["2015/16"] ?? null;
  const s201617 = byLabel["2016/17"] ?? null;

  const output = {
    ok: true,
    verifiedAt: new Date().toISOString(),
    lane: "development",
    database: meta.rows[0],
    squadBySeason: squad.rows,
    ac: {
      season201718: {
        clubs: s201718.clubs,
        squadRows: s201718.squad_rows,
        withJersey: s201718.with_jersey,
        complete: s201718.clubs >= 14 && s201718.squad_rows >= 450,
      },
      baselinesPresent: Boolean(s201516 && s201617),
    },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
} finally {
  await pool.end();
}
