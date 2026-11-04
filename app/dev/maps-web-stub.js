// Web version of react-native-maps for app.unimate.my, drawn with Leaflet.
// Supports what the app uses: MapView (camera, fit, satellite), Marker (custom views), Polyline.
const React = require('react');
const { View } = require('react-native');
require('leaflet/dist/leaflet.css');
const L = require('leaflet');

const Ctx = React.createContext(null);
const STREET = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

const MapView = React.forwardRef(function MapView(p, ref) {
  const box = React.useRef(null);
  const [map, setMap] = React.useState(null);
  const [, setTick] = React.useState(0);
  const layers = React.useRef([]);
  const cb = React.useRef(p);
  cb.current = p;

  React.useEffect(() => {
    if (!box.current) return undefined;
    const c = p.initialCamera?.center || (p.initialRegion && { latitude: p.initialRegion.latitude, longitude: p.initialRegion.longitude }) || { latitude: 32, longitude: 36 };
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, maxZoom: 20, zoomSnap: 0.25 }).setView([c.latitude, c.longitude], p.initialCamera?.zoom || 16);
    m.attributionControl.setPrefix('');
    const redraw = () => setTick((x) => x + 1);
    m.on('move zoom resize viewreset', redraw);
    m.on('moveend', () => {
      const b = m.getBounds();
      cb.current.onRegionChangeComplete?.({ latitude: m.getCenter().lat, longitude: m.getCenter().lng, latitudeDelta: b.getNorth() - b.getSouth(), longitudeDelta: b.getEast() - b.getWest() });
    });
    m.on('click', () => cb.current.onPress?.({}));
    setMap(m);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m.invalidateSize()) : null;
    ro?.observe(box.current);
    return () => { ro?.disconnect(); m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sat = typeof p.mapType === 'string' && /hybrid|satellite/.test(p.mapType);
  React.useEffect(() => {
    if (!map) return;
    layers.current.forEach((l) => l.remove());
    layers.current = sat
      ? [L.tileLayer(SAT, { maxZoom: 20, maxNativeZoom: 19, attribution: 'Esri' }), L.tileLayer(LABELS, { maxZoom: 20, maxNativeZoom: 19 })]
      : [L.tileLayer(STREET, { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap' })];
    layers.current.forEach((l) => l.addTo(map));
  }, [map, sat]);

  React.useImperativeHandle(ref, () => ({
    animateCamera(cam, o) {
      if (!map || !cam?.center) return;
      map.flyTo([cam.center.latitude, cam.center.longitude], cam.zoom ?? map.getZoom(), { duration: (o?.duration ?? 600) / 1000 });
    },
    animateToRegion(r, ms) { map?.flyTo([r.latitude, r.longitude], map.getZoom(), { duration: (ms ?? 600) / 1000 }); },
    fitToCoordinates(cs, o) {
      if (!map || !cs?.length) return;
      const e = o?.edgePadding || {};
      map.flyToBounds(L.latLngBounds(cs.map((x) => [x.latitude, x.longitude])), { paddingTopLeft: [e.left || 30, e.top || 30], paddingBottomRight: [e.right || 30, e.bottom || 30], duration: 0.7, maxZoom: 18 });
    },
  }), [map]);

  return React.createElement(View, { style: [{ overflow: 'hidden', backgroundColor: '#E4E9E0' }, p.style] },
    React.createElement('div', { ref: box, style: { position: 'absolute', inset: 0, zIndex: 0 } }),
    map && React.createElement(Ctx.Provider, { value: map },
      React.createElement(View, { pointerEvents: 'box-none', style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 500 } }, p.children)));
});

function Marker({ coordinate, children, onPress, anchor }) {
  const map = React.useContext(Ctx);
  if (!map || !coordinate) return null;
  const pt = map.latLngToContainerPoint([coordinate.latitude, coordinate.longitude]);
  const s = map.getSize();
  if (pt.x < -200 || pt.y < -200 || pt.x > s.x + 200 || pt.y > s.y + 200) return null;
  const ax = (anchor?.x ?? 0.5) * 100, ay = (anchor?.y ?? 1) * 100;
  return React.createElement(View, {
    onClick: onPress ? (e) => { e.stopPropagation(); onPress(e); } : undefined,
    style: { position: 'absolute', left: pt.x, top: pt.y, transform: [{ translateX: `-${ax}%` }, { translateY: `-${ay}%` }], cursor: onPress ? 'pointer' : 'default' },
  }, children || React.createElement(View, { style: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#3D5AFE', borderWidth: 2, borderColor: '#fff' } }));
}

function Polyline({ coordinates, strokeColor, strokeWidth, lineDashPattern }) {
  const map = React.useContext(Ctx);
  const key = JSON.stringify(coordinates);
  React.useEffect(() => {
    if (!map || !coordinates?.length) return undefined;
    const l = L.polyline(coordinates.map((c) => [c.latitude, c.longitude]), { color: strokeColor || '#3D5AFE', weight: strokeWidth || 4, dashArray: lineDashPattern ? lineDashPattern.join(' ') : undefined, interactive: false }).addTo(map);
    return () => { l.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, strokeColor, strokeWidth]);
  return null;
}

const Noop = () => null;
module.exports = { __esModule: true, default: MapView, Marker, Polyline, Callout: Noop, Circle: Noop, PROVIDER_DEFAULT: undefined, PROVIDER_GOOGLE: 'google' };
