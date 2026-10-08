const TRUTHY = new Set(["1", "true", "yes", "on"]);

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return TRUTHY.has(value.trim().toLowerCase());
}

function proxyUrlFrom(env: TransfermarktTransportEnv): string | undefined {
  return env.SEED_PROXY_URL?.trim() || undefined;
}

function missingProxyUrlError(cause: "SEED_TM_TRANSPORT=proxy" | "SEED_REQUIRE_PROXY"): Error {
  return new Error(
    `${cause} is set but SEED_PROXY_URL is missing. Refusing live Transfermarkt fetch without a proxy.`,
  );
}

/**
 * No transport signal at all used to mean "direct". A run started without `--env-file=.env`,
 * or with a mistyped variable name, then walked Transfermarkt from the operator's own IP —
 * exactly the address the AWS WAF burns. Direct is an opt-in now.
 */
function unrequestedDirectError(): Error {
  return new Error(
    "No Transfermarkt transport is configured: SEED_PROXY_URL is missing. Refusing to fetch from this machine's IP by default. Set SEED_PROXY_URL (Site Unblocker), or ask for the bare IP with SEED_TM_TRANSPORT=direct.",
  );
}

function unknownTransportError(value: string): Error {
  return new Error(
    `SEED_TM_TRANSPORT=${value} is not a transport. Use "proxy" (Site Unblocker) or "direct" (this machine's IP).`,
  );
}

export type TransfermarktTransport = { mode: "direct" } | { mode: "proxy"; proxyUrl: string };

/** Env bag for Transfermarkt transport. Callers pass `process.env`. */
export type TransfermarktTransportEnv = Record<string, string | undefined>;

/**
 * Policy seam for live Transfermarkt HTTP. Football Kit Archive never uses this.
 *
 * 1. SEED_TM_TRANSPORT=direct → direct (ignore URL / REQUIRE_PROXY).
 * 2. SEED_TM_TRANSPORT=proxy → proxy, fail closed without SEED_PROXY_URL.
 * 3. SEED_TM_TRANSPORT set to anything else → throw; a typo must not pick a transport.
 * 4. Else SEED_REQUIRE_PROXY truthy → proxy, fail closed without URL.
 * 5. Else SEED_PROXY_URL configured → proxy, Desktop included (ADR-0043 supersedes ADR-0042).
 * 6. Else → throw. Direct is never the fallback nobody asked for.
 */
export function resolveTransfermarktTransport(
  env: TransfermarktTransportEnv,
): TransfermarktTransport {
  const transport = env.SEED_TM_TRANSPORT?.trim().toLowerCase();
  const proxyUrl = proxyUrlFrom(env);

  if (transport === "direct") {
    return { mode: "direct" };
  }

  if (transport === "proxy") {
    if (!proxyUrl) {
      throw missingProxyUrlError("SEED_TM_TRANSPORT=proxy");
    }
    return { mode: "proxy", proxyUrl };
  }

  if (transport) {
    throw unknownTransportError(transport);
  }

  if (isTruthy(env.SEED_REQUIRE_PROXY)) {
    if (!proxyUrl) {
      throw missingProxyUrlError("SEED_REQUIRE_PROXY");
    }
    return { mode: "proxy", proxyUrl };
  }

  if (proxyUrl) {
    return { mode: "proxy", proxyUrl };
  }

  throw unrequestedDirectError();
}
