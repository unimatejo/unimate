/** Things placed on a story. Positions and sizes are fractions of the frame so they look the same on every screen. */
export type OverlayKind = 'text' | 'emoji' | 'mention' | 'time' | 'place';
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
};

export const TEXT_COLORS = ['#FFFFFF', '#0E1430', '#FF4F7B', '#FFB547', '#5EE3A1', '#2E5BFF', '#7C3AED', '#00C2FF', '#FF6B2C', '#E0306B'];
export const EMOJIS = ['😂', '😍', '🔥', '❤️', '😭', '🥳', '😎', '🤯', '👏', '💯', '📚', '✏️', '🎓', '☕', '🍕', '🌯', '⚽', '🎧', '📸', '✨', '🌙', '☀️', '🌧️', '💪', '🙏', '👀', '😴', '🤓', '🫶', '💙', '🏛️', '🚌', '🧠', '💻', '📝', '⏰', '🎉', '😅', '🙄', '🤝'];

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Keep only well-formed overlays (they come from the network). */
export function cleanOverlays(v: unknown): Overlay[] {
  if (!Array.isArray(v)) return [];
  return v.filter((o) => o && typeof o.text === 'string' && typeof o.x === 'number' && typeof o.y === 'number').slice(0, 30).map((o) => ({
    id: String(o.id ?? newId()), kind: (['text', 'emoji', 'mention', 'time', 'place'].includes(o.kind) ? o.kind : 'text') as OverlayKind,
    text: String(o.text).slice(0, 200), x: clamp(o.x), y: clamp(o.y), size: Math.min(0.3, Math.max(0.02, Number(o.size) || 0.08)),
    scale: Math.min(6, Math.max(0.2, Number(o.scale) || 1)), rotation: Number(o.rotation) || 0,
    color: /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#FFFFFF', bg: (['none', 'solid', 'soft'].includes(o.bg) ? o.bg : 'none'),
    font: (['display', 'body', 'mono'].includes(o.font) ? o.font : 'display'), userId: typeof o.userId === 'string' ? o.userId : undefined,
  }));
}
const clamp = (n: number) => Math.min(1, Math.max(0, n));
