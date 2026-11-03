import { Platform } from 'react-native';

/** Tiny synchronous key-value store for app preferences (theme, language). Read at startup before the first render. */
type KV = { getItemSync(k: string): string | null; setItemSync(k: string, v: string): void };
let kv: KV | null = null;
try {
  if (Platform.OS !== 'web') kv = require('expo-sqlite/kv-store').default as KV;
} catch { kv = null; }

export function getPref(key: string): string | null {
  try {
    if (kv) return kv.getItemSync(key);
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch { return null; }
}

export function setPref(key: string, value: string) {
  try {
    if (kv) kv.setItemSync(key, value);
    else if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch { /* ignore */ }
}
