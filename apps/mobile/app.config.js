// Non-release placeholders so prebuild runs without Facebook credentials. Release builds must set real values.
const PLACEHOLDER_FACEBOOK_APP_ID = "000000000000000";
const PLACEHOLDER_FACEBOOK_CLIENT_TOKEN = "local-build";

module.exports = ({ config }) => {
  const appID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() || PLACEHOLDER_FACEBOOK_APP_ID;
  const clientToken =
    process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN?.trim() || PLACEHOLDER_FACEBOOK_CLIENT_TOKEN;
  return {
    ...config,
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
