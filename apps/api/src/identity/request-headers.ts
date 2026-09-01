import type { FastifyRequest } from "fastify";

export function headersFromRequest(request: FastifyRequest): Headers {
  const headers = new Headers();
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.length > 0) {
    headers.set("authorization", authorization);
  }
  return headers;
}

export function bearerTokenFromAuthorization(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] ?? null;
}
