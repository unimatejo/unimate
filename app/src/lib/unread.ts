import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

/** Unread chats + message requests, refreshed on new messages (realtime), app focus, and every 45s. */
export function useUnreadMessages(userId?: string | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('conversation_members').select('last_read_at, state, c:conversations(last_message_at)').eq('user_id', userId).in('state', ['active', 'request']);
      if (!alive) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setN(((data ?? []) as any[]).filter((r) => r.state === 'request' || (r.c && (!r.last_read_at || new Date(r.c.last_message_at) > new Date(r.last_read_at)))).length);
    };
    load();
    const t = setInterval(load, 45000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    const ch = supabase.channel(`unread-${userId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load()).subscribe();
    return () => { alive = false; clearInterval(t); sub.remove(); supabase.removeChannel(ch); };
  }, [userId]);
  return n;
}
