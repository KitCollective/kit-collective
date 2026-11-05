import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type PluginEntry = [
  string,
  { appID: string; clientToken: string; displayName: string; scheme: string },
];
type IntentFilter = {
  action: string;
  autoVerify: boolean;
  data: { scheme: string; host: string; pathPrefix?: string; path?: string }[];
  category: string[];
};
type ExpoConfigLike = {
  name: string;
  slug: string;
  plugins?: unknown[];
  ios?: { bundleIdentifier?: string; associatedDomains?: string[] };
  android?: { package?: string; intentFilters?: IntentFilter[] };
};
type AppConfigFn = (ctx: { config: ExpoConfigLike }) => ExpoConfigLike;

const requireCjs = createRequire(import.meta.url);
// SAFETY: app.config.js is committed CJS; tests only call the exported function.
const appConfig = requireCjs("../app.config.js") as AppConfigFn;
// SAFETY: the plugin is a CJS config-plugin function; the test only calls it to see whether validation throws.
const fbsdkPlugin = (
  requireCjs("react-native-fbsdk-next/app.plugin.js") as {
    default: (config: ExpoConfigLike, props: PluginEntry[1]) => unknown;
  }
).default;

const APP_ID = "EXPO_PUBLIC_FACEBOOK_APP_ID";
const CLIENT_TOKEN = "EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN";

const baseConfig = (plugins: unknown[] = []): ExpoConfigLike => ({
  name: "KitCollective",
  slug: "kit-collective",
  plugins,
});

const facebookEntry = (resolved: ExpoConfigLike): PluginEntry => {
  const entry = (resolved.plugins ?? []).find(
    (plugin): plugin is PluginEntry =>
      Array.isArray(plugin) && plugin[0] === "react-native-fbsdk-next",
  );
  if (!entry) throw new Error("react-native-fbsdk-next plugin entry missing");
  return entry;
};

describe("app.config.js Facebook plugin props", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = { [APP_ID]: process.env[APP_ID], [CLIENT_TOKEN]: process.env[CLIENT_TOKEN] };
    delete process.env[APP_ID];
    delete process.env[CLIENT_TOKEN];
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("lets the Facebook plugin run when both env names are unset", () => {
    const resolved = appConfig({ config: baseConfig() });
    const entry = facebookEntry(resolved);
    expect(() => fbsdkPlugin(resolved, entry[1])).not.toThrow();
  });

  it("passes the trimmed env values through when both are set", () => {
    process.env[APP_ID] = "  1234567890  ";
    process.env[CLIENT_TOKEN] = "\ttoken-abc\n";
    const [, props] = facebookEntry(appConfig({ config: baseConfig() }));
    expect(props).toEqual({
      appID: "1234567890",
      clientToken: "token-abc",
      displayName: "KitCollective",
      scheme: "kitcollective",
    });
  });

  it("keeps existing plugins before the Facebook entry", () => {
    const resolved = appConfig({ config: baseConfig(["expo-router", ["expo-camera", {}]]) });
    expect(resolved.plugins?.slice(0, 2)).toEqual(["expo-router", ["expo-camera", {}]]);
    expect(resolved.plugins?.[2]).toEqual(facebookEntry(resolved));
    expect(resolved.plugins).toHaveLength(3);
  });

  it("falls back to a placeholder for each blank value independently", () => {
    process.env[APP_ID] = "   ";
    process.env[CLIENT_TOKEN] = "real-token";
    const [, onlyTokenSet] = facebookEntry(appConfig({ config: baseConfig() }));
    expect(onlyTokenSet.appID).toBe("000000000000000");
    expect(onlyTokenSet.clientToken).toBe("real-token");

    process.env[APP_ID] = "987654321";
    process.env[CLIENT_TOKEN] = "";
    const [, onlyAppIdSet] = facebookEntry(appConfig({ config: baseConfig() }));
    expect(onlyAppIdSet.appID).toBe("987654321");
    expect(onlyAppIdSet.clientToken).toBe("local-build");
  });
});

describe("app.config.js mail links", () => {
  const withNative = (): ExpoConfigLike => ({
    ...baseConfig(),
    ios: { bundleIdentifier: "app.kitcollective.mobile" },
    android: { package: "app.kitcollective.mobile" },
  });

  it("registers universal links on the product domain and keeps the bundle identifier", () => {
    const { ios } = appConfig({ config: withNative() });
    expect(ios?.associatedDomains).toEqual(["applinks:kitcollective.app"]);
    expect(ios?.bundleIdentifier).toBe("app.kitcollective.mobile");
  });

  it("registers verified app links for the three path groups and keeps the package", () => {
    const { android } = appConfig({ config: withNative() });
    expect(android?.package).toBe("app.kitcollective.mobile");
    expect(android?.intentFilters).toHaveLength(1);
    const [filter] = android?.intentFilters ?? [];
    expect(filter?.action).toBe("VIEW");
    expect(filter?.autoVerify).toBe(true);
    expect(filter?.category).toEqual(["BROWSABLE", "DEFAULT"]);
    expect(filter?.data).toEqual([
      { scheme: "https", host: "kitcollective.app", pathPrefix: "/c/" },
      { scheme: "https", host: "kitcollective.app", pathPrefix: "/j/" },
      { scheme: "https", host: "kitcollective.app", path: "/plus" },
    ]);
  });

  it("keeps filters and domains the base config already has", () => {
    const base = withNative();
    base.ios = { ...base.ios, associatedDomains: ["webcredentials:example.com"] };
    const existing: IntentFilter = {
      action: "VIEW",
      autoVerify: false,
      data: [{ scheme: "kitcollective", host: "x" }],
      category: ["BROWSABLE"],
    };
    base.android = { ...base.android, intentFilters: [existing] };
    const resolved = appConfig({ config: base });
    expect(resolved.ios?.associatedDomains).toEqual([
      "webcredentials:example.com",
      "applinks:kitcollective.app",
    ]);
    expect(resolved.android?.intentFilters?.[0]).toEqual(existing);
    expect(resolved.android?.intentFilters).toHaveLength(2);
  });
});
