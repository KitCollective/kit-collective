import { type AdminKitDrill, adminKitDrillSchema } from "@kit/api-contract";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { prefetchAuthenticatedBlobs } from "../components/authenticated-image-cache.js";
import { BackLink } from "../components/BackLink.js";
import { CatalogMark } from "../components/CatalogMark.js";

function jerseyTitle(kit: AdminKitDrill): string {
  const club = kit.clubLabel?.trim();
  if (club && kit.kitType) {
    return kit.variant ? `${club} ${kit.kitType} ${kit.variant}` : `${club} ${kit.kitType}`;
  }
  return kit.label;
}

function kitColorHexes(kit: AdminKitDrill): string[] {
  const hexes: string[] = [];
  for (const raw of [kit.primaryColorHex, kit.secondaryColorHex]) {
    if (!raw) {
      continue;
    }
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
      hexes.push(hex.toUpperCase());
    }
  }
  return hexes;
}

function CompetitionLinks({
  competitions,
  fallback,
  href,
  stopRowClick,
}: {
  competitions?: { label: string; href?: string }[];
  fallback?: string;
  href?: string;
  stopRowClick?: boolean;
}) {
  const rows =
    competitions && competitions.length > 0
      ? competitions
      : fallback
        ? [{ label: fallback, href }]
        : [];
  if (rows.length === 0) {
    return "—";
  }
  return (
    <span className="kit-competition-list">
      {rows.map((row, index) => (
        <span key={`${row.href ?? "plain"}:${row.label}`}>
          {index > 0 ? <span aria-hidden> · </span> : null}
          {row.href ? (
            <Link
              to={row.href}
              className="kit-club-link"
              onClick={stopRowClick ? (event) => event.stopPropagation() : undefined}
            >
              {row.label}
            </Link>
          ) : (
            row.label
          )}
        </span>
      ))}
    </span>
  );
}

function Fact({
  label,
  value,
  href,
  children,
}: {
  label: string;
  value?: string;
  href?: string;
  children?: ReactNode;
}) {
  const content = value && value.length > 0 ? value : "—";
  return (
    <div className="kit-fact">
      <dt>{label}</dt>
      <dd>
        {children}
        {href && value ? (
          <Link to={href} className="kit-club-link">
            {content}
          </Link>
        ) : value ? (
          content
        ) : children ? null : (
          content
        )}
      </dd>
    </div>
  );
}

function KitDrillSkeleton() {
  return (
    <div className="kit-drill" aria-busy="true">
      <section className="kit-drill-facts">
        <div className="kit-drill-identity">
          <BackLink to="/stamdata" />
          <span className="kit-skel kit-skel--mark" />
          <div>
            <span className="kit-skel kit-skel--title" />
            <span className="kit-skel kit-skel--kicker" />
          </div>
        </div>
        <dl className="kit-facts">
          {["Team", "Season", "Type", "Design", "Colors", "Brand", "Sponsor", "Competition"].map(
            (label) => (
              <div className="kit-fact" key={label}>
                <dt>
                  <span className="kit-skel kit-skel--label" />
                </dt>
                <dd>
                  <span className="kit-skel kit-skel--value" />
                </dd>
              </div>
            ),
          )}
        </dl>
      </section>
      <section className="kit-drill-photos">
        <span className="kit-skel kit-skel--hero" />
        <div className="kit-photo-thumbs">
          <span className="kit-skel kit-skel--thumb" />
          <span className="kit-skel kit-skel--thumb" />
          <span className="kit-skel kit-skel--thumb" />
          <span className="kit-skel kit-skel--thumb" />
        </div>
      </section>
    </div>
  );
}

