const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const originalResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules || {}),
    'expo-web-browser': path.resolve(__dirname, 'src/shims/expo-web-browser.js'),
    'expo-auth-session': path.resolve(__dirname, 'src/shims/expo-auth-session.js'),
    'expo-apple-authentication': path.resolve(__dirname, 'src/shims/expo-apple-authentication.js'),
  },
  resolveRequest: (context, moduleName, platform) => {
    if (
      moduleName === 'react-native-web/dist/exports/AssetRegistry' ||
      moduleName === 'react-native/asset-registry'
    ) {
      return {
        filePath: path.resolve(__dirname, 'node_modules/react-native/src/asset-registry.js'),
        type: 'sourceFile',
      };
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
