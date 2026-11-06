import { themePref, type ThemePref } from '@/lib/theme';

/**
 * Every colour of the campus map in one place, for the app's three looks. The map draws its own style (no labels
 * from the tile server: names are the app's own, in its font), so this file is the whole look of the map.
 */
export type MapTheme = {
  bg: string; land: string; water: string; grass: string; wood: string; pitch: string; pitchLine: string; plaza: string;
  parking: string; road: string; roadEdge: string; foot: string; steps: string;
  city: string; building: string; campusBuilding: string; highlight: string; approx: string; shadow: string; shadowOpacity: number;
  tree: string; trunk: string; campusEdge: string; campusFill: string;
  route: string; routeGlow: string; light: { color: string; intensity: number };
};

const LIGHT: MapTheme = {
  bg: '#EEF0F3', land: '#F3F1EC', water: '#A9D3F5', grass: '#CFE8BE', wood: '#B5DBA0', pitch: '#9FD67F', pitchLine: '#FFFFFF', plaza: '#ECE8E0',
  parking: '#E3E5EA', road: '#FFFFFF', roadEdge: '#D9DCE3', foot: '#FFFFFF', steps: '#C9A37A',
  city: '#E2E2E6', building: '#ECE9E4', campusBuilding: '#F7F3EC', highlight: '#FF7A5C', approx: '#E9E2F7', shadow: '#6B6F80', shadowOpacity: 0.22,
  tree: '#7DBE63', trunk: '#8A6A4A', campusEdge: '#9AA3B8', campusFill: '#FAF8F4',
  route: '#2E7BFF', routeGlow: '#FFFFFF', light: { color: '#FFF6E8', intensity: 0.42 },
};
const MIDNIGHT: MapTheme = {
  bg: '#0B1028', land: '#121A3D', water: '#1E3A78', grass: '#1C3A3A', wood: '#1A4036', pitch: '#235742', pitchLine: '#8FB7A6', plaza: '#1A2350',
  parking: '#18214A', road: '#26316A', roadEdge: '#0E1430', foot: '#33408A', steps: '#7A6A90',
  city: '#1C2552', building: '#252F66', campusBuilding: '#33408A', highlight: '#FF7A5C', approx: '#3B3478', shadow: '#03050F', shadowOpacity: 0.45,
  tree: '#2F7A5A', trunk: '#4A3A55', campusEdge: '#5B68A8', campusFill: '#141D45',
  route: '#5AA2FF', routeGlow: '#0B1028', light: { color: '#C9D4FF', intensity: 0.32 },
};
const BLACK: MapTheme = {
  ...MIDNIGHT,
  bg: '#04060C', land: '#0B0E1A', water: '#13284F', grass: '#122A26', wood: '#113024', pitch: '#18402F', plaza: '#121628',
  parking: '#10142A', road: '#1C2240', roadEdge: '#04060C', foot: '#252C52',
  city: '#141A30', building: '#1B2140', campusBuilding: '#262E58', approx: '#2A2652', shadow: '#000000', shadowOpacity: 0.55,
  tree: '#246247', campusEdge: '#3E4778', campusFill: '#0A0D1C', routeGlow: '#04060C',
};

const BY: Record<ThemePref, MapTheme> = { light: LIGHT, midnight: MIDNIGHT, black: BLACK };
export const mapTheme = (): MapTheme => BY[themePref()];
