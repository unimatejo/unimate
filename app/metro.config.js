const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (ctx, name, platform) => {
  if (platform === 'web' && name === 'react-native-maps') return { type: 'sourceFile', filePath: path.join(__dirname, 'dev/maps-web-stub.js') };
  return (resolve ?? ctx.resolveRequest)(ctx, name, platform);
};
module.exports = config;
