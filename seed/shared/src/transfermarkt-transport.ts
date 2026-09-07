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

export type TransfermarktTransport = { mode: "direct" } | { mode: "proxy"; proxyUrl: string };

/** Env bag for Transfermarkt transport. Callers pass `process.env`. */
export type TransfermarktTransportEnv = Record<string, string | undefined>;

/**
 * Policy seam for live Transfermarkt HTTP. Football Kit Archive never uses this.
 *
 * 1. SEED_TM_TRANSPORT=direct → direct (ignore URL / REQUIRE_PROXY).
 * 2. SEED_TM_TRANSPORT=proxy → proxy, fail closed without SEED_PROXY_URL.
 * 3. Else SEED_REQUIRE_PROXY truthy → proxy, fail closed without URL.
 * 4. Else Desktop/local default → direct even when SEED_PROXY_URL is set.
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

  if (isTruthy(env.SEED_REQUIRE_PROXY)) {
    if (!proxyUrl) {
      throw missingProxyUrlError("SEED_REQUIRE_PROXY");
    }
    return { mode: "proxy", proxyUrl };
  }

  return { mode: "direct" };
}
