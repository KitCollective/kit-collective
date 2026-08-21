function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PeekClubRow = {
  seasonId: string;
  seasonLabel: string;
  clubId: string;
  clubName: string;
  squadCount: number;
};

export type PeekKitRow = {
  clubId: string;
  seasonId: string;
  kitType: string;
  photoCount: number;
};

export function buildPeekHtml(
  clubs: PeekClubRow[],
  kits: PeekKitRow[],
): string {
  const kitsByClubSeason = new Map<string, PeekKitRow[]>();
  for (const kit of kits) {
    const key = `${kit.clubId}:${kit.seasonId}`;
    const bucket = kitsByClubSeason.get(key) ?? [];
    bucket.push(kit);
    kitsByClubSeason.set(key, bucket);
  }

  const seasons = new Map<string, { label: string; clubs: PeekClubRow[] }>();
  for (const club of clubs) {
    const season = seasons.get(club.seasonId) ?? {
      label: club.seasonLabel,
      clubs: [],
    };
    season.clubs.push(club);
    seasons.set(club.seasonId, season);
  }

  const seasonSections = [...seasons.values()]
    .map((season) => {
      const clubItems = season.clubs
        .map((club) => {
          const kitKey = `${club.clubId}:${club.seasonId}`;
          const clubKits = kitsByClubSeason.get(kitKey) ?? [];
          const kitItems = clubKits
            .map(
              (kit) =>
                `<li>${escapeHtml(kit.kitType)} — ${kit.photoCount} photo${kit.photoCount === 1 ? "" : "s"}</li>`,
            )
            .join("");
          const kitsList =
            kitItems.length > 0 ? `<ul>${kitItems}</ul>` : "<p>no kits</p>";

          return `<li>${escapeHtml(club.clubName)} — squad: ${club.squadCount}${kitsList}</li>`;
        })
        .join("");

      return `<section><h2>${escapeHtml(season.label)}</h2><ul>${clubItems}</ul></section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Catalog peek</title>
</head>
<body>
<h1>Catalog peek</h1>
${seasonSections.length > 0 ? seasonSections : "<p>no seasons</p>"}
</body>
</html>`;
}
