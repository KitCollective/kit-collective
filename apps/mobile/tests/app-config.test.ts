import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type PluginEntry = [
  string,
  { appID: string; clientToken: string; displayName: string; scheme: string },
];
type ExpoConfigLike = { name: string; slug: string; plugins?: unknown[] };
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
