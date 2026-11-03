import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from './auth';
import { supabase } from './supabase';
import type { Profile } from './types';

/** Update a field on my profile with an optimistic UI and refresh the session copy. */
export function useProfilePatch() {
  const { profile, refreshProfile } = useAuth();
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const value = { ...(profile ?? {}), ...draft } as Profile;

  const patch = useCallback(async (p: Partial<Profile>) => {
    if (!profile) return;
    setDraft((d) => ({ ...d, ...p }));
    const { error } = await supabase.from('profiles').update(p).eq('id', (profile?.id ?? ''));
    if (error) { setDraft({}); Alert.alert('ما زبط الحفظ', 'تأكد من الإنترنت وجرب كمان مرة.'); return; }
    await refreshProfile();
    setDraft({});
  }, [profile, refreshProfile]);

  return { value, patch };
}

export type Prefs = {
  lectures: boolean; lecture_minutes: number; smart_leave: boolean; nightly_summary: boolean; summary_time: string;
  exams: boolean; messages: boolean; social: boolean; community: boolean; ads: boolean;
};
const DEFAULT_PREFS: Prefs = {
  lectures: true, lecture_minutes: 10, smart_leave: true, nightly_summary: true, summary_time: '21:00:00',
  exams: true, messages: true, social: true, community: true, ads: true,
};

export function usePrefs() {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    if (!profile) return;
    supabase.from('notification_prefs').select('*').eq('user_id', (profile?.id ?? '')).maybeSingle()
      .then(({ data }) => data && setPrefs({ ...DEFAULT_PREFS, ...data }));
  }, [profile]);
  const set = useCallback(async (p: Partial<Prefs>) => {
    if (!profile) return;
    setPrefs((x) => ({ ...x, ...p }));
    await supabase.from('notification_prefs').upsert({ user_id: (profile?.id ?? ''), ...p }, { onConflict: 'user_id' });
  }, [profile]);
  return { prefs, set };
}
