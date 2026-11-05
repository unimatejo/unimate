import { useLocalSearchParams } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ChatViewer, type Member } from '@/components/admin/ChatViewer';
import { AdminScreen, useAdminRole, Filters, Item, Muted, Panel, SearchBox, Sheet, State, fmtDate, fmtNum, tap } from '@/components/admin/kit';
import { Avatar, T, Toggle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Conv = {
  id: string; kind: string; title: string | null; context_label: string | null; last_message_at: string | null;
  members: (Member & { username?: string | null; avatar_url?: string | null; state: string })[] | null; message_count: number; last_body: string | null;
};
type Kind = 'all' | 'direct' | 'group' | 'community';

const label = (c: Conv) => c.title || (c.members ?? []).map((m) => m.name).join('، ') || t('محادثة');

/** Every chat on the platform, newest first, refreshed live. Tap one to read it (and follow new messages as they arrive). */
export default function Conversations() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [list, setList] = useState<Conv[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Conv | null>(null);

  const role = useAdminRole();
  // owner's switch: full chats (testing period) or reported messages only
  const [full, setFull] = useState<boolean | null>(null);
  useEffect(() => { if (role) supabase.rpc('admin_chat_mode', {}).then(({ data }) => setFull(data === true), () => {}); }, [role]);
  async function setMode(v: boolean) {
    setFull(v);
    const { data, error: e } = await supabase.rpc('admin_chat_mode', { p_full: v });
    if (e) { setFull(!v); setError(e.message); return; }
    setFull(data === true); load();
  }
  const load = useCallback(async () => {
    if (!role) return; // not an admin (or still checking): the screen shows the guard, nothing to fetch
    const { data, error: e } = await supabase.rpc('admin_list_conversations', { q: q.trim(), lim: 100, off: 0 });
    if (e) { setError(e.message); return; }
    setError(null); setList((data ?? []) as Conv[]);
  }, [q, role]);

  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  // live: the list refreshes on its own every 10 seconds
  useEffect(() => { const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);
  // opened from a user / report / log entry with ?id=
  useEffect(() => {
    if (!params.id || !role) return;
    supabase.rpc('admin_list_conversations', { q: params.id, lim: 1, off: 0 }).then(({ data }) => { const c = (data as Conv[] | null)?.[0]; if (c) setOpen(c); }, () => {});
  }, [params.id, role]);

  const shown = (list ?? []).filter((c) => kind === 'all' || c.kind === kind);

  return (
    <AdminScreen ownerOnly title={t('المحادثات')} subtitle={full === false ? t('المحادثات الخاصة مقفلة، بتنفتح بس الرسائل اللي عليها بلاغ') : t('كل المحادثات على المنصة، بتتحدّث لحالها')}>
      {role === 'owner' && full !== null && (
        <Panel>
          <Toggle value={full} onChange={setMode} label={t('عرض المحادثات الخاصة كاملة')}
            hint={full ? t('شغّال: الأدمنز بيشوفوا كل المحادثات. كل فتحة بتنسجل.') : t('مطفي: بتنفتح بس الرسائل اللي عليها بلاغ.')} />
        </Panel>
      )}
      <SearchBox value={q} onChange={setQ} placeholder={t('ابحث باسم شخص أو يوزر أو اسم جروب')} />
      <Filters items={[['all', t('الكل')], ['direct', t('خاص')], ['group', t('جروبات')], ['community', t('مجتمعات')]]} value={kind} onChange={setKind} />
      <State loading={list === null && !error} error={error} empty={!shown.length}>
        <Panel>
          {shown.map((c) => {
            const ms = c.members ?? [];
            return (
              <Item key={c.id} onPress={() => { tap(); setOpen(c); }}
                start={c.kind === 'direct' && ms[0]
                  ? <Avatar id={ms[0].id} name={ms[0].name} url={ms[0].avatar_url} size={44} />
                  : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Users size={20} color={C.ink} /></View>}
                title={label(c)}
                sub={[c.last_body, t('{0} رسالة', [fmtNum(c.message_count)]), c.last_message_at ? fmtDate(c.last_message_at) : null].filter(Boolean).join(' · ')} />
            );
          })}
        </Panel>
      </State>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? label(open) : ''}>
        {open && (
          <View style={{ gap: 10 }}>
            {/* groups can have dozens of members: show the count and a few names, not a wall of text */}
            <Muted>{[open.context_label,
              (open.members ?? []).length > 3
                ? t('{0} عضو: {1}…', [String((open.members ?? []).length), (open.members ?? []).slice(0, 3).map((m) => m.name).join('، ')])
                : (open.members ?? []).map((m) => `${m.name}${m.username ? ` (\u2066@${m.username}\u2069)` : ''}${m.state === 'request' ? ` · ${t('طلب')}` : m.state === 'left' ? ` · ${t('طلع')}` : ''}`).join('، '),
            ].filter(Boolean).join(' · ')}</Muted>
            <T v="tiny" color={C.muted}>{t('بتوصلك الرسائل الجديدة لحالها وإنت فاتح.')}</T>
            <ChatViewer conversationId={open.id} members={open.members ?? []} />
          </View>
        )}
      </Sheet>
    </AdminScreen>
  );
}
