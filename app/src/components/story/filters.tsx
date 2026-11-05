import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { t } from '@/lib/i18n';

/**
 * Story colour filters. Drawn as tints and soft light over the photo / video, so the viewer reproduces them exactly
 * on every phone without touching the pixels.
 */
type StoryFilter = { id: string; name: string; tint?: string; top?: string; bottom?: string; vignette?: number };

export const FILTERS: StoryFilter[] = [
  { id: 'none', name: t('عادي') },
  { id: 'warm', name: t('دافئ'), tint: 'rgba(255,140,40,0.16)' },
  { id: 'cool', name: t('بارد'), tint: 'rgba(40,140,255,0.16)' },
  { id: 'rose', name: t('وردي'), tint: 'rgba(255,80,140,0.14)', top: 'rgba(255,170,200,0.18)' },
  { id: 'gold', name: t('ذهبي'), tint: 'rgba(255,196,0,0.14)', bottom: 'rgba(255,120,0,0.18)' },
  { id: 'night', name: t('ليلي'), tint: 'rgba(20,30,90,0.28)', vignette: 0.45 },
  { id: 'vintage', name: t('قديم'), tint: 'rgba(160,110,60,0.22)', vignette: 0.3 },
  { id: 'teal', name: t('فيروزي'), tint: 'rgba(0,180,170,0.14)', top: 'rgba(255,150,80,0.10)' },
  { id: 'glow', name: t('وهج'), tint: 'rgba(255,255,255,0.12)', top: 'rgba(255,255,255,0.18)' },
  { id: 'drama', name: t('درامي'), tint: 'rgba(0,0,0,0.12)', vignette: 0.6 },
  { id: 'dusk', name: t('غروب'), top: 'rgba(120,60,200,0.22)', bottom: 'rgba(255,110,60,0.22)' },
];

const filterById = (id?: string | null) => FILTERS.find((f) => f.id === id && f.id !== 'none');

const fill = { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const;

/** The filter's layers, full-frame and untouchable. */
export function FilterLayer({ id }: { id?: string | null }) {
  const f = filterById(id);
  if (!f) return null;
  return (
    <View pointerEvents="none" style={fill}>
      {f.tint ? <View style={[fill, { backgroundColor: f.tint }]} /> : null}
      {f.top || f.bottom ? <LinearGradient colors={[f.top ?? 'transparent', 'transparent', f.bottom ?? 'transparent']} style={fill} /> : null}
      {f.vignette ? (
        <>
          <LinearGradient colors={[`rgba(0,0,0,${f.vignette})`, 'transparent', 'transparent', `rgba(0,0,0,${f.vignette})`]} locations={[0, 0.25, 0.75, 1]} style={fill} />
          <LinearGradient colors={[`rgba(0,0,0,${f.vignette * 0.7})`, 'transparent', 'transparent', `rgba(0,0,0,${f.vignette * 0.7})`]} locations={[0, 0.25, 0.75, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={fill} />
        </>
      ) : null}
    </View>
  );
}

/** Backgrounds behind a story photo that doesn't fill the frame (tap the canvas background to cycle). */
export const BACKGROUNDS: [string, string][] = [
  ['#1F2A5C', '#0E1430'], ['#3A1C71', '#D76D77'], ['#0F2027', '#2C5364'], ['#FF6B4A', '#FFB547'],
  ['#134E5E', '#71B280'], ['#232526', '#414345'], ['#FFFFFF', '#E9ECF5'], ['#000000', '#000000'],
];
