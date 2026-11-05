import { useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { C } from '@/lib/theme';

/**
 * Pull-to-refresh that only spins while the person is actually pulling.
 * Screens used to pass `refreshing={loading}`, so every quiet reload (on focus, when the app came back)
 * showed the spinner and pushed the whole page down and up again.
 */
export function PullRefresh({ onRefresh, ...p }: Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & { onRefresh: () => unknown }) {
  const [on, setOn] = useState(false);
  return (
    <RefreshControl tintColor={C.muted} {...p} refreshing={on}
      onRefresh={async () => { setOn(true); try { await onRefresh(); } finally { setOn(false); } }} />
  );
}
