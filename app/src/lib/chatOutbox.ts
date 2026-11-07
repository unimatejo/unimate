import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { reportError } from './errors';
import { getPref, setPref } from './prefs';
import { supabase } from './supabase';
import type { Message } from './types';
import { uploadFile } from './upload';

/**
 * Messages that wait for a connection, like WhatsApp: «بعت» always works. A message is kept on the phone with a 🕓
 * and goes the moment there's any signal, even for two seconds, on its own (also after the app was closed). Each
 * message has its own id from the start, so one sent twice over a flaky line is still one message.
 * Photos and voice notes are copied into the app's folder first, so they survive the app being closed.
 * A message the server refuses (a request not accepted yet, a muted group, too many at once) is kept and marked,
 * with «جرّب كمان مرة» and «احذفها»; it is never sent behind the student's back later.
 */

export type OutJob = {
  id: string; conversation_id: string; sender_id: string; kind: string; body: string | null; ref_id: string | null;
  media_url: string | null;
  /** a photo / voice note still on the phone */
  file?: { uri: string; mime: string; width?: number; height?: number } | null;
  created_at: string; tries: number;
  /** the server said no (not a connection problem): the reason it gave */
  refused?: string | null;
};
type Sent = { job: OutJob; row: Message };

const KEY = 'chat_outbox';
const WAIT = [1500, 3000, 6000, 12000, 20000, 30000]; // then every 30 s while the app is open

let jobs: OutJob[] = load();
const subs = new Set<(j: OutJob[]) => void>();
const sentSubs = new Set<(s: Sent) => void>();
const refusedSubs = new Set<(j: OutJob, error: { message?: string; code?: string }) => void>();
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function load(): OutJob[] { try { return JSON.parse(getPref(KEY) || '[]') as OutJob[]; } catch { return []; } }
function save() {
  // the web can't keep a picked photo across a reload: only text-like messages are kept there
  setPref(KEY, JSON.stringify(Platform.OS === 'web' ? jobs.filter((j) => !j.file) : jobs));
}
function notify() { const j = [...jobs]; subs.forEach((f) => f(j)); }
function folder() { const d = new Directory(Paths.document, 'chat-outbox'); if (!d.exists) d.create({ intermediates: true }); return d; }

/** No connection, a timeout, a dropped line: worth trying again. A database answer (it has a code) is final. */
const isConnection = (e: unknown) => {
  const code = (e as { code?: string } | null)?.code;
  return !code || /^(PGRST00|08)/.test(code);
};

/** Add a message (text, sticker, location, a photo…) and send it now if there's a connection. */
export async function sendLater(m: { conversation_id: string; sender_id: string; kind: string; body?: string | null; media_url?: string | null; ref_id?: string | null;
  file?: OutJob['file'] }) {
  const id = Crypto.randomUUID();
  let file = m.file ?? null;
  if (file && Platform.OS !== 'web') {
    const clean = file.uri.split('#')[0];
    const ext = /\.(\w{2,4})$/.exec(clean)?.[1] ?? (file.mime.split('/')[1] ?? 'bin');
    const copy = new File(folder(), `${id}.${ext}`);
    try { await LegacyFS.copyAsync({ from: clean, to: copy.uri }); file = { ...file, uri: copy.uri }; } catch (e) { reportError(e); }
  }
  jobs = [...jobs, { id, conversation_id: m.conversation_id, sender_id: m.sender_id, kind: m.kind, body: m.body ?? null, media_url: m.media_url ?? null,
    ref_id: m.ref_id ?? null, file, created_at: new Date().toISOString(), tries: 0 }];
  save(); notify();
  kick(0);
  return id;
}

/** «جرّب كمان مرة» on a refused one, and every time the app comes back to the front. */
export function retryOutbox(id?: string) {
  jobs = jobs.map((j) => (!id || j.id === id ? { ...j, refused: id ? null : j.refused, tries: 0 } : j));
  save(); notify();
  kick(0);
}

export function dropOutbox(id: string) {
  const j = jobs.find((x) => x.id === id);
  if (j?.file && Platform.OS !== 'web') { try { const f = new File(j.file.uri); if (f.exists) f.delete(); } catch { /* gone */ } }
  jobs = jobs.filter((x) => x.id !== id);
  save(); notify();
}

function kick(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void run(); }, ms);
}

async function run() {
  if (running) return;
  running = true;
  let wait: number | null = null;
  try {
    // oldest first, so a chat keeps its order
    for (const j of [...jobs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (j.refused || !jobs.some((x) => x.id === j.id)) continue;
      try {
        await send(j);
      } catch (e) {
        if (!isConnection(e)) {
          const err = e as { message?: string; code?: string };
          j.refused = err.message ?? 'refused';
          save(); notify();
          refusedSubs.forEach((f) => f(j, err));
          continue;
        }
        j.tries += 1; save(); notify();
        wait = WAIT[Math.min(j.tries - 1, WAIT.length - 1)];
        break; // no connection: the rest wait too, in order
      }
    }
  } finally { running = false; }
  if (wait != null && jobs.some((j) => !j.refused)) kick(wait);
}

async function send(j: OutJob) {
  if (j.file && !j.media_url) {
    j.media_url = await uploadFile('chat', j.conversation_id, j.file);
    save();
  }
  const { data, error } = await supabase.from('messages')
    .insert({ id: j.id, conversation_id: j.conversation_id, sender_id: j.sender_id, kind: j.kind, body: j.body, media_url: j.media_url, ref_id: j.ref_id })
    .select().single();
  // sent before, the answer got lost on the way: it's there
  if (error?.code === '23505') { finish(j, null); return; }
  if (error) throw error;
  finish(j, data as Message);
}

function finish(j: OutJob, row: Message | null) {
  if (j.file && Platform.OS !== 'web') { try { const f = new File(j.file.uri); if (f.exists) f.delete(); } catch { /* gone */ } }
  jobs = jobs.filter((x) => x.id !== j.id);
  save(); notify();
  if (row) sentSubs.forEach((f) => f({ job: j, row }));
}

// back to the front: try what's waiting (the line may be back)
AppState.addEventListener('change', (s) => { if (s === 'active' && jobs.some((j) => !j.refused)) kick(300); });
if (jobs.length) kick(3000);

/** This chat's waiting messages, and callbacks when one is sent (the server's row) or refused. */
export function useOutbox(conversationId: string, on?: { sent?: (s: Sent) => void; refused?: (j: OutJob, e: { message?: string; code?: string }) => void }) {
  const [list, setList] = useState<OutJob[]>(() => jobs.filter((j) => j.conversation_id === conversationId));
  useEffect(() => {
    const f = (all: OutJob[]) => setList(all.filter((j) => j.conversation_id === conversationId));
    f(jobs);
    subs.add(f);
    return () => { subs.delete(f); };
  }, [conversationId]);
  // the latest callbacks, without subscribing again on every render
  const cb = useRef(on);
  useEffect(() => { cb.current = on; });
  useEffect(() => {
    const ok = (x: Sent) => { if (x.job.conversation_id === conversationId) cb.current?.sent?.(x); };
    const no = (j: OutJob, e: { message?: string; code?: string }) => { if (j.conversation_id === conversationId) cb.current?.refused?.(j, e); };
    sentSubs.add(ok); refusedSubs.add(no);
    return () => { sentSubs.delete(ok); refusedSubs.delete(no); };
  }, [conversationId]);
  return list;
}
