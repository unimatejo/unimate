import { Footprints, MapPin } from 'lucide-react-native';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { T } from '@/components/ui';
import { GlyphTile } from '@/components/ui/Glyph';
import { t } from '@/lib/i18n';
import { C, F, shadow } from '@/lib/theme';

import { kindOf } from './kinds';

/**
 * What the campus map puts on top of the ground, as plain data: the same list draws on the platform map, on the web
 * map and inside the phone's 3D view (which gets it across the web-view bridge, so it must stay serialisable).
 */
export type MarkerSpec =
  | { t: 'pin'; key: string; id: string; kind: string; name: string; lat: number; lng: number; on: boolean; label: boolean; bare: boolean; small: boolean; priority: number; ad: boolean }
  | { t: 'dest'; key: string; name: string; lat: number; lng: number }
  | { t: 'shared' | 'walker' | 'me'; key: string; lat: number; lng: number };

const WEB = Platform.OS === 'web';
const AD_GOLD = '#FACC15';
const Z = { dest: 997, shared: 998, walker: 999, me: 996 } as const;

/** `onPin` gets the place's id for a pin, or the marker's type ('shared', …) for the others. */
export function MapMarkers({ specs, onPin }: { specs: MarkerSpec[]; onPin: (id: string) => void }) {
  return (
    <>
      {specs.map((m) => {
        const at = { latitude: m.lat, longitude: m.lng };
        if (m.t === 'pin') {
          const { g, icon: Icon } = kindOf(m.kind);
          return (
            <Marker key={m.key} coordinate={at} onPress={() => onPin(m.id)} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }} {...(WEB ? { priority: m.priority } : {})}>
              <View style={{ alignItems: 'center', gap: 3 }}>
                {/* a sponsored place wears a gold ring, so students spot it at a glance */}
                {!m.bare && (
                  <View style={m.ad ? { padding: 3, borderRadius: 14, backgroundColor: AD_GOLD } : undefined}>
                    <GlyphTile icon={Icon} colors={m.on ? ['#2A2F4F', '#0E1430'] : g} size={m.on ? 40 : m.small ? 22 : m.ad ? 34 : 30} />
                  </View>
                )}
                {m.label && (
                  <View style={[{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, backgroundColor: m.on ? C.inverse : C.glass, maxWidth: 170, flexDirection: 'row', alignItems: 'center', gap: 5 }, shadow]}>
                    {m.ad && <View style={{ paddingHorizontal: 5, borderRadius: 5, backgroundColor: AD_GOLD }}><T v="tiny" color="#1A1300" style={{ fontSize: 9 }}>{t('ممول')}</T></View>}
                    <T v="tiny" numberOfLines={1} color={m.on ? C.onInverse : C.ink} style={{ fontSize: 11, flexShrink: 1 }}>{m.name}</T>
                  </View>
                )}
              </View>
            </Marker>
          );
        }
        if (m.t === 'dest') return (
          <Marker key={m.key} coordinate={at} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} zIndex={Z.dest}>
            <View style={{ alignItems: 'center' }}>
              <View style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: C.inverse, maxWidth: 170 }, shadow]}>
                <T v="tiny" numberOfLines={1} color={C.onInverse} style={{ fontFamily: F.bodyBold }}>{m.name}</T>
              </View>
              <MapPin size={30} color={C.primary} fill={C.primary} />
            </View>
          </Marker>
        );
        if (m.t === 'shared') return (
          <Marker key={m.key} coordinate={at} onPress={() => onPin('shared')} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={Z.shared}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: C.primary, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={20} color={C.onPrimary} />
            </View>
          </Marker>
        );
        if (m.t === 'walker') return (
          <Marker key={m.key} coordinate={at} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={Z.walker}>
            <View style={[{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, shadow]}>
              <Footprints size={17} color={C.onPrimary} />
            </View>
          </Marker>
        );
        return (
          <Marker key={m.key} coordinate={at} anchor={{ x: 0.5, y: 0.5 }} zIndex={Z.me}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#2E7BFF', borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#2E7BFF', shadowOpacity: 0.6, shadowRadius: 8 }} />
          </Marker>
        );
      })}
    </>
  );
}
