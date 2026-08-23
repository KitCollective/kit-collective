const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/v1";

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, "");
}

/** Join API base (…/v1) with a contract path; strips a redundant /v1 prefix from legacy photoPath values. */
export function joinApiPath(base: string, path: string): string {
  const normalizedBase = base.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/v1/") ? path.slice(3) : path;
  return `${normalizedBase}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(joinApiPath(getApiBase(), path), {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    // SAFETY: Admin SPA only calls JSON endpoints that return a body; 204 is treated as void.
    return undefined as T;
  }

  const body: unknown = await response.json();
  // SAFETY: Callers pass the expected response schema type and validate with Zod at the seam.
  return body as T;
}
