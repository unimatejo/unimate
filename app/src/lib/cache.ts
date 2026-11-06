/**
 * What a screen showed last time, so it opens instantly and refreshes quietly in the background (like Instagram).
 * Kept in memory and on the device; every key includes the signed-in user's id, and signing out wipes it all.
 */
const PREFIX = 'um_cache:';
const MAX_CHARS = 400_000; // a very big list isn't worth keeping on the device
const mem = new Map<string, unknown>();

export function readCache<T>(key: string | null | undefined): T | undefined {
  if (!key) return undefined;
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return undefined;
    const v = JSON.parse(raw) as T;
    mem.set(key, v);
    return v;
  } catch { return undefined; }
}

export function writeCache(key: string | null | undefined, value: unknown) {
  if (!key) return;
  mem.set(key, value);
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= MAX_CHARS) localStorage.setItem(PREFIX + key, raw);
    else localStorage.removeItem(PREFIX + key);
  } catch { /* storage full or unavailable: memory is enough */ }
}

/** Called on sign-out: nothing of the last account stays on the device. */
export function clearCache() {
  mem.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(PREFIX)) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* unavailable */ }
}
