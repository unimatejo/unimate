import { useEffect, useState } from 'react';

import { fmtDate, supabase } from './lib';

type Msg = { id: string; sender_id: string | null; kind: string; body: string | null; media_url: string | null; created_at: string; deleted_at: string | null; vanishes_at: string | null; viewed_once_at: string | null; is_saved: boolean };
type Member = { id: string; name: string; state?: string };

const KIND: Record<string, string> = { image: '📷 صورة', view_once: '👁 صورة لمرة وحدة', voice: '🎙 رسالة صوتية', file: '📎 ملف', post_share: '↗ منشور', story_reply: '↩ رد على ستوري', social_share: '🔗 حساب', system: 'نظام' };

/**
 * Opening a conversation is logged in admin_audit_log with the reason (via admin_conversation_messages).
 * The reason prompt is required so the log says why.
 */
export function ChatViewer({ conversationId, members, presetReason }: { conversationId: string; members: Member[]; presetReason?: string }) {
  const [reason, setReason] = useState(presetReason ?? '');
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<Record<string, string>>({});

  useEffect(() => { setMsgs(null); setReason(presetReason ?? ''); }, [conversationId, presetReason]);

  async function open() {
    setError(null);
    const { data, error } = await supabase.rpc('admin_conversation_messages', { conv: conversationId, reason: reason.trim() });
    if (error) { setError(error.message); return; }
    const list = (data ?? []) as Msg[];
    setMsgs(list);
    const paths = list.filter((m) => m.media_url).map((m) => m.media_url!);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('chat').createSignedUrls(paths, 3600);
      setMedia(Object.fromEntries((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl as string])));
    }
  }

  async function del(m: Msg) {
    const r = prompt('ليش بدك تحذف هالرسالة؟');
    if (r === null) return;
    await supabase.rpc('admin_delete_message', { msg: m.id, reason: r });
    setMsgs((x) => x?.map((y) => (y.id === m.id ? { ...y, deleted_at: new Date().toISOString() } : y)) ?? null);
  }

  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'نظام';
  const first = members[0]?.id;

  if (!msgs) return (
    <div className="stack">
      <div className="notice">فتح المحادثة بينسجل باسمك مع السبب بسجل الإدارة.</div>
      <label className="f">سبب الفتح<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: بلاغ تحرش رقم …" /></label>
      <button className="btn" disabled={reason.trim().length < 3} onClick={open}>افتح المحادثة</button>
      {error && <div className="err small">{error}</div>}
    </div>
  );

  return (
    <div className="chat">
      {msgs.length === 0 && <div className="muted">ما في رسائل.</div>}
      {msgs.map((m) => {
        const gone = !!m.deleted_at || (!!m.vanishes_at && new Date(m.vanishes_at) < new Date() && !m.is_saved);
        return (
          <div key={m.id} className={`bubble ${m.sender_id === first ? '' : 'alt'} ${gone ? 'gone' : ''}`}>
            <div className="meta">{name(m.sender_id)} · {fmtDate(m.created_at)}{m.deleted_at ? ' · محذوفة' : gone ? ' · اختفت عند المستخدمين' : ''}{m.is_saved ? ' · محفوظة' : ''}</div>
            {m.kind !== 'text' && <div className="small muted">{KIND[m.kind] ?? m.kind}</div>}
            {m.body && <div>{m.body}</div>}
            {m.media_url && media[m.media_url] && <a href={media[m.media_url]} target="_blank" rel="noreferrer"><img src={media[m.media_url]} alt="" style={{ maxWidth: 220, borderRadius: 10, marginTop: 4 }} /></a>}
            {!m.deleted_at && <button className="btn ghost sm" onClick={() => del(m)}>احذف</button>}
          </div>
        );
      })}
    </div>
  );
}
