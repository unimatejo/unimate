import { Image } from 'expo-image';
import { Check, ImageOff, Settings } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, View, useWindowDimensions } from 'react-native';

import { T, Tap } from '@/components/ui';
import { fmtDuration, galleryPage, galleryPermission, type GalleryAsset, type GalleryKind } from '@/lib/nativeMedia';
import { C, R } from '@/lib/theme';
import { t } from '@/lib/i18n';

const COLS = 4;
const GAP = 2;

type Props = {
  kind: GalleryKind;
  album: string | null;
  /** asset ids in the order they were chosen (numbers on the tiles in multi-select) */
  selected: string[];
  multi: boolean;
  /** the one shown in the big preview */
  activeId: string | null;
  busyId: string | null;
  onPick: (a: GalleryAsset) => void;
  header?: React.ReactElement | null;
  /** fires once with the first page, so the screen can preview the newest photo like Instagram */
  onFirst?: (a: GalleryAsset | null) => void;
  /** rows tall enough that the grid scrolls inside a sheet */
  contentBottom?: number;
};

const Tile = memo(function Tile({ a, size, n, active, multi, busy, onPick }: { a: GalleryAsset; size: number; n: number; active: boolean; multi: boolean; busy: boolean; onPick: (a: GalleryAsset) => void }) {
  return (
    <Tap haptic={false} scale={1} onPress={() => onPick(a)} accessibilityLabel={a.mediaType === 'video' ? t('فيديو {0}', [fmtDuration(a.duration)]) : t('صورة')}
      style={{ width: size, height: size, marginBottom: GAP, marginEnd: GAP, backgroundColor: C.soft }}>
      <Image source={{ uri: a.uri }} style={{ width: size, height: size }} contentFit="cover" recyclingKey={a.id} cachePolicy="memory" transition={0} />
      {active && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.32)' }} />}
      {a.mediaType === 'video' && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 5, right: 6 }}>
          <T v="tiny" color="#fff" style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, fontSize: 11 }}>{fmtDuration(a.duration)}</T>
        </View>
      )}
      {multi && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff', backgroundColor: n > 0 ? C.primary : 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          {n > 0 ? <T v="tiny" color={C.onPrimary} style={{ fontSize: 12, lineHeight: 16 }}>{n}</T> : null}
        </View>
      )}
      {busy && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}><ActivityIndicator color="#fff" /></View>}
      {!multi && active && <View pointerEvents="none" style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Check size={13} color={C.onPrimary} strokeWidth={3} /></View>}
    </Tap>
  );
});

/** The phone's photos and videos, newest first, 4 per row like Instagram, loading more as you scroll. */
export function GalleryGrid({ kind, album, selected, multi, activeId, busyId, onPick, header, onFirst, contentBottom = 120 }: Props) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GAP * (COLS - 1)) / COLS);
  const [perm, setPerm] = useState<'granted' | 'denied' | 'unavailable' | null>(null);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const cursor = useRef<{ end?: string; hasNext: boolean }>({ hasNext: true });
  const gen = useRef(0);
  const firstSent = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (!reset && (!cursor.current.hasNext || loading)) return;
    const g = reset ? ++gen.current : gen.current;
    setLoading(true);
    try {
      const r = await galleryPage({ kind, album, after: reset ? undefined : cursor.current.end, first: reset ? 48 : 80 });
      if (g !== gen.current) return;
      cursor.current = { end: r.end, hasNext: r.hasNext };
      setAssets((cur) => (reset ? r.assets : [...cur, ...r.assets]));
      if (reset && onFirst && !firstSent.current) { firstSent.current = true; onFirst(r.assets[0] ?? null); }
    } catch { /* gallery unreadable: the empty state shows */ }
    finally { if (g === gen.current) setLoading(false); }
  }, [kind, album, loading, onFirst]);

  useEffect(() => { galleryPermission(true).then(setPerm); }, []);
  useEffect(() => { if (perm === 'granted') { cursor.current = { hasNext: true }; load(true); } }, [perm, kind, album]); // eslint-disable-line react-hooks/exhaustive-deps

  if (perm === 'denied') {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ alignItems: 'center', gap: 10, padding: 28 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><ImageOff size={26} color={C.muted} /></View>
          <T v="bodyMd" style={{ textAlign: 'center' }}>{t('اسمح ليونيميت يشوف صورك')}</T>
          <T v="small" color={C.muted} style={{ textAlign: 'center', maxWidth: 280 }}>{t('عشان تطلع صورك وفيديوهاتك هون وتختار منها بكبسة، زي إنستغرام.')}</T>
          <Tap onPress={() => Linking.openSettings()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: C.primary }}>
            <Settings size={16} color={C.onPrimary} /><T v="bold" color={C.onPrimary}>{t('افتح الإعدادات')}</T>
          </Tap>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={assets}
      keyExtractor={(a) => a.id}
      numColumns={COLS}
      ListHeaderComponent={header ?? undefined}
      renderItem={({ item, index }) => (
        <View style={(index + 1) % COLS === 0 ? { marginEnd: -GAP } : undefined}>
          <Tile a={item} size={size} n={selected.indexOf(item.id) + 1} active={item.id === activeId} multi={multi} busy={busyId === item.id} onPick={onPick} />
        </View>
      )}
      onEndReached={() => load(false)}
      onEndReachedThreshold={0.6}
      initialNumToRender={24}
      maxToRenderPerBatch={24}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
      extraData={`${selected.join(',')}|${activeId}|${busyId}|${multi}`}
      contentContainerStyle={{ paddingBottom: contentBottom }}
      ListFooterComponent={loading ? <View style={{ padding: 18 }}><ActivityIndicator color={C.muted} /></View> : undefined}
      ListEmptyComponent={perm === 'granted' && !loading ? <T v="small" color={C.muted} style={{ textAlign: 'center', padding: 28 }}>{t('ما في صور هون.')}</T> : perm === null ? <View style={{ padding: 28 }}><ActivityIndicator color={C.muted} /></View> : undefined}
    />
  );
}
