import {
  type CatalogClubSearchResponse,
  type CatalogClubSeasonsResponse,
  catalogClubSearchResponseSchema,
  catalogClubSeasonsResponseSchema,
} from "@kit/api-contract";
import { getApiBaseUrl } from "./config";

async function authGet(path: string, accessToken: string): Promise<Response> {
  return fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function searchCatalogClubs(accessToken: string, query: string, locale = "da") {
  const params = new URLSearchParams({ q: query, locale });
  const response = await authGet(`/v1/catalog/clubs/search?${params}`, accessToken);

  if (!response.ok) {
    throw new Error("Kunne ikke søge i kataloget");
  }

  return catalogClubSearchResponseSchema.parse(await response.json()) as CatalogClubSearchResponse;
}

export async function fetchClubSeasons(accessToken: string, clubId: string, locale = "da") {
  const params = new URLSearchParams({ locale });
  const response = await authGet(`/v1/catalog/clubs/${clubId}/seasons?${params}`, accessToken);

  if (!response.ok) {
    throw new Error("Kunne ikke hente sæsoner");
  }

  return catalogClubSeasonsResponseSchema.parse(
    await response.json(),
  ) as CatalogClubSeasonsResponse;
}
