// Metro config for @kit/mobile.
// Adds react-native-svg-transformer so `.svg` files import as React components,
// keeping brand hex inside the SVG assets (not in scanned .ts/.tsx). Isolated —
// the only change is routing `.svg` through the SVG transformer.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve("react-native-svg-transformer/expo");
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = config;
