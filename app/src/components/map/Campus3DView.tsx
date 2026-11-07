import type { DOMProps } from 'expo/dom';
import { forwardRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';

import type { CampusData, LL } from '@/lib/campus/data';
import type { MapTheme } from '@/lib/campus/theme';

import { MapMarkers, type MarkerSpec } from './markers';
import MapView, { type MapHandle } from './webMaps';

export type LatLng = { latitude: number; longitude: number };
export type Region = { latitude: number; longitude: number; longitudeDelta: number; zoom: number };

/** Everything the 3D campus needs, all plain data and callbacks, so it can also cross a web-view bridge. */
export type Campus3DProps = {
  theme: MapTheme;
  center: LatLng;
  highlight: string | null;
  route: LL[] | null;
  sat: boolean;
  markers: MarkerSpec[];
  onPin: (id: string) => Promise<void> | void;
  onBuilding: (b: { b: string | null; n: string | null; at: LatLng }) => Promise<void> | void;
  onRegion: (r: Region) => Promise<void> | void;
  /** the student moved the map by hand */
  onPanDrag: () => Promise<void> | void;
  onTap: () => Promise<void> | void;
  onReady: () => Promise<void> | void;
};

/** What the app drives: the camera. */
export type Campus3DHandle = Pick<MapHandle, 'animateCamera' | 'fitToCoordinates'>;

/** The same props on the web and on phones: the web passes `campus` itself, a phone its file's address (`file`, the
 *  view fetches it, so a megabyte of shapes doesn't cross the bridge on every render; offline it asks `getCampus`
 *  once) and its web view's options. */
export type Map3DProps = Campus3DProps & {
  campus?: CampusData | null; file?: string | null; dom?: DOMProps;
  /** phones without internet: the view asks the app for the copy it keeps on the phone (once) */
  getCampus?: () => Promise<CampusData | null>;
};

/** The 3D campus (MapLibre) with its markers: what the web page shows, and what a phone shows inside Campus3D. */
export const Campus3DView = forwardRef<Campus3DHandle, Campus3DProps & { campus: CampusData | null }>(function Campus3DView(
  { campus, theme, center, highlight, route, sat, markers, onPin, onBuilding, onRegion, onPanDrag, onTap, onReady }, ref) {
  return (
    <MapView ref={ref as Ref<MapHandle>} style={StyleSheet.absoluteFill} initialCamera={{ center, zoom: 16, heading: -18, pitch: 52 }} mapType={sat ? 'hybrid' : 'standard'}
      campus={campus} theme={theme} highlight={highlight} route={route}
      onBuildingPress={(b) => onBuilding({ b: b.b, n: b.n, at: b.at })} onRegionChangeComplete={(r) => onRegion(r)} onPanDrag={() => onPanDrag()} onPress={() => onTap()} onReady={() => onReady()}>
      <MapMarkers specs={markers} onPin={(id) => onPin(id)} />
    </MapView>
  );
});
