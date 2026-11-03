import { useState } from 'react';

import { ChatViewer } from '../chat';
import { fmtDate, supabase } from '../lib';
import { Top } from '../ui';

type Conv = { id: string; kind: string; title: string | null; context_label: string | null; last_message_at: string; members: { id: string; name: string; state: string }[] };

export default function Conversations() {
  const [id, setId] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id') ?? '');
  const [conv, setConv] = useState<Conv | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function find() {
    setErr(null); setConv(null);
    const v = id.trim();
    const { data } = await supabase.from('conversations').select('id, kind, title, context_label, last_message_at').eq('id', v).maybeSingle();
    if (!data) { setErr('ما لقينا محادثة بهالرقم. لتشوف محادثات شخص، افتحه من صفحة المستخدمين.'); return; }
    const { data: m } = await supabase.from('conversation_members').select('user_id, state, p:profiles(full_name)').eq('conversation_id', v);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConv({ ...data, members: ((m ?? []) as any[]).map((x) => ({ id: x.user_id, name: x.p?.full_name ?? '؟', state: x.state })) });
  }

  return (
    <div className="stack">
      <Top title="المحادثات" sub="افتح أي محادثة برقمها، أو من صفحة المستخدم أو البلاغ" />
      <div className="panel row">
        <input className="input ltr grow" style={{ flex: 1, minWidth: 260 }} value={id} onChange={(e) => setId(e.target.value)} placeholder="رقم المحادثة (UUID)" />
        <button className="btn" onClick={find} disabled={id.trim().length < 30}>جيب</button>
      </div>
      {err && <div className="panel err">{err}</div>}
      {conv && (
        <div className="panel stack">
          <div><h2>{conv.title ?? conv.members.map((m) => m.name).join('، ')}</h2>
            <div className="small muted">{conv.context_label ?? ''} · آخر رسالة {fmtDate(conv.last_message_at)} · {conv.members.map((m) => `${m.name}${m.state === 'request' ? ' (طلب)' : m.state === 'left' ? ' (طلع)' : ''}`).join('، ')}</div></div>
          <ChatViewer conversationId={conv.id} members={conv.members} />
        </div>
      )}
    </div>
  );
}
