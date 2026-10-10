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
  "komigang",
  "tilfoej",
  "tilføj",
  "fortsaet",
  "fortsæt",
  "trøje",
  "troeje",
];

/** Danish letters never belong in a declared name (KIT-272 review 4 widened the gate). */
const DANISH_LETTERS = /[æøåÆØÅ]/;

/** Code files whose names are checked. Expo route files are shipped URLs and stay Danish. */
const CODE_FILE = /\.(?:tsx?|jsx?|mjs|cjs|mts|cts)$/;
const ROUTE_SLUG_PREFIX = "apps/mobile/app/";

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
    if (DANISH_LETTERS.test(name)) {
      hits.push({ name, stem: "æøå", line: trimmed });
      continue;
    }
    for (const stem of DANISH_IDENTIFIER_STEMS) {
      if (folded.includes(foldIdent(stem))) {
        hits.push({ name, stem, line: trimmed });
        break;
      }
    }
  }
  return hits;
}

/**
 * File names are identifiers too (code-english rule). Shipped Expo route slugs under
 * apps/mobile/app/ are product URLs and are skipped.
 *
 * @param {string[]} paths
 * @returns {{ path: string, stem: string }[]}
 */
export function findDanishFileNames(paths) {
  /** @type {{ path: string, stem: string }[]} */
  const hits = [];
  for (const path of paths) {
    if (!CODE_FILE.test(path) || path.startsWith(ROUTE_SLUG_PREFIX)) {
      continue;
    }
    const base = path.split("/").pop() ?? path;
    if (DANISH_LETTERS.test(base)) {
      hits.push({ path, stem: "æøå" });
      continue;
    }
    const folded = foldIdent(base);
    const stem = DANISH_IDENTIFIER_STEMS.find((candidate) => folded.includes(foldIdent(candidate)));
    if (stem) {
      hits.push({ path, stem });
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
