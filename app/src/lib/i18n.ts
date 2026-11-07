import { reloadAppAsync } from 'expo';
import { getLocales } from 'expo-localization';
import * as Updates from 'expo-updates';
import { I18nManager, Platform } from 'react-native';

import { EN } from './i18n.en';
import { getPref, setPref } from './prefs';

export type LangPref = 'system' | 'ar' | 'en';
export const langPref = (): LangPref => (getPref('lang') as LangPref) || 'system';

function deviceLang(): 'ar' | 'en' {
  try { return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en'; } catch { return 'ar'; }
}

/** Active language for this run of the app (changing it reloads the app so layout direction flips too). */
const lang: 'ar' | 'en' = (() => { const p = langPref(); return p === 'system' ? deviceLang() : p; })();
export const isAR = lang === 'ar';
/** Dates and numbers: Arabic month and day names, but always Western digits (1, 2, 3), like the app's numbers. */
export const LOCALE = isAR ? 'ar-JO-u-nu-latn' : 'en-GB';
/** Text alignment at the reading start (right in Arabic, left in English). */
export const ta: 'right' | 'left' = isAR ? 'right' : 'left';
/** Mirror a directional icon (arrows, send) when the layout is left-to-right. */
export const flip = isAR ? undefined : { transform: [{ scaleX: -1 }] };

const missing = new Set<string>();
/**
 * Translate an Arabic UI string. Arabic is the source text and the key.
 * `vars` fill {0}, {1}... placeholders.
 */
export function t(ar: string, vars?: (string | number | null | undefined)[]): string {
  let s = ar;
  if (!isAR) {
    const k = ar.trim();
    const en = EN[k];
    if (en !== undefined) s = ar.replace(k, en);
    else if (__DEV__ && !missing.has(k)) { missing.add(k); console.warn('[i18n] missing:', k); }
  }
  if (vars) vars.forEach((v, i) => { s = s.split(`{${i}}`).join(v == null ? '' : String(v)); });
  return s;
}

/** Pick the right name column for data rows (colleges, majors, universities have name_en). */
export const nm = (row?: { name_ar?: string | null; name_en?: string | null } | null) => (row ? (isAR ? row.name_ar : row.name_en || row.name_ar) ?? '' : '');

export async function reloadApp() {
  try { await reloadAppAsync('settings'); } catch { try { await Updates.reloadAsync(); } catch { /* the change applies on next launch */ } }
}

export function setLanguage(p: LangPref) { setPref('lang', p); reloadApp(); }

/** Make the native layout direction match the language; flips need one reload. */
/** Is the screen laid out right-to-left? (native: I18nManager; web: the html dir we set). */
export const rtlLayout = () => (Platform.OS === 'web' ? isAR : I18nManager.isRTL);

export function syncDirection() {
  if (Platform.OS === 'web') {
    // the browser lays the page out right-to-left from the html dir attribute
    if (typeof document !== 'undefined') { document.documentElement.dir = isAR ? 'rtl' : 'ltr'; document.documentElement.lang = isAR ? 'ar' : 'en'; }
    return;
  }
  if (I18nManager.isRTL === isAR) return;
  I18nManager.allowRTL(isAR);
  I18nManager.forceRTL(isAR);
  I18nManager.swapLeftAndRightInRTL(true);
  // never loop: at most one automatic reload every 20 seconds
  const last = Number(getPref('dirReloadAt') || 0);
  if (Date.now() - last > 20000) { setPref('dirReloadAt', String(Date.now())); reloadApp(); }
}
