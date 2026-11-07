import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

import { reportError } from './errors';
import { getPref, setPref } from './prefs';
import { supabase } from './supabase';
import { t } from './i18n';
import { toast } from './toast';
import { lightImage, type Picked } from './upload';
import { shrinkVideo } from './videoShrink';
import { step } from './crashMark';

/**
 * Stories on phones go up in the background, like Instagram: "شارك" returns at once and the student carries on.
 * Each story is first copied into the app's own folder (so it survives the app being closed), then a video is made
 * light on the phone's own encoder, then the file goes up in 6 MB pieces over Supabase's resumable upload: a weak
 * campus connection that drops halfway resumes from the last piece, and anything left over resumes on the next open.
 * Only then is the story saved. The "قصتك" circle shows the progress.
 */

type Row = { author_id: string; university_id: string; kind: 'image' | 'video'; duration_sec: number | null; caption: string | null; audience: string; overlays: unknown };
type Job = {
  id: string; file: string; mime: string; kind: 'image' | 'video';
  duration?: number | null; size?: number | null; width?: number; height?: number; meta?: Picked['meta'] | null;
  row: Row; shrunk?: boolean; path?: string; tus?: string; tries: number; failed?: boolean;
};
export type QueueState = { jobs: { id: string; kind: 'image' | 'video'; progress: number; failed: boolean }[] };

const KEY = 'story_queue';
const CHUNK = 6 * 1024 * 1024; // Supabase's resumable upload takes 6 MB pieces
const MAX_BYTES = 50 * 1048576;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const APIKEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

let jobs: Job[] = load();
const progress = new Map<string, number>();
const subs = new Set<(s: QueueState) => void>();
const doneSubs = new Set<() => void>();
let running = false;

function load(): Job[] { try { return JSON.parse(getPref(KEY) || '[]') as Job[]; } catch { return []; } }
function save() { setPref(KEY, JSON.stringify(jobs)); }
function state(): QueueState { return { jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, progress: progress.get(j.id) ?? 0, failed: !!j.failed })) }; }
function notify() { const s = state(); subs.forEach((f) => f(s)); }
function folder() { const d = new Directory(Paths.document, 'story-queue'); if (!d.exists) d.create(); return d; }

/** Add a story to the queue and start sending it. The copy runs off the screen's thread, so the app never stalls. */
export async function enqueueStory(m: Picked, row: Row) {
  const id = Crypto.randomUUID();
  const clean = m.uri.split('#')[0];
  const ext = m.kind === 'video' ? (/\.(mov|mp4|m4v)$/i.exec(clean)?.[1]?.toLowerCase() ?? 'mp4') : 'jpg';
  const copy = new File(folder(), `${id}.${ext}`);
  try { await LegacyFS.copyAsync({ from: clean, to: copy.uri }); } catch (e) {
    reportError(e); toast.error(t('تعذّرت قراءة الملف، حاول اختياره مرة أخرى.')); return;
  }
  progress.set(id, 0.02);
  jobs = [...jobs, { id, file: copy.uri, mime: m.mime, kind: m.kind, duration: m.duration, size: m.size, width: m.width, height: m.height, meta: m.meta ?? null, row, tries: 0 }];
  save(); notify();
  void run();
}

/** Try again now (after a failure the student taps the circle), and on every app start. */
export function resumeStoryQueue() {
  jobs = jobs.map((j) => ({ ...j, failed: false, tries: 0 }));
  save(); notify();
  void run();
}

async function run() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const j = jobs.find((x) => !x.failed);
      if (!j) break;
      try {
        await send(j);
        drop(j, true);
      } catch (e) {
        if (e instanceof Final) { reportError(e); toast.error(e.message); drop(j, false); continue; }
        j.tries += 1;
        if (j.tries >= 6) { j.failed = true; save(); notify(); toast.error(t('الاتصال بالإنترنت ضعيف ولم تُرفع قصتك. اضغط على «قصتك» لنحاول مرة أخرى.')); continue; }
        save();
        // a dropped connection: wait a bit longer each time, then carry on from the last piece
        await new Promise((r) => setTimeout(r, [2000, 5000, 12000, 25000, 45000][j.tries - 1] ?? 45000));
      }
    }
  } finally { running = false; }
}

/** A problem trying again won't fix (the file is gone, too big): the story is dropped with a message. */
class Final extends Error {}

function drop(j: Job, ok: boolean) {
  try { const f = new File(j.file); if (f.exists) f.delete(); } catch { /* already gone */ }
  jobs = jobs.filter((x) => x.id !== j.id); progress.delete(j.id);
  save(); notify();
  step('story', 'done');
  if (ok) { toast(t('تمت إضافة قصتك ✓')); doneSubs.forEach((f) => f()); }
}

