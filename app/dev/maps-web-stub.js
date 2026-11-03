// Web-only stand-in for react-native-maps, used for testing screens in a browser.
const React = require('react');
const { View } = require('react-native');
const MapView = React.forwardRef((p, ref) => {
  React.useImperativeHandle(ref, () => ({ animateCamera() {}, fitToCoordinates() {}, animateToRegion() {} }));
  return React.createElement(View, { style: [{ backgroundColor: '#E4E9E0' }, p.style] }, p.children);
});
const Noop = () => null;
module.exports = { __esModule: true, default: MapView, Marker: Noop, Polyline: Noop, Callout: Noop, Circle: Noop, PROVIDER_DEFAULT: undefined, PROVIDER_GOOGLE: 'google' };
