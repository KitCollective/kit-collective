import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type KaderHtmlCacheKind =
  | "competition"
  | "kader"
  | "club_page"
  | "profile"
  | "jersey_numbers"
  | "player_honours"
  | "player_page"
  | "facts"
  | "honours"
  | "search"
  | "asset";

export interface KaderHtmlCacheKey {
  kind: KaderHtmlCacheKind;
  relativePath: string;
}

/**
 * Transfermarkt addresses every page about one entity as `/<section>/<entity>/<id>`, so the
 * id alone never identifies a page. Keying on the id with a loose `/spieler/(\d+)` fallback
 * filed `erfolge/spieler/9` under the same name as `profil/spieler/9` — a player's honours
 * page would have overwritten his profile in an 842 MB cache we cannot cheaply refill.
 *
 * Sections we parse get their own kind and their established directory. Every other section
 * still caches, but under its own section directory, so adding a source can no longer
 * collide with an existing one even if nobody edits this file.
 */
const PLAYER_SECTION_KINDS: Record<string, { kind: KaderHtmlCacheKind; dir: string }> = {
  profil: { kind: "profile", dir: "profiles" },
  rueckennummern: { kind: "jersey_numbers", dir: "jersey-numbers" },
  erfolge: { kind: "player_honours", dir: "player-honours" },
};

const CLUB_SECTION_KINDS: Record<string, { kind: KaderHtmlCacheKind; dir: string }> = {
  datenfakten: { kind: "facts", dir: "facts" },
  erfolge: { kind: "honours", dir: "honours" },
};

/** `<section>` is the path segment right before `/spieler/` or `/verein/`. */
function sectionOf(url: string, entity: "spieler" | "verein"): string | undefined {
  const match = new RegExp(`/([a-z0-9_-]+)/${entity}/(\\d+)`, "i").exec(url);
  return match?.[1]?.toLowerCase();
}

function entityIdOf(url: string, entity: "spieler" | "verein"): string | undefined {
  return new RegExp(`/${entity}/(\\d+)`, "i").exec(url)?.[1];
}

function resolvePlayerCacheKey(url: string): KaderHtmlCacheKey | undefined {
  const playerId = entityIdOf(url, "spieler");
  if (!playerId) {
    return undefined;
  }

  const section = sectionOf(url, "spieler");
  if (!section) {
    return undefined;
  }

  const known = PLAYER_SECTION_KINDS[section];
  if (known) {
    return { kind: known.kind, relativePath: path.join(known.dir, `player-${playerId}.html`) };
  }

  return {
    kind: "player_page",
    relativePath: path.join("players", section, `player-${playerId}.html`),
  };
}

function resolveClubCacheKey(url: string): KaderHtmlCacheKey | undefined {
  const clubId = entityIdOf(url, "verein");
  if (!clubId) {
    return undefined;
  }

  const section = sectionOf(url, "verein");
  if (!section) {
    return undefined;
  }

  // Only the squad page is season-addressed; `/startseite/verein/<id>/saison_id/<n>` used to
  // satisfy the same loose rule and would have been served as that season's kader.
  const season = /\/verein\/\d+\/saison_id\/(\d+)/i.exec(url)?.[1];
  if (season) {
    if (section === "kader") {
      return { kind: "kader", relativePath: path.join("kader", `${clubId}-${season}.html`) };
    }
    return {
      kind: "club_page",
      relativePath: path.join("clubs", section, `${clubId}-${season}.html`),
    };
  }

  const known = CLUB_SECTION_KINDS[section];
  if (known) {
    return { kind: known.kind, relativePath: path.join(known.dir, `${clubId}.html`) };
  }

  return { kind: "club_page", relativePath: path.join("clubs", section, `${clubId}.html`) };
}

export function resolveKaderHtmlCacheKey(url: string): KaderHtmlCacheKey | undefined {
  const competitionMatch = /\/wettbewerb\/([A-Z0-9]+)\/saison_id\/(\d+)/i.exec(url);
  if (competitionMatch) {
    const [, code, season] = competitionMatch;
    return {
      kind: "competition",
      relativePath: path.join("competitions", `${code}-${season}.html`),
    };
  }

  const clubKey = resolveClubCacheKey(url);
  if (clubKey) {
    return clubKey;
  }

  const playerKey = resolvePlayerCacheKey(url);
  if (playerKey) {
    return playerKey;
  }

  if (/\/schnellsuche\//i.test(url)) {
    return {
      kind: "search",
      relativePath: path.join("search", `${urlDigest(url)}.html`),
    };
  }

  return undefined;
}

function urlDigest(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

/** Portrait bytes keyed by image URL — the CDN path carries no stable player id. */
export function resolveKaderAssetCacheKey(url: string): KaderHtmlCacheKey | undefined {
  if (!/^https?:\/\//i.test(url)) {
    return undefined;
  }
  const extension = /\.(jpe?g|png|webp|avif|gif)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? "bin";
  return {
    kind: "asset",
    relativePath: path.join("assets", `${urlDigest(url)}.${extension}`),
  };
}

export interface KaderHtmlLiveCache {
  read(key: KaderHtmlCacheKey): Promise<string | undefined>;
  write(key: KaderHtmlCacheKey, html: string): Promise<void>;
}

export function createKaderHtmlLiveCache(cacheDir: string): KaderHtmlLiveCache {
  const memory = new Map<string, string>();

  async function ensureParent(filePath: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
  }

  return {
    async read(key) {
      const cached = memory.get(key.relativePath);
      if (cached !== undefined) {
        return cached;
      }

      const filePath = path.join(cacheDir, key.relativePath);
      try {
        const html = await readFile(filePath, "utf8");
        memory.set(key.relativePath, html);
        return html;
      } catch {
        return undefined;
      }
    },

    async write(key, html) {
      memory.set(key.relativePath, html);
      const filePath = path.join(cacheDir, key.relativePath);
      await ensureParent(filePath);
      await writeFile(filePath, html, "utf8");
    },
  };
}

export interface KaderBytesLiveCache {
  read(key: KaderHtmlCacheKey): Promise<Uint8Array | undefined>;
  write(key: KaderHtmlCacheKey, bytes: Uint8Array): Promise<void>;
}

export function createKaderBytesLiveCache(cacheDir: string): KaderBytesLiveCache {
  return {
    async read(key) {
      try {
        return new Uint8Array(await readFile(path.join(cacheDir, key.relativePath)));
      } catch {
        return undefined;
      }
    },

    async write(key, bytes) {
      const filePath = path.join(cacheDir, key.relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, bytes);
    },
  };
}

export function wrapFetchHtmlWithKaderCache(
  innerFetch: (url: string) => Promise<string>,
  cache: KaderHtmlLiveCache,
): (url: string) => Promise<string> {
  return async (url: string) => {
    const key = resolveKaderHtmlCacheKey(url);
    if (!key) {
      return innerFetch(url);
    }

    const cached = await cache.read(key);
    if (cached !== undefined) {
      return cached;
    }

    const html = await innerFetch(url);
    await cache.write(key, html);
    return html;
  };
}

export function wrapFetchBytesWithKaderCache(
  innerFetch: (url: string) => Promise<Uint8Array>,
  cache: KaderBytesLiveCache,
): (url: string) => Promise<Uint8Array> {
  return async (url: string) => {
    const key = resolveKaderAssetCacheKey(url);
    if (!key) {
      return innerFetch(url);
    }

    const cached = await cache.read(key);
    if (cached !== undefined) {
      return cached;
    }

    const bytes = await innerFetch(url);
    await cache.write(key, bytes);
    return bytes;
  };
}
