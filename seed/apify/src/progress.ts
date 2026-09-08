/** Stderr progress for live seed CLI. JSON results stay on stdout. */

export function seedProgress(line: string): void {
  process.stderr.write(`[seed] ${line}\n`);
}

export function safeSeedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "(url)";
  }
}

export function describeSeedError(error: unknown): string {
  if (error && typeof error === "object") {
    const name = "name" in error ? String(error.name) : "";
    const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
    const url =
      "url" in error && typeof error.url === "string" ? safeSeedUrl(error.url) : undefined;

    if (name === "TransfermarktProxyQuotaError") {
      const reason = "reason" in error && typeof error.reason === "string" ? error.reason : "quota";
      const where = url ? ` for ${url}` : "";
      return `Site Unblocker refused the request (HTTP ${status ?? 402}, ${reason})${where}. Top up the plan; do not switch to SEED_TM_TRANSPORT=direct to work around it.`;
    }

    if (name === "TransfermarktCircuitOpenError") {
      return "Transfermarkt circuit open: consecutive HTTP 403/429 or WAF responses. Stopped. Check the Site Unblocker plan balance before switching SEED_TM_TRANSPORT=direct.";
    }

    if (name === "TransfermarktWafChallengeError") {
      const where = url ? ` for ${url}` : "";
      return `Transfermarkt served the AWS WAF challenge (HTTP ${status ?? 202})${where}, not the page.`;
    }

    if (name === "TransfermarktThinResponseError") {
      const where = url ? ` for ${url}` : "";
      const bytes = "bytes" in error && typeof error.bytes === "number" ? error.bytes : undefined;
      return `Transfermarkt answered ${bytes ?? "too few"} bytes${where}, too small to be a page. Transient relay artefact.`;
    }

    if (name === "TransfermarktHttpError" && status !== undefined) {
      const where = url ? ` for ${url}` : "";
      if (status === 403) {
        return `Transfermarkt refused (HTTP 403)${where}. Typical WAF/geo block after 3 retries.`;
      }
      if (status === 429) {
        return `Transfermarkt rate-limited (HTTP 429)${where}. Slowed or blocked after 3 retries.`;
      }
      if (status === 404) {
        return `Transfermarkt page missing (HTTP 404)${where}.`;
      }
      if (status >= 500) {
        return `Transfermarkt upstream error (HTTP ${status})${where}. Transient on their edge.`;
      }
      return `Transfermarkt HTTP ${status}${where}.`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
