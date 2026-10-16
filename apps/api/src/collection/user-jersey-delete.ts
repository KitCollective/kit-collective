import type { Db } from "@kit/db";
import {
  jerseyDraft,
  userJersey,
  userJerseyFavorite,
  userJerseyPatch,
  userJerseyPhoto,
  visionLog,
} from "@kit/db";
import { and, eq } from "drizzle-orm";
import { declinePendingBudsOnUserJersey } from "./user-jersey-buds.js";

/**
 * Deletes one UserJersey and every row that points at it: its patches, the Favorites other
 * collectors hold on it, its Vision logs, its drafts and its photo rows. Pending Buds on it
 * are declined first. Shared by owner delete and Take-down so neither leaves a blocking row.
 * Call it inside one transaction, after the photo bytes are gone from the object store.
 */
export async function deleteUserJerseyRows(
  db: Pick<Db, "update" | "delete">,
  { userJerseyId, userId }: { userJerseyId: string; userId: string },
): Promise<void> {
  await declinePendingBudsOnUserJersey(db, userJerseyId);

  await db.delete(userJerseyPatch).where(eq(userJerseyPatch.userJerseyId, userJerseyId));
  await db.delete(userJerseyFavorite).where(eq(userJerseyFavorite.userJerseyId, userJerseyId));
  await db.delete(visionLog).where(eq(visionLog.userJerseyId, userJerseyId));
  await db.delete(jerseyDraft).where(eq(jerseyDraft.userJerseyId, userJerseyId));
  await db.delete(userJerseyPhoto).where(eq(userJerseyPhoto.userJerseyId, userJerseyId));
  await db
    .delete(userJersey)
    .where(and(eq(userJersey.id, userJerseyId), eq(userJersey.userId, userId)));
}
