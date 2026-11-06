import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

import { reportError } from './errors';
import { recordPerf } from './perf';

/**
 * Phones record 1080p–4K at 10–20 Mbps: a 14 s clip can be 25 MB, slow to upload and too heavy for many phones
 * and browsers to play. Before upload every video is brought down to at most 1280 px on its long side
 * (H.264 + AAC in MP4, about 2.5 Mbps), like Instagram and WhatsApp do.
 * Anything that can't be converted on this device is uploaded as it is, so posting never breaks.
 */
const LONG_SIDE = 1280;
const VIDEO_BPS = 2_500_000;
/** small, already-light MP4s are left alone */
const KEEP_BPS = 4_000_000;

/** `trimmed`: the file now holds only the chosen part (start → end), so it plays from 0 */
type Shrunk = { uri: string; mime: 'video/mp4'; blob?: Blob; trimmed?: boolean };
type Trim = { start: number; end: number } | null | undefined;

export async function shrinkVideo(file: { uri: string; mime: string; duration?: number | null; size?: number | null; width?: number; height?: number }, trim?: Trim): Promise<Shrunk | null> {
  const t0 = Date.now();
  try {
    const out = Platform.OS === 'web' ? await shrinkWeb(file, trim) : await shrinkNative(file);
    recordPerf('query', `video-shrink ${Platform.OS} ${out ? 'done' : 'kept'}`, Date.now() - t0);
    return out;
  } catch (e) {
    recordPerf('query', `video-shrink ${Platform.OS} failed`, Date.now() - t0);
    reportError(e);
    return null;
  }
}

// ---------- web safety ----------
// A phone browser can close the page when converting a very big video takes too much memory (iPhone Safari does).
// A mark is left while converting; if the page restarts with the mark still there, this browser skips converting
// from then on, so posting works next time (the video goes up as it is).
const RUNNING = 'um_shrink_running', OFF = 'um_shrink_off';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
function webShrinkAllowed(short: boolean) {
  if (store.get(RUNNING)) {
    store.del(RUNNING); store.set(OFF, String(Date.now()));
    reportError(new Error('video-shrink: the page restarted while converting; turned off on this browser for a day'));
  }
  const off = Number(store.get(OFF) ?? 0);
  // turned off for a day (older marks were '1'); a short trimmed clip is light enough to try anyway
  if (off && (off === 1 || Date.now() - off > 86_400_000)) { store.del(OFF); return true; }
  return !off || short;
}
/** converting must finish in this time, or the original is uploaded */
const WEB_LIMIT_MS = 90_000;

// ---------- web: WebCodecs through mediabunny (loaded only when a video is posted) ----------
async function shrinkWeb(file: { uri: string; mime: string }, trim: Trim): Promise<Shrunk | null> {
  const cut = trim && trim.end > trim.start ? trim : null;
  if (typeof VideoEncoder === 'undefined' || !webShrinkAllowed(!!cut && cut.end - cut.start <= 61)) return null;
  const blob = await (await fetch(file.uri)).blob();
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) return null;
  const audio = await input.getPrimaryAudioTrack();
  const w = video.displayWidth, h = video.displayHeight;
  const secs = await input.computeDuration();
  const bps = secs > 0 ? (blob.size * 8) / secs : Infinity;
  // a trimmed clip is always cut (only the chosen seconds go up), otherwise only heavy videos are converted
  const cutting = !!cut && (cut.start > 0.3 || cut.end < secs - 0.3);
  if (!cutting && Math.max(w, h) <= LONG_SIDE && bps <= KEEP_BPS && file.mime === 'video/mp4') return null;

  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({
    input, output,
    video: { ...(w >= h ? { width: Math.min(w, LONG_SIDE) } : { height: Math.min(h, LONG_SIDE) }), codec: 'avc', bitrate: VIDEO_BPS, forceTranscode: true },
    audio: { codec: 'aac' },
    ...(cutting && cut ? { trim: { start: cut.start, end: Math.min(cut.end, secs) } } : {}),
    showWarnings: false,
  });
  // never trade the sound for a smaller file
  if (!conversion.isValid || (audio && conversion.discardedTracks.some((d) => d.track === audio))) return null;
  store.set(RUNNING, String(Date.now()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<'late'>((res) => { timer = setTimeout(() => res('late'), WEB_LIMIT_MS); });
    if ((await Promise.race([conversion.execute(), late])) === 'late') { await conversion.cancel(); return null; }
  } finally { clearTimeout(timer); store.del(RUNNING); }
  const buf = output.target.buffer;
  if (!buf || (!cutting && buf.byteLength >= blob.size)) return null;
  const out = new Blob([buf], { type: 'video/mp4' });
  return { uri: URL.createObjectURL(out), mime: 'video/mp4', blob: out, trimmed: cutting };
}

// ---------- phones: the system's own encoder (react-native-compressor) ----------
function nativeCompressor(): typeof import('react-native-compressor') | null {
  // older app builds updated over the air don't have the module yet: upload as is
  const has = (TurboModuleRegistry.get('Compressor') ?? NativeModules.Compressor) != null;
  if (!has) return null;
  return require('react-native-compressor') as typeof import('react-native-compressor');
}

async function shrinkNative(file: { uri: string; mime: string; duration?: number | null; size?: number | null; width?: number; height?: number }): Promise<Shrunk | null> {
  const c = nativeCompressor();
  if (!c) return null;
  const long = Math.max(file.width ?? 0, file.height ?? 0);
  const secs = file.duration ? file.duration / 1000 : 0;
  const bps = secs > 0 && file.size ? (file.size * 8) / secs : Infinity;
  if (long && long <= LONG_SIDE && bps <= KEEP_BPS && file.mime === 'video/mp4') return null;
  const uri = await c.Video.compress(file.uri, { compressionMethod: 'manual', maxSize: LONG_SIDE, bitrate: VIDEO_BPS, minimumFileSizeForCompress: 0 });
  return uri ? { uri, mime: 'video/mp4' } : null;
}