async function send(j: Job) {
  const set = (p: number) => { progress.set(j.id, p); notify(); };
  const src = new File(j.file);
  if (!src.exists) throw new Final(t('لم يتم العثور على ملف القصة، انشرها مرة أخرى.'));
  // 1. a light video for every phone and every connection (once; the light copy replaces the original)
  step('story', `send ${j.kind} try ${j.tries + 1}`);
  if (j.kind === 'video' && !j.shrunk) {
    set(0.05);
    step('story', 'compress');
    const small = await shrinkVideo({ uri: j.file, mime: j.mime, duration: j.duration, size: j.size ?? src.size, width: j.width, height: j.height }, null, { story: true });
    if (small?.uri) {
      const light = new File(folder(), `${j.id}-light.mp4`);
      await LegacyFS.moveAsync({ from: small.uri, to: light.uri });
      await LegacyFS.deleteAsync(src.uri, { idempotent: true });
      j.file = light.uri; j.mime = 'video/mp4';
    }
    j.shrunk = true; save();
    step('story', 'compressed');
  }
  if (j.kind === 'image' && !j.shrunk) {
    const light = await lightImage({ uri: j.file, mime: j.mime, width: j.width, height: j.height });
    if (light.uri !== j.file) {
      const keep = new File(folder(), `${j.id}-light.jpg`);
      await LegacyFS.moveAsync({ from: light.uri, to: keep.uri });
      await LegacyFS.deleteAsync(src.uri, { idempotent: true });
      j.file = keep.uri; j.mime = 'image/jpeg';
    }
    j.shrunk = true; save();
  }
  const file = new File(j.file);
  const size = file.size ?? 0;
  if (j.kind === 'video' && size > MAX_BYTES) throw new Final(t('الفيديو كبير جداً. قصّره أو اختر جزءاً أقصر.'));
  // 2. the file, in pieces that survive a dropped connection
  if (!j.path) { j.path = `${j.row.author_id}/${Crypto.randomUUID()}.${j.mime === 'image/jpeg' ? 'jpg' : j.mime.split('/')[1]?.replace('quicktime', 'mov') ?? 'mp4'}`; save(); }
  step('story', `upload ${Math.round(size / 1024)} KB`);
  await upload(j, file, size, (done) => set(0.1 + 0.85 * (size ? done / size : 1)));
  step('story', 'uploaded');
  // 3. the story itself (the file is up: a few quick tries so a short drop doesn't lose it)
  const row = { ...j.row, media_url: j.path, meta: j.meta ?? null };
  let error: unknown = null;
  for (let i = 0; i < 3; i++) {
    ({ error } = await supabase.from('stories').insert(row));
    if (!error) return;
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw error;
}

async function headers() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('no session yet');
  return { Authorization: `Bearer ${data.session.access_token}`, apikey: APIKEY, 'tus-resumable': '1.0.0' };
}

const b64 = (s: string) => btoa(s); // names here are ASCII (paths are ids)

async function upload(j: Job, file: File, size: number, onProgress: (done: number) => void) {
  let offset = 0;
  // resuming: ask the server how much it already has
  if (j.tus) {
    const r = await expoFetch(j.tus, { method: 'HEAD', headers: await headers() });
    if (r.ok) offset = Number(r.headers.get('upload-offset') ?? 0);
    else { j.tus = undefined; save(); }
  }
  if (!j.tus) {
    const meta = [['bucketName', 'stories'], ['objectName', j.path!], ['contentType', j.mime], ['cacheControl', '3600']].map(([k, v]) => `${k} ${b64(v)}`).join(',');
    const r = await expoFetch(`${BASE}/storage/v1/upload/resumable`, { method: 'POST', headers: { ...(await headers()), 'upload-length': String(size), 'upload-metadata': meta, 'x-upsert': 'false' } });
    const loc = r.headers.get('location');
    if (r.status === 409) return; // already there from an earlier try
    if (!r.ok || !loc) throw new Error(`upload start ${r.status}`);
    j.tus = loc; save();
  }
  onProgress(offset);
  const h = file.open();
  try {
    while (offset < size) {
      h.offset = offset;
      const piece = await h.readBytes(CHUNK);
      const r = await expoFetch(j.tus!, { method: 'PATCH', headers: { ...(await headers()), 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' }, body: piece });
      if (r.status === 409 || r.status === 404) { j.tus = undefined; save(); throw new Error(`upload lost ${r.status}`); }
      if (!r.ok) throw new Error(`upload piece ${r.status}`);
      offset = Number(r.headers.get('upload-offset') ?? offset + piece.length);
      onProgress(offset);
    }
  } finally { h.close(); }
}

/** The queue's state for the "قصتك" circle, and a callback when a story has gone up. */
export function useStoryQueue(onDone?: () => void) {
  const [s, setS] = useState<QueueState>(state);
  useEffect(() => { subs.add(setS); return () => { subs.delete(setS); }; }, []);
  useEffect(() => {
    if (!onDone) return;
    doneSubs.add(onDone);
    return () => { doneSubs.delete(onDone); };
  }, [onDone]);
  return s;
}
