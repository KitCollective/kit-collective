import {
  catalogClubSearchResponseSchema,
  catalogClubSeasonsResponseSchema,
  catalogFacetSearchResponseSchema,
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

  return catalogClubSearchResponseSchema.parse(await response.json());
}

export async function searchCatalogCountries(accessToken: string, query: string, locale = "da") {
  const params = new URLSearchParams({ q: query, locale });
  const response = await authGet(`/v1/catalog/countries/search?${params}`, accessToken);

  if (!response.ok) {
    throw new Error("Kunne ikke søge i kataloget");
  }

  return catalogFacetSearchResponseSchema.parse(await response.json());
}

export async function searchCatalogLeagues(accessToken: string, query: string, locale = "da") {
  const params = new URLSearchParams({ q: query, locale });
  const response = await authGet(`/v1/catalog/leagues/search?${params}`, accessToken);

  if (!response.ok) {
    throw new Error("Kunne ikke søge i kataloget");
  }

  return catalogFacetSearchResponseSchema.parse(await response.json());
}

export async function searchCatalogPlayers(accessToken: string, query: string, locale = "da") {
  const params = new URLSearchParams({ q: query, locale });
  const response = await authGet(`/v1/catalog/players/search?${params}`, accessToken);

  if (!response.ok) {
    throw new Error("Kunne ikke søge i kataloget");
  }

  return catalogFacetSearchResponseSchema.parse(await response.json());
}

export async function fetchClubSeasons(accessToken: string, clubId: string) {
  const response = await authGet(`/v1/catalog/clubs/${clubId}/seasons`, accessToken);

  if (!response.ok) {
    throw new Error("Kunne ikke hente sæsoner");
  }

  return catalogClubSeasonsResponseSchema.parse(await response.json());
}
