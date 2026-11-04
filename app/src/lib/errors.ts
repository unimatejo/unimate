import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';

import { supabase } from './supabase';
import { t } from './i18n';

let current = '';
export function setScreen(s: string) { current = s; }

/** Send an error report to the database so problems on real phones can be fixed. Never throws. */
export async function reportError(e: unknown, fatal = false) {
  try {
    // Supabase / fetch errors are plain objects: keep their message, code and details instead of "[object Object]"
    const o = (e && typeof e === 'object' && !(e instanceof Error)) ? e as { message?: string; code?: string; details?: string; hint?: string; status?: number; name?: string } : null;
    const err = e instanceof Error ? e
      : o ? new Error([o.name, o.code, o.status, o.message, o.details, o.hint].filter((x) => x !== undefined && x !== null && x !== '').join(' · ') || JSON.stringify(e).slice(0, 500))
      : new Error(String(e));
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
    if (isFatal) Alert.alert(t('صار خطأ'), t('انبعت تقرير للفريق.\n\n{0}', [error?.message ?? '']));
    else prev(error, isFatal);
  });
}
