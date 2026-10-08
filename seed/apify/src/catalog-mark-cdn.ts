const TM_IMAGE_CDN_HOST_SUFFIX = ".transfermarkt.technology";

export function isTransfermarktImageCdnUrl(src: string): boolean {
  try {
    return new URL(src).hostname.toLowerCase().endsWith(TM_IMAGE_CDN_HOST_SUFFIX);
  } catch {
    return false;
  }
}

export function clubCrestCdnUrl(tmClubId: string): string {
  return `https://img.a.transfermarkt.technology/wappen/head/${tmClubId}.png`;
}

export function leagueBadgeCdnUrl(tmCompetitionCode: string): string {
  return `https://img.a.transfermarkt.technology/logo/header/${tmCompetitionCode.toLowerCase()}.png`;
}

export function clubCrestObjectKey(tmClubId: string): string {
  return `club/${tmClubId}/crest`;
}

export function leagueBadgeObjectKey(tmCompetitionCode: string): string {
  return `league/${tmCompetitionCode.toLowerCase()}/badge`;
}

/**
 * Object-store key for a Transfermarkt image CDN URL. Club crests, competition logos,
 * and honour trophies share the same host; the path decides the key. Query strings drop.
 */
export function catalogMarkObjectKeyFromCdnUrl(src: string): string | undefined {
  if (!isTransfermarktImageCdnUrl(src)) {
    return undefined;
  }
  try {
    const path = new URL(src).pathname.replace(/\/+$/, "");
    const wappen = /\/wappen\/(?:tiny|head|big)\/(\d+)/i.exec(path);
    if (wappen?.[1]) {
      return clubCrestObjectKey(wappen[1]);
    }
    const logo = /\/logo\/(?:tiny|header|head|big)\/([a-z0-9]+)/i.exec(path);
    if (logo?.[1]) {
      return leagueBadgeObjectKey(logo[1]);
    }
    const honour = /\/erfolge\/(?:tiny|big)\/(\d+)/i.exec(path);
    if (honour?.[1]) {
      return `honour/erfolge/${honour[1]}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
