import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface KaderHtmlCacheKey {
  kind: "competition" | "kader" | "profile";
  relativePath: string;
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

  const kaderMatch = /\/verein\/(\d+)\/saison_id\/(\d+)/i.exec(url);
  if (kaderMatch) {
    const [, clubId, season] = kaderMatch;
    return {
      kind: "kader",
      relativePath: path.join("kader", `${clubId}-${season}.html`),
    };
  }

  const profileMatch = /\/spieler\/(\d+)/i.exec(url);
  if (profileMatch) {
    const [, playerId] = profileMatch;
    return {
      kind: "profile",
      relativePath: path.join("profiles", `player-${playerId}.html`),
    };
  }

  return undefined;
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
