import type { AuthEventKind } from "@kit/api-contract";

export function formatAuthEventKind(kind: AuthEventKind): string {
  switch (kind) {
    case "login":
      return "Login";
    case "logout":
      return "Logout";
    case "failure":
      return "Failure";
    case "reset":
      return "Reset";
    case "provider_link":
      return "Provider link";
    case "lockout":
      return "Lockout";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function formatAuthDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
