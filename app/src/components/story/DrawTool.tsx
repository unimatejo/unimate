import { Eraser, Highlighter, PenLine, Sparkles, Undo2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ColorRow } from './ColorRow';

import { DrawLayer } from './StickerBody';
import { VSlider } from './VSlider';
import { F } from '@/lib/theme';
import { t } from '@/lib/i18n';
import type { Stroke } from '@/lib/storyOverlay';

type Tool = Stroke['mode'] | 'eraser';

/** Instagram's draw screen: pen, marker, neon and eraser, colours along the bottom, size on the side, undo on top. */
export function DrawTool({ W, H, strokes, onChange, onDone }: { W: number; H: number; strokes: Stroke[]; onChange: (s: Stroke[]) => void; onDone: () => void }) {
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#FFFFFF');
  const [size, setSize] = useState(0.35);
  const [live, setLive] = useState<Stroke | null>(null);
  const cur = useRef<Stroke | null>(null);
  const raf = useRef<number | null>(null);
  const width = (0.004 + size * 0.03);

  const flush = () => { raf.current = null; setLive(cur.current ? { ...cur.current, pts: [...cur.current.pts] } : null); };
  const erase = (x: number, y: number) => {
    const r = 0.04;
    const keep = strokes.filter((s) => { for (let k = 0; k < s.pts.length; k += 2) { if (Math.abs(s.pts[k] - x) < r && Math.abs(s.pts[k + 1] - y) < r * (W / H)) return false; } return true; });
    if (keep.length !== strokes.length) onChange(keep);
  };
  const point = (lx: number, ly: number) => [Math.min(1, Math.max(0, lx / W)), Math.min(1, Math.max(0, ly / H))] as const;

  const tools: [Tool, string, typeof PenLine][] = [['pen', t('قلم'), PenLine], ['marker', t('قلم تحديد'), Highlighter], ['neon', t('نيون'), Sparkles], ['eraser', t('ممحاة'), Eraser]];
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }}>
      {/* the strokes already drawn (only redrawn when they change) + the one being drawn on its own layer */}
      <DrawLayer strokes={strokes} width={W} height={H} />
      {live ? <DrawLayer strokes={[live]} width={W} height={H} /> : null}
      <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          const [x, y] = point(e.nativeEvent.locationX, e.nativeEvent.locationY);
          if (tool === 'eraser') { erase(x, y); return; }
          cur.current = { pts: [x, y], color, w: width, mode: tool };
          flush();
        }}
        onResponderMove={(e) => {
          const [x, y] = point(e.nativeEvent.locationX, e.nativeEvent.locationY);
          if (tool === 'eraser') { erase(x, y); return; }
          const c = cur.current; if (!c) return;
          const lx = c.pts[c.pts.length - 2], ly = c.pts[c.pts.length - 1];
          if (Math.abs(lx - x) + Math.abs(ly - y) < 0.0025) return;
          c.pts.push(x, y);
          if (raf.current == null) raf.current = requestAnimationFrame(flush);
        }}
        onResponderRelease={() => {
          if (cur.current && cur.current.pts.length >= 2) onChange([...strokes, cur.current]);
          cur.current = null; setLive(null);
        }} />

      {/* top: undo · tools · done */}
      <View style={{ position: 'absolute', top: 12, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, direction: 'ltr' }}>
        <Pressable onPress={() => onChange(strokes.slice(0, -1))} disabled={!strokes.length} accessibilityLabel={t('تراجع')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: strokes.length ? 1 : 0.4 }}>
          <Undo2 size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {tools.map(([k, l, Icon]) => (
            <Pressable key={k} onPress={() => setTool(k)} accessibilityLabel={l} accessibilityState={{ selected: tool === k }}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tool === k ? 'rgba(255,255,255,0.25)' : 'transparent' }}>
              <Icon size={21} color="#fff" />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: '#fff' }}>{t('تم')}</Text>
        </Pressable>
      </View>

      <View style={{ position: 'absolute', top: H * 0.22, left: 6 }}>
        <VSlider value={size} onChange={setSize} height={Math.min(240, H * 0.35)} />
      </View>

      <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', direction: 'ltr' }}>
        {/* the brush preview: its real size and colour */}
        <View style={{ width: 44, alignItems: 'center' }}>
          <View style={{ width: Math.max(8, Math.min(34, width * W * (tool === 'marker' ? 2.2 : 1))), height: Math.max(8, Math.min(34, width * W * (tool === 'marker' ? 2.2 : 1))), borderRadius: 20, borderWidth: 2, borderColor: '#fff', backgroundColor: tool === 'eraser' ? 'transparent' : color, shadowColor: tool === 'neon' ? color : '#000', shadowOpacity: 0.6, shadowRadius: tool === 'neon' ? 8 : 2 }} />
        </View>
        <View style={{ flex: 1 }}><ColorRow value={color} onChange={(c) => { setColor(c); if (tool === 'eraser') setTool('pen'); }} size={28} /></View>
      </View>
    </Animated.View>
  );
}
