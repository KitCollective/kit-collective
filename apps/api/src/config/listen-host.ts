/**
 * Bind address for the Nest HTTP server.
 * Production stays IPv4-all-interfaces (Docker healthchecks use 127.0.0.1).
 * Local default is IPv6 dual-stack so browsers that resolve localhost to ::1 can reach the API.
 */
export function apiListenHost(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.HOST?.trim();
  if (explicit) {
    return explicit;
  }
  if (env.NODE_ENV === "production") {
    return "0.0.0.0";
  }
  return "::";
}
