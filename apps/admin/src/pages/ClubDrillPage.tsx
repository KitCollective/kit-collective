import {
  type AdminClubDrill,
  type AdminClubSeasonDrill,
  adminClubDrillSchema,
  adminClubSeasonDrillSchema,
} from "@kit/api-contract";
import { Fragment, type KeyboardEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { BackLink } from "../components/BackLink.js";
import { CatalogMark } from "../components/CatalogMark.js";
import { groupSquadPlayers } from "./club-drill-squad.js";
import {
  isClubSeasonExpandPending,
  isClubSeasonReadyToExpand,
  resolveSeasonIdForClub,
} from "./club-season-expand.js";

type ClubTab = "players" | "jerseys" | "honours";

const CLUB_TABS: ClubTab[] = ["players", "jerseys", "honours"];

function clubKindLabel(kind: AdminClubDrill["kind"]): string {
  switch (kind) {
    case "club":
      return "Club";
    case "farm":
      return "Farm";
    case "dissolved":
      return "Dissolved";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function formatDate(value: string | null): string {
  return value && value.length > 0 ? value : "—";
}

function websiteHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function ClubDrillPage() {
  const { clubId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [club, setClub] = useState<AdminClubDrill | null>(null);
  const [seasonId, setSeasonId] = useState("");
  const [seasonDrill, setSeasonDrill] = useState<AdminClubSeasonDrill | null>(null);
  const [tab, setTab] = useState<ClubTab>("players");
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !clubId) {
      return;
    }
    let cancelled = false;
    apiFetch<AdminClubDrill>(`/admin/catalog/clubs/${clubId}`, { token })
      .then((body) => {
        if (cancelled) {
          return;
        }
        const parsed = adminClubDrillSchema.parse(body);
        setClub(parsed);
        setSeasonId((current) => resolveSeasonIdForClub(current, parsed.seasons));
        setError(null);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setClub(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load club");
      });
    return () => {
      cancelled = true;
    };
  }, [token, clubId]);

  useEffect(() => {
    if (!token || !clubId) {
      setSeasonDrill(null);
      setSeasonLoading(false);
      return;
    }
    if (!isClubSeasonReadyToExpand(club, clubId, seasonId)) {
      setSeasonDrill(null);
      setSeasonLoading(isClubSeasonExpandPending(club, clubId, seasonId));
      return;
    }
    let cancelled = false;
    setSeasonLoading(true);
    apiFetch<AdminClubSeasonDrill>(
      `/admin/catalog/club-seasons/${clubId}/${seasonId}?expand=true`,
      { token },
    )
      .then((body) => {
        if (cancelled) {
          return;
        }
        setSeasonDrill(adminClubSeasonDrillSchema.parse(body));
        setFocusedRowIndex(0);
        setError(null);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setSeasonDrill(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load season");
      })
      .finally(() => {
        if (!cancelled) {
          setSeasonLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, clubId, seasonId, club]);

  const routedClub = club && clubId && club.id === clubId ? club : null;
  const players = seasonDrill?.squad ?? [];
  const jerseys = seasonDrill?.kits ?? [];
  const honours = routedClub?.honours ?? [];
  const rows = tab === "players" ? players : tab === "jerseys" ? jerseys : honours;
  const columnCount = tab === "players" ? 3 : tab === "jerseys" ? 4 : 3;
  const squadGroups = tab === "players" ? groupSquadPlayers(players) : [];
  const website = routedClub?.websiteUrl ? websiteHref(routedClub.websiteUrl) : undefined;

  function openJersey(kitId: string) {
    navigate(`/stamdata/kits/${kitId}`);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    setTab((current) => {
      const index = CLUB_TABS.indexOf(current);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = (index + delta + CLUB_TABS.length) % CLUB_TABS.length;
      return CLUB_TABS[next] ?? current;
    });
  }

  function handleJerseyKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    kitId: string,
    rowIndex: number,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openJersey(kitId);
      return;
    }

    const rowElements = event.currentTarget.parentElement?.children;
    if (!rowElements) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = rowIndex + 1;
      const next = rowElements.item(nextIndex);
      if (next instanceof HTMLTableRowElement) {
        setFocusedRowIndex(nextIndex);
        next.focus();
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const previousIndex = rowIndex - 1;
      const previous = rowElements.item(previousIndex);
      if (previous instanceof HTMLTableRowElement) {
        setFocusedRowIndex(previousIndex);
        previous.focus();
      }
    }
  }

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to="/stamdata" />
        <h2>{routedClub?.label ?? "Club"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      {routedClub ? (
        <section className="summary-panel identity-strip">
          <span className="identity-mark" aria-hidden="true">
            <CatalogMark
              markPath={routedClub.markPath}
              monogram={routedClub.monogram}
              token={token}
              size="lg"
            />
          </span>
          <div className="identity-facts">
            <dl className="stats-row">
              <div>
                <dt>Current league</dt>
                <dd>{routedClub.currentLeagueLabel ?? "—"}</dd>
              </div>
              <div>
                <dt>Country</dt>
                <dd>{routedClub.countryLabel ?? "—"}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{clubKindLabel(routedClub.kind)}</dd>
              </div>
            </dl>
            <dl className="stats-row">
              {routedClub.foundedOn ? (
                <div>
                  <dt>Founded</dt>
                  <dd className="type-mono">{formatDate(routedClub.foundedOn)}</dd>
                </div>
              ) : null}
              {routedClub.stadiumName ? (
                <div>
                  <dt>Stadium</dt>
                  <dd>{routedClub.stadiumName}</dd>
                </div>
              ) : null}
              {routedClub.stadiumCapacity !== null ? (
                <div>
                  <dt>Capacity</dt>
                  <dd className="type-mono">{routedClub.stadiumCapacity.toLocaleString("en-GB")}</dd>
                </div>
              ) : null}
              {routedClub.websiteUrl ? (
                <div className="stats-row-span">
                  <dt>Website</dt>
                  <dd>
                    {website ? (
                      <a href={website} rel="noreferrer" target="_blank">
                        {routedClub.websiteUrl}
                      </a>
                    ) : (
                      routedClub.websiteUrl
                    )}
                  </dd>
                </div>
              ) : null}
              {routedClub.validFrom ? (
                <div>
                  <dt>Valid from</dt>
                  <dd className="type-mono">{formatDate(routedClub.validFrom)}</dd>
                </div>
              ) : null}
              {routedClub.validTo ? (
                <div>
                  <dt>Valid to</dt>
                  <dd className="type-mono">{formatDate(routedClub.validTo)}</dd>
                </div>
              ) : null}
              {routedClub.successorLabel ? (
                <div>
                  <dt>Successor</dt>
                  <dd>{routedClub.successorLabel}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>
      ) : null}

      <div className="drill-toolbar">
        <div
          className="drill-tabs"
          role="tablist"
          aria-label="Club records"
          onKeyDown={handleTabKeyDown}
        >
          <button
            type="button"
            className="top-tab"
            role="tab"
            id="club-tab-players"
            aria-selected={tab === "players"}
            aria-controls="club-tabpanel"
            tabIndex={tab === "players" ? 0 : -1}
            onClick={() => {
              setTab("players");
              setFocusedRowIndex(0);
            }}
          >
            Players
          </button>
          <button
            type="button"
            className="top-tab"
            role="tab"
            id="club-tab-jerseys"
            aria-selected={tab === "jerseys"}
            aria-controls="club-tabpanel"
            tabIndex={tab === "jerseys" ? 0 : -1}
            onClick={() => {
              setTab("jerseys");
              setFocusedRowIndex(0);
            }}
          >
            Jerseys
          </button>
          <button
            type="button"
            className="top-tab"
            role="tab"
            id="club-tab-honours"
            aria-selected={tab === "honours"}
            aria-controls="club-tabpanel"
            tabIndex={tab === "honours" ? 0 : -1}
            onClick={() => {
              setTab("honours");
              setFocusedRowIndex(0);
            }}
          >
            Honours
          </button>
        </div>
        {tab === "honours" ? null : (
        <div className="field season-field">
          <label htmlFor="club-season">Season</label>
          <select
            id="club-season"
            value={routedClub ? seasonId : ""}
            disabled={!routedClub || routedClub.seasons.length === 0}
            onChange={(event) => setSeasonId(event.target.value)}
          >
            {routedClub && routedClub.seasons.length > 0 ? (
              routedClub.seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.label}
                </option>
              ))
            ) : (
              <option value="">No seasons</option>
            )}
          </select>
        </div>
        )}
      </div>

      <div className="data-table-wrap" id="club-tabpanel" role="tabpanel">
        <table className="data-table">
          <thead>
            {tab === "players" ? (
              <tr>
                <th className="data-table-numeric" scope="col">
                  #
                </th>
                <th scope="col">Name</th>
                <th scope="col">Position</th>
              </tr>
            ) : tab === "honours" ? (
              <tr>
                <th className="data-table-mark" scope="col">
                  Mark
                </th>
                <th scope="col">Season</th>
                <th scope="col">Title</th>
              </tr>
            ) : (
              <tr>
                <th className="data-table-mark" scope="col">
                  Thumb
                </th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Meta</th>
              </tr>
            )}
          </thead>
          <tbody>
            {tab === "honours" ? (
              !routedClub && !error ? (
                <tr>
                  <td colSpan={columnCount}>
                    <div className="empty-state data-table-empty">Loading…</div>
                  </td>
                </tr>
              ) : honours.length === 0 ? (
                <tr>
                  <td colSpan={columnCount}>
                    <div className="empty-state data-table-empty">
                      <h2>No honours</h2>
                      <p>No titles are recorded for this club.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                honours.map((row) => (
                  <tr key={row.id}>
                    <td className="data-table-mark">
                      <CatalogMark
                        markPath={row.markPath}
                        monogram={row.title.slice(0, 2).toUpperCase()}
                        token={token}
                      />
                    </td>
                    <td className="data-table-mono">{row.seasonLabel ?? "—"}</td>
                    <td className="data-table-primary">{row.title}</td>
                  </tr>
                ))
              )
            ) : seasonLoading || (!routedClub && !error) ? (
              <tr>
                <td colSpan={columnCount}>
                  <div className="empty-state data-table-empty">Loading…</div>
                </td>
              </tr>
            ) : !seasonId ? (
              <tr>
                <td colSpan={columnCount}>
                  <div className="empty-state data-table-empty">
                    <h2>No seasons</h2>
                    <p>This club has no seasons with a squad or jerseys.</p>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>
                  <div className="empty-state data-table-empty">
                    {tab === "players" ? (
                      <>
                        <h2>No players</h2>
                        <p>No squad is recorded for this season.</p>
                      </>
                    ) : (
                      <>
                        <h2>No jerseys</h2>
                        <p>No kits are recorded for this season.</p>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : tab === "players" ? (
              squadGroups.map((group) => (
                <Fragment key={group.group}>
                  <tr className="data-table-group">
                    <th className="data-table-group" colSpan={columnCount} scope="colgroup">
                      {group.label}
                    </th>
                  </tr>
                  {group.rows.map((player) => (
                    <tr key={player.id}>
                      <td className="data-table-mono data-table-numeric">
                        {player.squadNumber !== null ? player.squadNumber : "—"}
                      </td>
                      <td className="data-table-primary">{player.label}</td>
                      <td className="data-table-meta">{player.position ?? "—"}</td>
                    </tr>
                  ))}
                </Fragment>
              ))
            ) : (
              jerseys.map((jersey, rowIndex) => (
                <tr
                  key={jersey.id}
                  tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                  onClick={() => openJersey(jersey.id)}
                  onFocus={() => setFocusedRowIndex(rowIndex)}
                  onKeyDown={(event) => handleJerseyKeyDown(event, jersey.id, rowIndex)}
                >
                  <td className="data-table-mark">
                    {jersey.hasPhoto && jersey.photoPath && token ? (
                      <span className="thumb-slot">
                        <AuthenticatedImage path={jersey.photoPath} token={token} />
                      </span>
                    ) : (
                      <span className="thumb-slot" aria-hidden />
                    )}
                  </td>
                  <td className="data-table-primary">{jersey.label}</td>
                  <td className="data-table-mono">{jersey.kitType}</td>
                  <td className="data-table-meta">{jersey.hasPhoto ? "—" : "No photo"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
