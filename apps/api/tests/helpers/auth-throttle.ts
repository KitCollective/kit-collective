import { authThrottleHit, createDb } from "@kit/db";

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

export async function clearAuthThrottleHits(): Promise<void> {
  const { db, pool } = createDb(DATABASE_URL);
  await db.delete(authThrottleHit);
  await pool.end();
}
