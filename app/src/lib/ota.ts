import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * New versions arrive by themselves (no reinstalling the app): on launch and whenever the app comes back to the front,
 * check app.unimate.my/ota for a newer build of the same native version; download it and restart into it.
 */
export function useOtaUpdates() {
  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return;
    let busy = false, last = 0;
    const check = async () => {
      if (busy || Date.now() - last < 60_000) return;
      busy = true; last = Date.now();
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) { await Updates.fetchUpdateAsync(); await Updates.reloadAsync(); }
      } catch { /* offline or no update server: keep the current version */ }
      finally { busy = false; }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);
}
