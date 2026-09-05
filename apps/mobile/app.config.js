module.exports = ({ config }) => {
  const appID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() ?? "";
  const clientToken = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN?.trim() ?? "";
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