export function KitDrillPage() {
  const { kitId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [kit, setKit] = useState<AdminKitDrill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !kitId) {
      return;
    }
    setKit(null);
    setError(null);
    setSelectedPhotoId(null);
    apiFetch<AdminKitDrill>(`/admin/catalog/kits/${kitId}`, { token })
      .then((body) => setKit(adminKitDrillSchema.parse(body)))
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load kit");
      });
  }, [token, kitId]);

  useEffect(() => {
    if (!token || !kit) {
      return;
    }
    prefetchAuthenticatedBlobs(
      [
        kit.clubMarkPath,
        ...kit.photos.map((photo) => photo.path),
        ...kit.variants.map((row) => row.photoPath),
      ],
      token,
    );
  }, [kit, token]);

  const photos = kit?.photos ?? [];
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0];
  const clubHref = kit?.clubId ? `/stamdata/clubs/${kit.clubId}` : undefined;
  const colorHexes = kit ? kitColorHexes(kit) : [];

  return (
    <div className="drill-page">
      {error ? <div className="banner-error">{error}</div> : null}

      {kit ? (
        <div className="kit-drill kit-drill--ready">
          <section className="kit-drill-facts">
            <div className="kit-drill-identity">
              <BackLink to={clubHref ?? "/stamdata"} />
              {kit.clubId && kit.clubMonogram && token ? (
                <span className="identity-mark" aria-hidden="true">
                  <CatalogMark
                    markPath={kit.clubMarkPath}
                    monogram={kit.clubMonogram}
                    token={token}
                    size="lg"
                  />
                </span>
              ) : null}
              <div>
                <h2>
                  {clubHref && kit.clubLabel ? (
                    <Link to={clubHref} className="kit-club-link">
                      {kit.clubLabel}
                    </Link>
                  ) : (
                    jerseyTitle(kit)
                  )}
                </h2>
                <p className="type-mono kit-drill-kicker">
                  {kit.kitType}
                  {kit.variant ? ` · ${kit.variant}` : ""} · {kit.seasonLabel}
                </p>
              </div>
            </div>
            <dl className="kit-facts">
              <Fact label="Team" value={kit.clubLabel} href={clubHref} />
              <Fact label="Season" value={kit.seasonLabel} />
              <Fact label="Type" value={kit.kitType} />
              {kit.parentKit ? (
                <Fact
                  label="Part of"
                  value={kit.parentKit.label}
                  href={`/stamdata/kits/${kit.parentKit.id}`}
                />
              ) : null}
              {kit.variant ? <Fact label="Variant" value={kit.variant} /> : null}
              <Fact label="Design" value={kit.design} />
              <Fact label="Colors" value={kit.colorNames}>
                {colorHexes.length > 0 ? (
                  <span className="kit-color-swatches" aria-hidden="true">
                    {colorHexes.map((hex) => (
                      <span
                        key={hex}
                        className="kit-color-swatch"
                        style={{ backgroundColor: `#${hex}` }}
                      />
                    ))}
                  </span>
                ) : null}
              </Fact>
              <Fact label="Brand" value={kit.brandLabel} />
              <Fact label="Sponsor" value={kit.sponsorName} />
              <Fact label="Competition">
                <CompetitionLinks
                  competitions={kit.competitions}
                  fallback={kit.competition}
                  href={kit.competitionHref}
                />
              </Fact>
              <Fact label="Release date" value={kit.releasedOn} />
              {kit.description ? (
                <div className="kit-fact kit-fact--wide">
                  <dt>Description</dt>
                  <dd className="kit-description">{kit.description}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="kit-drill-photos">
            {selectedPhoto && token ? (
              <>
                <AuthenticatedImage
                  path={selectedPhoto.path}
                  token={token}
                  className="drill-photo kit-photo-hero"
                  alt={jerseyTitle(kit)}
                  fallback={<span className="kit-skel kit-skel--hero" aria-hidden />}
                />
                {photos.length > 1 ? (
                  <div className="kit-photo-thumbs">
                    {photos.map((photo, index) => {
                      const pressed = photo.id === selectedPhoto.id;
                      return (
                        <button
                          key={photo.id}
                          type="button"
                          className="kit-photo-thumb"
                          aria-pressed={pressed}
                          aria-label={`Photo ${index + 1}`}
                          onClick={() => setSelectedPhotoId(photo.id)}
                        >
                          <AuthenticatedImage
                            path={photo.path}
                            token={token}
                            className="kit-photo-thumb-img"
                            alt=""
                            fallback={<span className="kit-skel kit-skel--thumb" aria-hidden />}
                          />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : !kit.hasPhoto ? (
              <p>No KitPhoto on file.</p>
            ) : null}
          </section>

          {kit.variants.length > 0 ? (
            <section className="kit-drill-variants">
              <h3>Variants</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Thumb</th>
                    <th scope="col">Variant</th>
                    <th scope="col">Competition</th>
                  </tr>
                </thead>
                <tbody>
                  {kit.variants.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onClick={() => navigate(`/stamdata/kits/${row.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/stamdata/kits/${row.id}`);
                        }
                      }}
                    >
                      <td className="data-table-mark">
                        {row.hasPhoto && row.photoPath && token ? (
                          <span className="thumb-slot">
                            <AuthenticatedImage
                              path={row.photoPath}
                              token={token}
                              fallback={<span className="kit-skel kit-skel--slot" aria-hidden />}
                            />
                          </span>
                        ) : (
                          <span className="thumb-slot" aria-hidden />
                        )}
                      </td>
                      <td className="data-table-primary">
                        <Link
                          to={`/stamdata/kits/${row.id}`}
                          className="kit-club-link"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.variant}
                        </Link>
                      </td>
                      <td className="data-table-meta">
                        <CompetitionLinks
                          competitions={row.competitions}
                          fallback={row.competition}
                          href={row.competitionHref}
                          stopRowClick
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </div>
      ) : error ? (
        <div className="drill-header">
          <BackLink to="/stamdata" />
        </div>
      ) : (
        <KitDrillSkeleton />
      )}
    </div>
  );
}
