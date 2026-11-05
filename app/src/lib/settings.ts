import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from './auth';
import { supabase } from './supabase';
import type { Profile } from './types';
import { t } from './i18n';

/** Update a field on my profile with an optimistic UI and refresh the session copy. */
export function useProfilePatch() {
  const { profile, refreshProfile } = useAuth();
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const value = { ...(profile ?? {}), ...draft } as Profile;

  const patch = useCallback(async (p: Partial<Profile>) => {
    if (!profile) return;
    setDraft((d) => ({ ...d, ...p }));
    const { error } = await supabase.from('profiles').update(p).eq('id', profile.id).select('id').single();
    if (error) {
      // undo only the keys that failed, keep other pending edits
      setDraft((d) => { const n = { ...d }; for (const k of Object.keys(p)) delete (n as Record<string, unknown>)[k]; return n; });
      Alert.alert(t('ما زبط الحفظ'), t('تأكد من الإنترنت وجرب كمان مرة.')); return;
    }
    await refreshProfile();
    setDraft((d) => { const n = { ...d }; for (const k of Object.keys(p)) delete (n as Record<string, unknown>)[k]; return n; });
  }, [profile, refreshProfile]);

  return { value, patch };
}

type Prefs = {
  lectures: boolean; lecture_minutes: number; smart_leave: boolean; nightly_summary: boolean; summary_time: string;
  exams: boolean; messages: boolean; social: boolean; community: boolean; ads: boolean; email_offers: boolean; preview: boolean;
};
const DEFAULT_PREFS: Prefs = {
  lectures: true, lecture_minutes: 10, smart_leave: true, nightly_summary: true, summary_time: '21:00:00',
  exams: true, messages: true, social: true, community: true, ads: true, email_offers: false, preview: true,
};

export function usePrefs() {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!profile) return;
    supabase.from('notification_prefs').select('*').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => { if (data) setPrefs({ ...DEFAULT_PREFS, ...data }); setLoaded(true); }, () => setLoaded(true));
  }, [profile]);
  const set = useCallback(async (p: Partial<Prefs>) => {
    if (!profile) return false;
    let before: Prefs = DEFAULT_PREFS;
    setPrefs((x) => { before = x; return { ...x, ...p }; });
    const { error } = await supabase.from('notification_prefs').upsert({ user_id: profile.id, ...p }, { onConflict: 'user_id' });
    if (error) { setPrefs(before); Alert.alert(t('ما زبط الحفظ'), t('تأكد من الإنترنت وجرب كمان مرة.')); return false; }
    return true;
  }, [profile]);
  return { prefs, set, loaded };
}
