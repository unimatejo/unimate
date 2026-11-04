import { router } from 'expo-router';
import { Clock, MapPin } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { F } from '@/lib/theme';
import type { Overlay } from '@/lib/storyOverlay';

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
};

/** How one overlay looks (no position). Shared by the editor and the viewer so they always match. */
export function OverlayBody({ o, width }: { o: Overlay; width: number }) {
  const fs = Math.max(10, o.size * width);
  if (o.kind === 'emoji') return <Text style={{ fontSize: fs * 1.6, lineHeight: fs * 1.9 }}>{o.text}</Text>;
  if (o.kind === 'mention') {
    return (
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: fs * 0.5, paddingHorizontal: fs * 0.55, paddingVertical: fs * 0.25 }}>
        <Text style={{ fontFamily: F.title, fontSize: fs, color: '#7C3AED', writingDirection: 'ltr' }}>@{o.text.replace(/^@/, '')}</Text>
      </View>
    );
  }
  if (o.kind === 'time' || o.kind === 'place') {
    const Icon = o.kind === 'time' ? Clock : MapPin;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: fs * 0.3, backgroundColor: '#FFFFFF', borderRadius: fs * 0.5, paddingHorizontal: fs * 0.55, paddingVertical: fs * 0.25 }}>
        <Icon size={fs} color={o.color === '#FFFFFF' ? '#FF4F7B' : o.color} />
        <Text style={{ fontFamily: F.title, fontSize: fs, color: '#0E1430' }}>{o.text}</Text>
      </View>
    );
  }
  const solid = o.bg === 'solid', soft = o.bg === 'soft';
  const fg = solid ? (isLight(o.color) ? '#0E1430' : '#FFFFFF') : o.color;
  const font = o.font === 'mono' ? 'Courier' : o.font === 'body' ? F.bodyBold : F.display;
  return (
    <View style={{ backgroundColor: solid ? o.color : soft ? 'rgba(0,0,0,0.45)' : 'transparent', borderRadius: fs * 0.35, paddingHorizontal: solid || soft ? fs * 0.45 : 0, paddingVertical: solid || soft ? fs * 0.15 : 0, maxWidth: width * 0.9 }}>
      <Text style={{ fontFamily: font, fontSize: fs, lineHeight: fs * 1.35, color: fg, textAlign: 'center',
        textShadowColor: solid || soft ? 'transparent' : 'rgba(0,0,0,0.35)', textShadowRadius: solid || soft ? 0 : 6, textShadowOffset: { width: 0, height: 1 } }}>{o.text}</Text>
    </View>
  );
}

/** Places a child so its center sits at (x, y), measuring it first. */
function Placed({ o, width, height, children, onPress }: { o: Overlay; width: number; height: number; children: ReactNode; onPress?: () => void }) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  const style = { position: 'absolute' as const, left: o.x * width - sz.w / 2, top: o.y * height - sz.h / 2, opacity: sz.w ? 1 : 0, transform: [{ scale: o.scale }, { rotate: `${o.rotation}rad` }] };
  const onLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) => { const { width: w, height: h } = e.nativeEvent.layout; if (w !== sz.w || h !== sz.h) setSz({ w, h }); };
  return onPress
    ? <Pressable style={style} onLayout={onLayout} onPress={onPress} accessibilityLabel={`@${o.text}`}>{children}</Pressable>
    : <View style={style} onLayout={onLayout} pointerEvents="none">{children}</View>;
}

/** Read-only overlays for the story viewer. Mentions open that student's profile. */
export function StoryOverlays({ items, width, height, onOpen }: { items: Overlay[]; width: number; height: number; onOpen?: () => void }) {
  if (!width || !items.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      {items.map((o) => (
        <Placed key={o.id} o={o} width={width} height={height}
          onPress={o.kind === 'mention' && o.userId ? () => { onOpen?.(); router.push({ pathname: '/user/[id]', params: { id: o.userId! } }); } : undefined}>
          <OverlayBody o={o} width={width} />
        </Placed>
      ))}
    </View>
  );
}
