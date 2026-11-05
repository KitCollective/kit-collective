// Non-release placeholders so prebuild runs without Facebook credentials. Release builds must set real values.
const PLACEHOLDER_FACEBOOK_APP_ID = "000000000000000";
const PLACEHOLDER_FACEBOOK_CLIENT_TOKEN = "local-build";

// Mail links (src/links/mail-link.ts): https://kitcollective.app/c/..., /j/... and /plus open the app.
// tests/mail-link-web.test.ts keeps these paths in step with the link table and the web files.
const LINK_HOST = "kitcollective.app";

module.exports = ({ config }) => {
  const appID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() || PLACEHOLDER_FACEBOOK_APP_ID;
  const clientToken =
    process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN?.trim() || PLACEHOLDER_FACEBOOK_CLIENT_TOKEN;
  return {
    ...config,
    ios: {
      ...config.ios,
      associatedDomains: [...(config.ios?.associatedDomains ?? []), `applinks:${LINK_HOST}`],
    },
    android: {
      ...config.android,
      intentFilters: [
        ...(config.android?.intentFilters ?? []),
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: LINK_HOST, pathPrefix: "/c/" },
            { scheme: "https", host: LINK_HOST, pathPrefix: "/j/" },
            { scheme: "https", host: LINK_HOST, path: "/plus" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        "react-native-fbsdk-next",
        {
          appID,
          clientToken,
          displayName: "KitCollective",
          scheme: "kitcollective",
        },
      ],
    ],
  };
};
