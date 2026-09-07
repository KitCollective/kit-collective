import { createHash, timingSafeEqual } from "node:crypto";

export const SEED_MCP_TOKEN_ENV = "SEED_MCP_TOKEN";
export const SEED_MCP_URL_ENV = "SEED_MCP_URL";

const MISSING_TOKEN = "SEED_MCP_TOKEN is required to serve Streamable HTTP (fail closed)";

export type SeedMcpHttpRequest = {
  headers: { authorization?: string | string[] };
};

export type SeedMcpHttpResponse = {
  writeHead: (status: number) => void;
  end: (body?: string) => void;
};

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function requireSeedMcpTokenForHttp(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  const token = env[SEED_MCP_TOKEN_ENV];
  if (token == null || token.trim() === "") {
    throw new Error(MISSING_TOKEN);
  }
  return token;
}

export function authorizeSeedMcpBearer(
  authorizationHeader: string | string[] | undefined,
  token: string,
): boolean {
  const header = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (!header) {
    return false;
  }
  const expected = `Bearer ${token}`;
  return timingSafeEqual(sha256(header), sha256(expected));
}

/** Returns true when the request may continue. On deny, writes HTTP 401 and does not continue. */
export function applySeedMcpHttpAuth(
  req: SeedMcpHttpRequest,
  res: SeedMcpHttpResponse,
  token: string,
): boolean {
  if (authorizeSeedMcpBearer(req.headers.authorization, token)) {
    return true;
  }
  res.writeHead(401);
  res.end("Unauthorized");
  return false;
}
