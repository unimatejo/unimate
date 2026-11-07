import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';
import { sharedChannel } from './realtime';

/**
 * Unread chats + message requests. Refreshed when a new message pings my own private topic «inbox:<me>» (the
 * database sends it, 0130: no app watches every message any more), when the app comes back, and every 2 minutes as
 * a safety net. Bursts of pings are folded into one refresh.
 */
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
    let soon: ReturnType<typeof setTimeout> | null = null;
    const later = () => { if (!soon) soon = setTimeout(() => { soon = null; load(); }, 1200); };
    const t = setInterval(load, 120000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    const ch = sharedChannel(`inbox:${userId}`, { config: { private: true } }).on('broadcast', { event: 'msg' }, later).subscribe();
    return () => { alive = false; if (soon) clearTimeout(soon); clearInterval(t); sub.remove(); supabase.removeChannel(ch); };
  }, [userId]);
  return n;
}
