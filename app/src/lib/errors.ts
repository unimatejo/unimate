import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';

import { supabase } from './supabase';

let current = '';
export function setScreen(s: string) { current = s; }

/** Send an error report to the database so problems on real phones can be fixed. Never throws. */
export async function reportError(e: unknown, fatal = false) {
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    await supabase.from('client_errors').insert({
      fatal, message: (err.message || 'unknown').slice(0, 2000), stack: (err.stack ?? '').slice(0, 8000),
      screen: current, platform: `${Platform.OS} ${Platform.Version}`, app_version: Constants.expoConfig?.version ?? null,
    });
  } catch { /* offline or not signed in: nothing to do */ }
}

/** Keep the app open on a JavaScript error: report it and show a message instead of closing. */
export function installGlobalErrorHandler() {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: Error, f?: boolean) => void; setGlobalHandler: (h: (e: Error, f?: boolean) => void) => void } };
  if (!g.ErrorUtils) return;
  const prev = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, !!isFatal);
    if (isFatal) Alert.alert('صار خطأ', `انبعت تقرير للفريق.\n\n${error?.message ?? ''}`);
    else prev(error, isFatal);
  });
}
