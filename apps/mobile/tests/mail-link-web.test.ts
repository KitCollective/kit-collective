import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAIL_LINK_PATHS, resolveMailLink } from "@/links/mail-link";

const WEB_PUBLIC = path.resolve(__dirname, "../../web/public");
const requireCjs = createRequire(import.meta.url);

type AppConfig = {
  ios: { associatedDomains: string[] };
  android: { intentFilters: { data: { pathPrefix?: string; path?: string }[] }[] };
};
// SAFETY: app.config.js is committed CJS; the test only calls the exported function.
const appConfig = (requireCjs("../app.config.js") as (ctx: { config: object }) => AppConfig)({
  config: {},
});

// A link path is covered either by its first segment as a prefix ("/c/*") or, with no further
// segment, exactly ("/plus"). This is the form the three platforms register.
const covered = [
  ...new Set(
    MAIL_LINK_PATHS.map((linkPath) => {
      const [first, ...rest] = linkPath.split("/").slice(1);
      return rest.length > 0 ? `/${first}/*` : `/${first}`;
    }),
  ),
].sort();

const readPublic = (file: string): string => readFileSync(path.join(WEB_PUBLIC, file), "utf8");

describe("mail link coverage", () => {
  it("lists the paths of the link table", () => {
    expect(covered).toEqual(["/c/*", "/j/*", "/plus"]);
  });

  it("resolves a link built from each path to a screen, not home", () => {
    for (const linkPath of MAIL_LINK_PATHS) {
      const link = linkPath.replace(/:\w+/g, "abc123");
      expect(resolveMailLink(`https://kitcollective.app${link}`).kind).not.toBe("home");
    }
  });

  it("registers exactly these paths for iOS universal links", () => {
    // SAFETY: the file is committed JSON in the shape the test reads; a drift fails the assertions.
    const aasa = JSON.parse(readPublic(".well-known/apple-app-site-association")) as {
      applinks: { details: { appIDs: string[]; components: { "/": string }[] }[] };
    };
    expect(aasa.applinks.details).toHaveLength(1);
    const [detail] = aasa.applinks.details;
    expect(detail?.components.map((component) => component["/"]).sort()).toEqual(covered);
    expect(detail?.appIDs.every((id) => id.endsWith(".app.kitcollective.mobile"))).toBe(true);
    expect(appConfig.ios.associatedDomains).toContain("applinks:kitcollective.app");
  });

  it("registers exactly these paths for Android app links", () => {
    const [filter] = appConfig.android.intentFilters;
    const fromConfig = (filter?.data ?? [])
      .map((entry) => (entry.pathPrefix ? `${entry.pathPrefix}*` : entry.path))
      .sort();
    expect(fromConfig).toEqual(covered);

    // SAFETY: the file is committed JSON in the shape the test reads; a drift fails the assertions.
    const assetlinks = JSON.parse(readPublic(".well-known/assetlinks.json")) as {
      relation: string[];
      target: { package_name: string };
    }[];
    expect(assetlinks[0]?.relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(assetlinks[0]?.target.package_name).toBe("app.kitcollective.mobile");
  });

  it("serves the store page for exactly these paths when the app is not installed", () => {
    const rules = readPublic("_redirects")
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.startsWith("#"))
      .map((line) => line.trim().split(/\s+/));
    expect(rules.map(([source]) => source).sort()).toEqual(covered);
    for (const [, destination, status] of rules) {
      expect([destination, status]).toEqual(["/open/", "200"]);
    }
  });

  it("shows the wordmark and a store link, and runs no script that could show private data", () => {
    const page = readPublic("open/index.html");
    expect(page).toContain('aria-label="KitCollective"');
    expect(page).toContain("play.google.com/store/apps/details?id=app.kitcollective.mobile");
    expect(page).not.toMatch(/<script/i);
  });
});
