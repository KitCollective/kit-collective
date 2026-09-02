const appJson = require("./app.json");

module.exports = () => {
  const appID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() ?? "";
  const clientToken = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN?.trim() ?? "";
  return {
    expo: {
      ...appJson.expo,
      plugins: [
        ...appJson.expo.plugins,
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
    },
  };
};
