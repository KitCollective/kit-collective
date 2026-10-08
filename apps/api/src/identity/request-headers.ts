import type { FastifyRequest } from "fastify";

export type RequestAttribution = {
  ipAddress: string | null;
  userAgent: string | null;
};

const USER_AGENT_MAX_LENGTH = 512;
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAPPED_IPV4_PATTERN = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

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

export function requestAttribution(request: FastifyRequest): RequestAttribution {
  return {
    ipAddress: clientIpFromRequest(request),
    userAgent: userAgentFromRequest(request),
  };
}

export function clientIpFromRequest(request: FastifyRequest): string | null {
  const remote = normalizeRemoteAddress(request.socket?.remoteAddress ?? request.ip);
  const forwarded = firstHeaderValue(request.headers["x-forwarded-for"]);

  if (forwarded && remote && isTrustedProxyHop(remote)) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const clientHop = hops[hops.length - 1];
    if (clientHop) {
      return coarsenIp(clientHop);
    }
  }

  if (!remote) {
    return null;
  }
  return coarsenIp(remote);
}

export function coarsenIp(raw: string): string | null {
  const ip = normalizeRemoteAddress(raw);
  if (!ip) {
    return null;
  }

  const ipv4 = IPV4_PATTERN.exec(ip);
  if (ipv4) {
    return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0`;
  }

  const groups = expandIpv6(ip);
  if (!groups) {
    return null;
  }
  return `${groups.slice(0, 4).join(":")}::`;
}

function userAgentFromRequest(request: FastifyRequest): string | null {
  const value = firstHeaderValue(request.headers["user-agent"]);
  if (!value) {
    return null;
  }
  return value.slice(0, USER_AGENT_MAX_LENGTH);
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.trim().length > 0);
    return first?.trim() ?? null;
  }
  return null;
}

function normalizeRemoteAddress(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "unknown") {
    return null;
  }
  const mapped = MAPPED_IPV4_PATTERN.exec(trimmed);
  return mapped?.[1] ?? trimmed;
}

function isTrustedProxyHop(ip: string): boolean {
  if (ip === "::1") {
    return true;
  }
  const ipv4 = IPV4_PATTERN.exec(ip);
  if (!ipv4) {
    return false;
  }
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 127) {
    return true;
  }
  if (a === 10) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  return false;
}

function expandIpv6(ip: string): string[] | null {
  if (!ip.includes(":")) {
    return null;
  }
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];
  if (ip.includes("::")) {
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) {
      return null;
    }
    return [...headParts, ...Array.from({ length: missing }, () => "0"), ...tailParts];
  }
  if (headParts.length !== 8) {
    return null;
  }
  return headParts;
}
