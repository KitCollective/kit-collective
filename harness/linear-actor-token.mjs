/**
 * Pi OAuth app actor token (KIT-74).
 * Agent activity mutations require actor=app, not a personal lin_api_ key.
 * Tokens expire in ~30 days; refresh on 401 via client_credentials.
 */

export const LINEAR_OAUTH_TOKEN_URL = "https://api.linear.app/oauth/token";
export const ACTOR_TOKEN_REFRESH_DAYS = 30;

/**
 * @param {string} token
 */
export function gitAuthExtraHeader(token) {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return `Authorization: Basic ${basic}`;
}

/**
 * @param {unknown} error
 */
export function isLinearUnauthorized(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("unexpected authentication method")
  );
}

/**
 * @param {{
 *   clientId: string,
 *   clientSecret: string,
 *   fetchImpl?: typeof fetch,
 * }} input
 */
export async function mintPiAccessToken({ clientId, clientSecret, fetchImpl = fetch }) {
  const response = await fetchImpl(LINEAR_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "read write app:assignable app:mentionable",
    }),
  });
  if (!response.ok) {
    throw new Error(`Linear actor token mint failed: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (typeof payload?.access_token !== "string" || payload.access_token.length === 0) {
    throw new Error("Linear actor token mint returned no access_token");
  }
  return payload.access_token;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   mint?: typeof mintPiAccessToken,
 * }} [deps]
 */
export function createActorTokenProvider({
  env = process.env,
  fetchImpl = fetch,
  mint = mintPiAccessToken,
} = {}) {
  let cached =
    typeof env.LINEAR_PI_ACCESS_TOKEN === "string" && env.LINEAR_PI_ACCESS_TOKEN.length > 0
      ? env.LINEAR_PI_ACCESS_TOKEN
      : undefined;

  async function mintToken() {
    const clientId = env.LINEAR_PI_CLIENT_ID;
    const clientSecret = env.LINEAR_PI_CLIENT_SECRET;
    if (
      typeof clientId !== "string" ||
      clientId.length === 0 ||
      typeof clientSecret !== "string" ||
      clientSecret.length === 0
    ) {
      throw new Error(
        "LINEAR_PI_CLIENT_ID and LINEAR_PI_CLIENT_SECRET are required to mint actor token",
      );
    }
    cached = await mint({ clientId, clientSecret, fetchImpl });
    return cached;
  }

  return {
    /**
     * @returns {Promise<string>}
     */
    async getToken() {
      if (typeof cached === "string" && cached.length > 0) {
        return cached;
      }
      return mintToken();
    },
    /**
     * @returns {Promise<string>}
     */
    async refresh() {
      cached = undefined;
      return mintToken();
    },
    invalidate() {
      cached = undefined;
    },
  };
}
