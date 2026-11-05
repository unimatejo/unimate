import { Eraser, Highlighter, PenLine, Sparkles, Undo2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DrawLayer } from './StickerBody';
import { VSlider } from './VSlider';
import { F } from '@/lib/theme';
import { t } from '@/lib/i18n';
import { TEXT_COLORS, type Stroke } from '@/lib/storyOverlay';

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

  const tools: [Tool, string, typeof PenLine][] = [['pen', t('قلم'), PenLine], ['marker', t('ماركر'), Highlighter], ['neon', t('نيون'), Sparkles], ['eraser', t('ممحاة'), Eraser]];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }}>
      {/* the strokes already drawn + the one being drawn */}
      <DrawLayer strokes={live ? [...strokes, live] : strokes} width={W} height={H} />
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
          if (Math.abs(lx - x) + Math.abs(ly - y) < 0.004) return;
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ position: 'absolute', bottom: 14, left: 0, right: 0 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 14, alignItems: 'center' }}>
        <View style={{ width: 28 + width * W, height: 28 + width * W, maxWidth: 40, maxHeight: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff', backgroundColor: tool === 'eraser' ? 'transparent' : color }} />
        {TEXT_COLORS.map((c) => (
          <Pressable key={c} onPress={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }} accessibilityLabel={c}
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: color === c ? 3 : 2, borderColor: '#fff' }} />
        ))}
      </ScrollView>
    </View>
  );
}
