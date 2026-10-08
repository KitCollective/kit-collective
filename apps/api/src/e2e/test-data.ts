import {
  authEvent,
  collectionShortcut,
  conversation,
  conversationMessage,
  conversationParticipant,
  type Db,
  entitlement,
  jerseyDraft,
  moderationBlock,
  moderationReport,
  session,
  user,
  userJersey,
  userJerseyFavorite,
  userJerseyPatch,
  userJerseyPhoto,
  visionLog,
  wishlistEntry,
} from "@kit/db";
import { gridPhotoObjectKey, photoPrefixFromStoredObjectKey } from "@kit/domain";
import bcrypt from "bcryptjs";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { ObjectStoreAdapter } from "../collection/object-store.js";
import { writeStripAndLightboxVariants } from "../collection/photo-derivatives.js";
import { type ResolvedSide, resolveCatalogSide } from "./catalog-side.js";
import { renderFixturePhoto } from "./fixture-photo.js";
import {
  type FixtureSide,
  TEST_COLLECTOR_HANDLE,
  TEST_COLLECTOR_ID,
  TEST_COMP_EXPIRES,
  TEST_DATA_CATALOG,
  TEST_JERSEYS,
  TEST_PEER_HANDLE,
  TEST_PEER_ID,
  TEST_SHORTCUT,
  TEST_WISHLIST_ENTRY,
} from "./test-data.fixture.js";

export type TestDataCredentials = {
  collector: { email: string; password: string };
  peer: { email: string; password: string };
};

const TEST_IDS = [TEST_COLLECTOR_ID, TEST_PEER_ID];
const VARIANT_FILES = ["grid.jpg", "strip.jpg", "lightbox.jpg", "original"];

function sideKey(side: FixtureSide): string {
  return `${side.kind}:${side.label}`;
}

