import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Field, T, Tap } from '../ui';
import { Act, Panel, confirm, fmtDate, promptText, Muted } from './kit';
import { supabase } from '@/lib/supabase';
import { C, R } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Msg = { id: string; sender_id: string | null; kind: string; body: string | null; media_url: string | null; created_at: string; deleted_at: string | null; vanishes_at: string | null; viewed_once_at: string | null; is_saved: boolean };
export type Member = { id: string; name: string; state?: string };

const KIND: Record<string, string> = { image: t('📷 صورة'), view_once: t('👁 صورة لمرة وحدة'), voice: t('🎙 رسالة صوتية'), file: t('📎 ملف'), post_share: t('↗ منشور'), story_reply: t('↩ رد على ستوري'), social_share: t('🔗 حساب'), system: t('نظام'), sticker: t('ستيكر'), location: t('📍 موقع'), contact: t('👤 جهة اتصال'), poll: t('📊 استطلاع') };

/**
 * Opening a chat is written to the admin log with the reason (admin_conversation_messages does that),
 * so a reason is required first.
 */
export function ChatViewer({ conversationId, members, presetReason }: { conversationId: string; members: Member[]; presetReason?: string }) {
  const [reason, setReason] = useState(presetReason ?? '');
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMsgs(null); setReason(presetReason ?? ''); }, [conversationId, presetReason]);
  // opens straight away (no reason needed) and keeps following new messages live
  useEffect(() => { if (!msgs && !busy) open(); }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!msgs) return;
    const tick = setInterval(async () => {
      const last = msgs[msgs.length - 1]?.created_at ?? new Date(0).toISOString();
      const { data } = await supabase.rpc('admin_conversation_since', { conv: conversationId, after: last });
      const fresh = (data ?? []) as Msg[];
      if (fresh.length) setMsgs((x) => [...(x ?? []), ...fresh.filter((f) => !(x ?? []).some((y) => y.id === f.id))]);
    }, 4000);
    return () => clearInterval(tick);
  }, [msgs, conversationId]);

  async function open() {
    setError(null); setBusy(true);
    const { data, error: e } = await supabase.rpc('admin_conversation_messages', { conv: conversationId, reason: reason.trim() || 'browse' });
    setBusy(false);
    if (e) { setError(e.message); return; }
    const list = (data ?? []) as Msg[];
    setMsgs(list);
    const paths = list.filter((m) => m.media_url && !/^https?:/.test(m.media_url)).map((m) => m.media_url!);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('chat').createSignedUrls(paths, 3600);
      setMedia(Object.fromEntries((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl as string])));
    }
  }

  async function del(m: Msg) {
    if (!(await confirm(t('تحذف هالرسالة؟'), t('بتنحذف عند الكل، وبينسجل الحذف باسمك.'), t('احذف')))) return;
    const r = await promptText(t('ليش بدك تحذف هالرسالة؟'));
    if (r === null) return;
    await supabase.rpc('admin_delete_message', { msg: m.id, reason: r });
    setMsgs((x) => x?.map((y) => (y.id === m.id ? { ...y, deleted_at: new Date().toISOString() } : y)) ?? null);
  }

  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? t('نظام');
  const first = members[0]?.id;

  if (!msgs) return (
    <Panel>
      {error ? <T v="small" color={C.red}>{error}</T> : <Muted>{t('عم نفتح المحادثة…')}</Muted>}
      {error && <Act label={t('جرّب كمان مرة')} kind="primary" loading={busy} onPress={open} />}
    </Panel>
  );

  return (
    <View style={{ gap: 8 }}>
      {msgs.length === 0 && <Muted>{t('ما في رسائل.')}</Muted>}
      {msgs.map((m) => {
        const gone = !!m.deleted_at || (!!m.vanishes_at && new Date(m.vanishes_at) < new Date() && !m.is_saved);
        const mine = m.sender_id === first;
        const src = m.media_url ? (/^https?:/.test(m.media_url) ? m.media_url : media[m.media_url]) : null;
        return (
          <View key={m.id} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', maxWidth: '86%', backgroundColor: mine ? C.soft : C.primarySoft, borderRadius: 18, padding: 10, gap: 4, opacity: gone ? 0.55 : 1 }}>
            <T v="tiny" color={C.muted}>{name(m.sender_id)} · {fmtDate(m.created_at)}{m.deleted_at ? ` · ${t('محذوفة')}` : gone ? ` · ${t('اختفت عند المستخدمين')}` : ''}{m.is_saved ? ` · ${t('محفوظة')}` : ''}</T>
            {m.kind !== 'text' && <T v="tiny" color={C.muted}>{KIND[m.kind] ?? m.kind}</T>}
            {m.body ? <T v="body">{m.body}</T> : null}
            {src && <Image source={{ uri: src }} style={{ width: 200, height: 200, borderRadius: 12 }} contentFit="cover" />}
            {!m.deleted_at && (
              <Tap onPress={() => del(m)} accessibilityLabel={t('احذف')} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
                <T v="tiny" color={C.red}>{t('احذف')}</T>
              </Tap>
            )}
          </View>
        );
      })}
    </View>
  );
}
