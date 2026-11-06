import { memo, useMemo } from 'react';
import { Polygon, Polyline, type LatLng } from 'react-native-maps';

import { centroid, inside, type CampusData, type LL } from '@/lib/campus/data';
import type { MapTheme } from '@/lib/campus/theme';

/**
 * The campus on phones until the app's next build brings the MapLibre 3D view: the same file the web map draws, as
 * native shapes on the platform map. Campus outline, green areas and parking first, then the campus buildings (the
 * ones on campus or ours, the biggest first), and paths once you zoom in. Tapping a building opens it.
 */
const ll = (c: LL[]): LatLng[] => c.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
const MAX_BUILDINGS = 450; // native overlays are real views: enough for a campus, not for a whole district
const MAX_PATHS = 400;

type Props = {
  campus: CampusData; theme: MapTheme; zoom: number; highlight: string | null;
  onBuildingPress: (b: { b: string | null; n: string | null; at: { latitude: number; longitude: number } }) => void;
};

function NativeCampusImpl({ campus, theme, zoom, highlight, onBuildingPress }: Props) {
  const outlines = useMemo(() => campus.campuses?.length ? campus.campuses : campus.campus ? [campus.campus] : [], [campus]);
  const buildings = useMemo(() => {
    const on = (c: LL[]) => !outlines.length || outlines.some((r) => inside(centroid(c), r));
    // our buildings always; then the rest of the campus; parts never (their parent outline is drawn)
    return campus.buildings.filter((x) => x.k !== 'part' && (x.b || x.ap || on(x.c))).slice(0, MAX_BUILDINGS);
  }, [campus, outlines]);
  const paths = useMemo(() => campus.paths.filter((p) => p.t !== 'road').slice(0, MAX_PATHS), [campus]);
  const roads = useMemo(() => campus.paths.filter((p) => p.t === 'road').slice(0, MAX_PATHS), [campus]);

  return (
    <>
      {outlines.map((r, i) => <Polygon key={`c${i}`} coordinates={ll(r)} fillColor={theme.campusFill} strokeColor={theme.campusEdge} strokeWidth={1.5} lineDashPattern={[6, 4]} zIndex={1} />)}
      {campus.green.map((g, i) => (
        <Polygon key={`g${i}`} coordinates={ll(g.c)} strokeWidth={0} zIndex={2}
          fillColor={g.t === 'water' ? theme.water : g.t === 'pitch' ? theme.pitch : g.t === 'wood' ? theme.wood : g.t === 'plaza' ? theme.plaza : theme.grass} />
      ))}
      {campus.parking.map((c, i) => <Polygon key={`p${i}`} coordinates={ll(c)} fillColor={theme.parking} strokeWidth={0} zIndex={2} />)}
      {zoom > 15.6 && roads.map((p, i) => <Polyline key={`r${i}`} coordinates={ll(p.c)} strokeColor={theme.road} strokeWidth={4} zIndex={3} />)}
      {zoom > 16.4 && paths.map((p, i) => <Polyline key={`f${i}`} coordinates={ll(p.c)} strokeColor={p.t === 'steps' ? theme.steps : theme.foot} strokeWidth={2} lineDashPattern={p.t === 'steps' ? [2, 2] : undefined} zIndex={3} />)}
      {buildings.map((x, i) => {
        const on = !!x.b && x.b === highlight;
        return (
          <Polygon key={`b${x.o || 'a'}${i}`} coordinates={ll(x.c)} tappable zIndex={on ? 6 : 4}
            fillColor={on ? theme.highlight : x.ap ? theme.approx : x.b ? theme.campusBuilding : theme.building}
            strokeColor={on ? theme.highlight : theme.campusEdge} strokeWidth={on ? 2 : 0.6}
            onPress={() => { const [lng, lat] = centroid(x.c); onBuildingPress({ b: x.b, n: x.n, at: { latitude: lat, longitude: lng } }); }} />
        );
      })}
    </>
  );
}

export const NativeCampus = memo(NativeCampusImpl);
