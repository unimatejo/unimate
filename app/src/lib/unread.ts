import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';
import { rtTopic } from './realtime';

/** Unread chats + message requests, refreshed on new messages (realtime), app focus, and every 45s. */
export function useUnreadMessages(userId?: string | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('conversation_members').select('conversation_id, state').eq('user_id', userId).in('state', ['active', 'request']);
      const rows = (data ?? []) as { conversation_id: string; state: string }[];
      const active = rows.filter((r) => r.state === 'active').map((r) => r.conversation_id);
      const { data: counts } = active.length ? await supabase.rpc('unread_counts', { conv_ids: active }) : { data: [] };
      if (!alive) return;
      setN(rows.filter((r) => r.state === 'request').length + ((counts ?? []) as { n: number }[]).filter((c) => c.n > 0).length);
    };
    load();
    const t = setInterval(load, 45000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    const ch = supabase.channel(rtTopic(`unread-${userId}`)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load()).subscribe();
    return () => { alive = false; clearInterval(t); sub.remove(); supabase.removeChannel(ch); };
  }, [userId]);
  return n;
}
