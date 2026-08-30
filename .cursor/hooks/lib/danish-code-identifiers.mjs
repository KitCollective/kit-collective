import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DANISH_IDENTIFIER_STEMS = [
  "indstillinger",
  "kontoindstillinger",
  "fødselsdag",
  "foedselsdag",
  "adgangskode",
  "notifikationer",
  "privatliv",
  "moerktilstand",
  "brugernavn",
];

const DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-zÀ-ÿ_$][\wÀ-ÿ$]*)/;

/**
 * @param {string} name
 * @returns {string}
 */
function foldIdent(name) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Scan unified-diff text. Only lines that start with `+` (added) are considered.
 * String literals and JSX copy are ignored — declarations only.
 *
 * @param {string} diffText
 * @returns {{ name: string, stem: string, line: string }[]}
 */
export function findDanishCodeIdentifiers(diffText) {
  /** @type {{ name: string, stem: string, line: string }[]} */
  const hits = [];
  for (const raw of String(diffText).split("\n")) {
    if (!raw.startsWith("+") || raw.startsWith("+++")) {
      continue;
    }
    const trimmed = raw.slice(1).trim();
    const match = trimmed.match(DECLARATION);
    if (!match) {
      continue;
    }
    const name = match[1];
    const folded = foldIdent(name);
    for (const stem of DANISH_IDENTIFIER_STEMS) {
      if (folded.includes(foldIdent(stem))) {
        hits.push({ name, stem, line: trimmed });
        break;
      }
    }
  }
  return hits;
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const diff = readFileSync(0, "utf8");
  const hits = findDanishCodeIdentifiers(diff);
  if (hits.length > 0) {
    process.stdout.write([...new Set(hits.map((hit) => hit.name))].join(", "));
  }
}