async function resolveFixtureCatalog(db: Db): Promise<Map<string, ResolvedSide>> {
  const sides: FixtureSide[] = [
    ...TEST_DATA_CATALOG.clubs.map((label) => ({ kind: "club" as const, label })),
    ...TEST_DATA_CATALOG.nationalTeams.map((label) => ({ kind: "national_team" as const, label })),
  ];
  const resolved = new Map<string, ResolvedSide>();
  const missing: string[] = [];
  for (const side of sides) {
    const match = await resolveCatalogSide(db, side);
    if (match) {
      resolved.set(sideKey(side), match);
    } else {
      missing.push(side.label);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Device-flow test data needs these catalog sides with at least one linked season, and this catalog has none: ${missing.join(", ")}. Nothing was written.`,
    );
  }
  return resolved;
}

async function assertIdentityFree(db: Db, credentials: TestDataCredentials): Promise<void> {
  const wanted = [
    { id: TEST_COLLECTOR_ID, email: credentials.collector.email, handle: TEST_COLLECTOR_HANDLE },
    { id: TEST_PEER_ID, email: credentials.peer.email, handle: TEST_PEER_HANDLE },
  ];
  for (const { id, email, handle } of wanted) {
    const [taken] = await db
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          ne(user.id, id),
          or(sql`lower(${user.email}) = ${email.toLowerCase()}`, eq(user.handle, handle)),
        ),
      )
      .limit(1);
    if (taken) {
      throw new Error(
        `Refused: the e-mail or handle for test Collector ${handle} belongs to another Collector in this database. Nothing was written.`,
      );
    }
  }
}

function variantKeys(objectKey: string): string[] {
  const prefix = photoPrefixFromStoredObjectKey(objectKey);
  return prefix ? VARIANT_FILES.map((file) => `${prefix}${file}`) : [objectKey];
}

/**
 * Puts the two test Collectors into the known state the device flows start
 * from. Idempotent. Reads the catalog; writes only rows owned by, or pointing
 * at, the two test Collectors.
 */
export async function applyTestData(input: {
  db: Db;
  objectStore: ObjectStoreAdapter;
  credentials: TestDataCredentials;
}): Promise<void> {
  const { db, objectStore, credentials } = input;
  const catalog = await resolveFixtureCatalog(db);
  await assertIdentityFree(db, credentials);
  // SAFETY: fixture sides are typed from TEST_DATA_CATALOG, and resolveFixtureCatalog
  // resolved every one of those or threw.
  const sideOf = (side: FixtureSide) => catalog.get(sideKey(side)) as ResolvedSide;

  const accounts = [
    { id: TEST_COLLECTOR_ID, handle: TEST_COLLECTOR_HANDLE, ...credentials.collector },
    { id: TEST_PEER_ID, handle: TEST_PEER_HANDLE, ...credentials.peer },
  ];
  const hashed = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      email: account.email.toLowerCase(),
      passwordHash: await bcrypt.hash(account.password, 12),
    })),
  );

  const staleObjectKeys = await db.transaction(async (tx) => {
    for (const account of hashed) {
      const identity = {
        email: account.email,
        passwordHash: account.passwordHash,
        name: account.handle,
        handle: account.handle,
        emailVerified: true,
        locale: "da" as const,
        appearance: "light" as const,
      };
      await tx
        .insert(user)
        .values({ id: account.id, ...identity })
        .onConflictDoUpdate({ target: user.id, set: { ...identity, updatedAt: new Date() } });
    }

    const threads = await tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(
        or(
          inArray(conversation.lowerCollectorId, TEST_IDS),
          inArray(conversation.upperCollectorId, TEST_IDS),
        ),
      );
    const threadIds = threads.map((row) => row.id);
    await tx
      .delete(moderationReport)
      .where(
        or(
          inArray(moderationReport.reporterId, TEST_IDS),
          inArray(moderationReport.peerId, TEST_IDS),
          threadIds.length > 0 ? inArray(moderationReport.conversationId, threadIds) : undefined,
        ),
      );
    if (threadIds.length > 0) {
      await tx
        .delete(conversationMessage)
        .where(inArray(conversationMessage.conversationId, threadIds));
      await tx
        .delete(conversationParticipant)
        .where(inArray(conversationParticipant.conversationId, threadIds));
      await tx.delete(conversation).where(inArray(conversation.id, threadIds));
    }
    await tx
      .delete(moderationBlock)
      .where(
        or(
          inArray(moderationBlock.blockerId, TEST_IDS),
          inArray(moderationBlock.blockedId, TEST_IDS),
        ),
      );

    const jerseys = await tx
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(inArray(userJersey.userId, TEST_IDS));
    const jerseyIds = jerseys.map((row) => row.id);
    let stale: string[] = [];
    await tx.delete(userJerseyFavorite).where(inArray(userJerseyFavorite.collectorId, TEST_IDS));
    await tx.delete(visionLog).where(inArray(visionLog.userId, TEST_IDS));
    await tx.delete(jerseyDraft).where(inArray(jerseyDraft.userId, TEST_IDS));
    if (jerseyIds.length > 0) {
      const photos = await tx
        .select({ objectKey: userJerseyPhoto.objectKey })
        .from(userJerseyPhoto)
        .where(inArray(userJerseyPhoto.userJerseyId, jerseyIds));
      stale = photos.flatMap((row) => variantKeys(row.objectKey));
      await tx
        .delete(userJerseyFavorite)
        .where(inArray(userJerseyFavorite.userJerseyId, jerseyIds));
      await tx.delete(visionLog).where(inArray(visionLog.userJerseyId, jerseyIds));
      await tx.delete(jerseyDraft).where(inArray(jerseyDraft.userJerseyId, jerseyIds));
      await tx.delete(userJerseyPatch).where(inArray(userJerseyPatch.userJerseyId, jerseyIds));
      await tx.delete(userJerseyPhoto).where(inArray(userJerseyPhoto.userJerseyId, jerseyIds));
      await tx.delete(userJersey).where(inArray(userJersey.id, jerseyIds));
    }
    await tx.delete(wishlistEntry).where(inArray(wishlistEntry.userId, TEST_IDS));
    await tx.delete(collectionShortcut).where(inArray(collectionShortcut.userId, TEST_IDS));
    await tx.delete(session).where(inArray(session.userId, TEST_IDS));
    await tx.delete(authEvent).where(inArray(authEvent.userId, TEST_IDS));

    for (const jersey of TEST_JERSEYS) {
      const side = sideOf(jersey.side);
      await tx.insert(userJersey).values({
        id: jersey.id,
        userId: jersey.ownerId,
        clubId: side.clubId,
        nationalTeamId: side.nationalTeamId,
        seasonId: side.seasonId,
        type: jersey.type,
        size: jersey.size,
        condition: jersey.condition,
        private: jersey.private,
        biddingEnabled: jersey.biddingEnabled,
      });
      await tx.insert(userJerseyPhoto).values(
        jersey.photos.map((photo) => ({
          id: photo.id,
          userJerseyId: jersey.id,
          objectKey: gridPhotoObjectKey(jersey.ownerId, jersey.id, photo.id),
          role: photo.role,
          source: "gallery" as const,
        })),
      );
    }

    const wish = sideOf(TEST_WISHLIST_ENTRY.side);
    await tx.insert(wishlistEntry).values({
      id: TEST_WISHLIST_ENTRY.id,
      userId: TEST_COLLECTOR_ID,
      clubId: wish.clubId,
      nationalTeamId: wish.nationalTeamId,
      type: TEST_WISHLIST_ENTRY.type,
    });
    await tx.insert(collectionShortcut).values({
      id: TEST_SHORTCUT.id,
      userId: TEST_COLLECTOR_ID,
      name: TEST_SHORTCUT.name,
      clubId: sideOf(TEST_SHORTCUT.side).clubId,
    });

    const entitlements = [
      { userId: TEST_COLLECTOR_ID, source: "comp" as const, expires: TEST_COMP_EXPIRES },
      // No live Entitlement and a spent trial: this Collector meets the paywall Sheet.
      { userId: TEST_PEER_ID, source: null, expires: null },
    ];
    for (const row of entitlements) {
      const state = { source: row.source, expires: row.expires, trialUsed: true };
      await tx
        .insert(entitlement)
        .values({ userId: row.userId, ...state })
        .onConflictDoUpdate({
          target: entitlement.userId,
          set: { ...state, updatedAt: new Date() },
        });
    }
    return stale;
  });

  for (const key of staleObjectKeys) {
    await objectStore.deleteObject(key);
  }
  for (const jersey of TEST_JERSEYS) {
    for (const photo of jersey.photos) {
      const bytes = await renderFixturePhoto(jersey.colour, photo.role === "back");
      const sourceObjectKey = gridPhotoObjectKey(jersey.ownerId, jersey.id, photo.id);
      await objectStore.putObject(sourceObjectKey, bytes);
      await writeStripAndLightboxVariants(
        objectStore,
        {
          userId: jersey.ownerId,
          jerseyId: jersey.id,
          photoId: photo.id,
          role: photo.role,
          sourceObjectKey,
        },
        bytes,
      );
    }
  }
}
