/** Things placed on a story. Positions and sizes are fractions of the frame so they look the same on every screen. */
export type OverlayKind =
  | 'text' | 'emoji' | 'mention' | 'time' | 'place' | 'hashtag' | 'link'
  | 'poll' | 'question' | 'slider' | 'countdown' | 'sticker' | 'draw' | 'addyours' | 'photo';

/** Text looks, like Instagram's: classic, poster, bubble, neon, typewriter, squeeze */
export type TextStyle = 'classic' | 'poster' | 'bubble' | 'neon' | 'typewriter' | 'squeeze';

/** One freehand stroke: points as fractions of the frame, width as a fraction of the frame width */
export type Stroke = { pts: number[]; color: string; w: number; mode: 'pen' | 'marker' | 'neon' };

export type Overlay = {
  id: string;
  kind: OverlayKind;
  text: string;
  x: number;        // center, 0..1 of frame width
  y: number;        // center, 0..1 of frame height
  size: number;     // font size as a fraction of frame width
  scale: number;
  rotation: number; // radians
  color: string;
  bg: 'none' | 'solid' | 'soft';
  font: 'display' | 'body' | 'mono';
  userId?: string;  // mention target
  style?: TextStyle;
  align?: 'center' | 'left' | 'right';
  /** poll options · slider emoji · countdown end · link url · place coordinates · sticker image · clock look · drawing */
  data?: {
    options?: string[]; emoji?: string; endsAt?: string; url?: string;
    placeId?: string; lat?: number; lng?: number; img?: string; clock?: 'pill' | 'digital' | 'mono';
    strokes?: Stroke[];
    /** link sticker's shown name · photo sticker's width/height */
    label?: string; ar?: number;
  };
};

export const TEXT_COLORS = ['#FFFFFF', '#000000', '#FF3B5C', '#FF8A00', '#FFD60A', '#34C759', '#00C2FF', '#2E5BFF', '#7C3AED', '#FF6B4A', '#E0306B', '#8E8E93'];
export const EMOJIS = ['😂', '😍', '🔥', '❤️', '😭', '🥳', '😎', '🤯', '👏', '💯', '📚', '✏️', '🎓', '☕', '🍕', '🌯', '⚽', '🎧', '📸', '✨', '🌙', '☀️', '🌧️', '💪', '🙏', '👀', '😴', '🤓', '🫶', '💙', '🏛️', '🚌', '🧠', '💻', '📝', '⏰', '🎉', '😅', '🙄', '🤝'];
export const SLIDER_EMOJIS = ['😍', '🔥', '😂', '😮', '😢', '👏', '💯', '🤓'];

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Stickers people can answer (stored answers live in the story_* tables). */
export const INTERACTIVE: OverlayKind[] = ['poll', 'question', 'slider', 'countdown'];

const KINDS: OverlayKind[] = ['text', 'emoji', 'mention', 'time', 'place', 'hashtag', 'link', 'poll', 'question', 'slider', 'countdown', 'sticker', 'draw', 'addyours', 'photo'];
const STYLES: TextStyle[] = ['classic', 'poster', 'bubble', 'neon', 'typewriter', 'squeeze'];
const isColor = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function cleanData(d: unknown): Overlay['data'] {
  if (!d || typeof d !== 'object') return undefined;
  const o = d as Record<string, unknown>;
  const strokes = Array.isArray(o.strokes) ? (o.strokes as Record<string, unknown>[]).slice(0, 200).flatMap((s) => {
    if (!s || !Array.isArray(s.pts)) return [];
    const pts = (s.pts as unknown[]).slice(0, 4000).map((n) => clamp(Number(n) || 0));
    return [{ pts, color: isColor(s.color) ? String(s.color) : '#FFFFFF', w: Math.min(0.2, Math.max(0.002, Number(s.w) || 0.01)),
      mode: (['pen', 'marker', 'neon'].includes(String(s.mode)) ? s.mode : 'pen') as Stroke['mode'] }];
  }) : undefined;
  const url = str(o.url, 400);
  return {
    options: Array.isArray(o.options) ? o.options.slice(0, 4).map((x) => String(x).slice(0, 40)) : undefined,
    emoji: str(o.emoji, 8), endsAt: str(o.endsAt, 40), url: url && /^https?:\/\//i.test(url) ? url : undefined,
    placeId: str(o.placeId, 60), lat: num(o.lat), lng: num(o.lng),
    img: str(o.img, 400), clock: (['pill', 'digital', 'mono'].includes(String(o.clock)) ? o.clock : undefined) as 'pill' | undefined,
    strokes, label: str(o.label, 40), ar: num(o.ar) !== undefined ? Math.min(4, Math.max(0.25, Number(o.ar))) : undefined,
  };
}

/** Keep only well-formed overlays (they come from the network). */
export function cleanOverlays(v: unknown): Overlay[] {
  if (!Array.isArray(v)) return [];
  return v.filter((o) => o && typeof o.text === 'string' && typeof o.x === 'number' && typeof o.y === 'number').slice(0, 40).map((o) => ({
    id: String(o.id ?? newId()).slice(0, 40), kind: (KINDS.includes(o.kind) ? o.kind : 'text') as OverlayKind,
    text: String(o.text).slice(0, 300), x: clamp(o.x), y: clamp(o.y), size: Math.min(0.3, Math.max(0.02, Number(o.size) || 0.08)),
    scale: Math.min(8, Math.max(0.2, Number(o.scale) || 1)), rotation: Number(o.rotation) || 0,
    color: isColor(o.color) ? o.color : '#FFFFFF', bg: (['none', 'solid', 'soft'].includes(o.bg) ? o.bg : 'none'),
    font: (['display', 'body', 'mono'].includes(o.font) ? o.font : 'display'), userId: typeof o.userId === 'string' ? o.userId : undefined,
    style: STYLES.includes(o.style) ? o.style : undefined, align: (['center', 'left', 'right'].includes(o.align) ? o.align : undefined),
    data: cleanData(o.data),
  }));
}
const clamp = (n: number) => Math.min(1, Math.max(0, n));
