import { Platform } from 'react-native';

import { canLift, liftSubject } from '../../modules/subject-lift';

/** Can we cut the background out on this device? iPhone on iOS 17+ (built in), or any modern browser (on-device model). */
export function canCutBackground() {
  if (Platform.OS === 'web') return typeof window !== 'undefined' && typeof WebAssembly !== 'undefined';
  return canLift();
}

// the browser model (IMG.LY background removal, ~45MB, cached after the first time) is served from app.unimate.my/bgr/
const load = () => (new Function('u', 'return import(u)') as (u: string) => Promise<{ removeBackground: (src: string, o: object) => Promise<Blob> }>)(`${location.origin}/bgr/bgr.mjs`);

/** Draw the cut-out like a WhatsApp sticker: trimmed to the subject, fit in 512×512, with a white outline. */
async function outline(src: Blob): Promise<Blob> {
  const img = await createImageBitmap(src);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y += 2) for (let i = 0; i < c.width; i += 2) {
    if (d[(y * c.width + i) * 4 + 3] > 24) { if (i < minX) minX = i; if (i > maxX) maxX = i; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) throw new Error('no_subject');
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const R = 10, pad = R + 6, box = 512 - pad * 2, k = Math.min(box / w, box / h);
  const dw = w * k, dh = h * k, ox = (512 - dw) / 2, oy = (512 - dh) / 2;
  // white silhouette, drawn around the subject in a circle = the outline
  const sil = document.createElement('canvas'); sil.width = 512; sil.height = 512;
  const s = sil.getContext('2d')!;
  s.drawImage(img, minX, minY, w, h, ox, oy, dw, dh);
  s.globalCompositeOperation = 'source-in'; s.fillStyle = '#fff'; s.fillRect(0, 0, 512, 512);
  const out = document.createElement('canvas'); out.width = 512; out.height = 512;
  const o = out.getContext('2d')!;
  for (let a = 0; a < 360; a += 15) o.drawImage(sil, Math.cos((a * Math.PI) / 180) * R, Math.sin((a * Math.PI) / 180) * R);
  o.shadowColor = 'rgba(0,0,0,0.25)'; o.shadowBlur = 6;
  o.drawImage(img, minX, minY, w, h, ox, oy, dw, dh);
  return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('render'))), 'image/png'));
}

/** Cut the person / object out of the photo. Gives back a local file (native) or blob URL (web) of a transparent PNG. */
export async function cutBackground(uri: string): Promise<{ uri: string; width: number; height: number }> {
  if (Platform.OS !== 'web') return liftSubject(uri);
  const m = await load();
  const cut = await m.removeBackground(uri, { publicPath: `${location.origin}/bgr/`, model: 'small', output: { format: 'image/png' } });
  const b = await outline(cut);
  return { uri: URL.createObjectURL(b), width: 512, height: 512 };
}
