import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Product values (team key, workflow names, labels, states) come from the board
// config. Only the example seeds under `examples/` may name one product's values.
const root = fileURLToPath(new URL("..", import.meta.url));
const skipped = new Set(["node_modules", "dist", "examples"]);
const self = relative(root, fileURLToPath(import.meta.url));
const productNames = [
  /\bKIT\b/,
  /KitCollective/i,
  /kit-collective/i,
  /kit-issue/,
  /afk-developer/,
  /To-do/,
  /ready-for-agent/,
  /needs-info/,
  /Samling/,
  /Nicklas/,
];

function pluginFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skipped.has(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? pluginFiles(path) : [relative(root, path)];
  });
}

describe("product neutrality", () => {
  it("names no product outside the example seeds", () => {
    const files = pluginFiles(root).filter((file) => file !== self && /\.(ts|tsx|md|json)$/.test(file));
    expect(files).toContain("server.ts");
    const hits = files.flatMap((file) =>
      readFileSync(join(root, file), "utf8")
        .split("\n")
        .flatMap((line, index) =>
          productNames.filter((name) => name.test(line)).map((name) => `${file}:${index + 1} ${name}`),
        ),
    );
    expect(hits).toEqual([]);
  });
});
