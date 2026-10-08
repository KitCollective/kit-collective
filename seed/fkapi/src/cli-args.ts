import {
  formatSeedScopeUsage,
  type ParsedSeedScope,
  type ParseSeedScopeResult,
  parseSeedScopeArgv,
} from "@kit/seed-shared";

export type { ParsedSeedScope, ParseSeedScopeResult };

export function parseCliArgs(argv: string[]): ParseSeedScopeResult {
  return parseSeedScopeArgv(argv);
}

export function formatCliUsage(): string {
  return formatSeedScopeUsage("kit-seed-fkapi");
}
