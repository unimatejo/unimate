import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { DrawLayer, StickerBody, type Live } from './story/StickerBody';
import type { Overlay } from '@/lib/storyOverlay';

/** How one overlay looks (no position). Shared by the editor and the viewer so they always match. */
function OverlayBody({ o, width, live }: { o: Overlay; width: number; live?: Live }) {
  return <StickerBody o={o} width={width} live={live} />;
}

/** Places a child so its center sits at (x, y), measuring it first. */
export function Placed({ o, width, height, children, onPress, interactive }: { o: Overlay; width: number; height: number; children: ReactNode; onPress?: () => void; interactive?: boolean }) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  const style = { position: 'absolute' as const, left: o.x * width - sz.w / 2, top: o.y * height - sz.h / 2, opacity: sz.w ? 1 : 0, transform: [{ scale: o.scale }, { rotate: `${o.rotation}rad` }] };
  const onLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) => { const { width: w, height: h } = e.nativeEvent.layout; if (w !== sz.w || h !== sz.h) setSz({ w, h }); };
  if (onPress) return <Pressable style={style} onLayout={onLayout} onPress={onPress} accessibilityRole="button" accessibilityLabel={o.text}>{children}</Pressable>;
  return <View style={style} onLayout={onLayout} pointerEvents={interactive ? 'box-none' : 'none'}>{children}</View>;
}

/** Read-only overlays (previews). The story viewer uses components/story/StoryStickersLayer for taps and answers. */
export function StoryOverlays({ items, width, height, onOpen }: { items: Overlay[]; width: number; height: number; onOpen?: () => void }) {
  if (!width || !items.length) return null;
  const strokes = items.filter((o) => o.kind === 'draw').flatMap((o) => o.data?.strokes ?? []);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      <DrawLayer strokes={strokes} width={width} height={height} />
      {items.filter((o) => o.kind !== 'draw').map((o) => (
        <Placed key={o.id} o={o} width={width} height={height}
          onPress={o.kind === 'mention' && o.userId ? () => { onOpen?.(); router.push({ pathname: '/user/[id]', params: { id: o.userId! } }); } : undefined}>
          <OverlayBody o={o} width={width} />
        </Placed>
      ))}
    </View>
  );
}
