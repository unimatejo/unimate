import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Button, Screen, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { importMsPhoto, importMsRole, importTeamsInBackground, importTeamsWithToken, retryMicrosoftWithoutTeams, takePendingTeamsImport } from '@/lib/auth';
import { getPref, setPref } from '@/lib/prefs';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Opened from the sign-in email link: finishes the sign-in and continues. */
export default function Callback() {
  const p = useLocalSearchParams<{ code?: string; token_hash?: string; type?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // web: the university refused the Teams permission, so sign in without it
      if (p.error_description && retryMicrosoftWithoutTeams()) return;
      if (p.error_description) {
        // Microsoft sign-in that took too long, or was finished in another browser: just start again
        setError(/state/i.test(p.error_description) ? t('استغرق تسجيل الدخول وقتاً طويلاً أو فُتح في متصفح آخر. اضغط «حاول مرة أخرى».') : t('انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.'));
        return;
      }
      // the phone app already finished this sign-in itself (the same link also opens this screen): don't use the code twice
      const before = (await supabase.auth.getSession()).data.session;
      if (before && Platform.OS !== 'web') { router.replace('/'); return; }
      let r: { error: unknown; data?: { session?: { provider_token?: string | null } | null } };
      try {
        r = p.code
          ? await supabase.auth.exchangeCodeForSession(p.code)
          : p.token_hash
            ? await supabase.auth.verifyOtp({ token_hash: p.token_hash, type: (p.type as 'email' | 'magiclink') ?? 'email' })
            : { error: new Error('no code') };
      } catch (e) { r = { error: e }; }
      // the code was already used, but we're signed in anyway: carry on
      if (r.error && (await supabase.auth.getSession()).data.session) { router.replace('/'); return; }
      if (r.error) { setError(t('تعذّر الدخول بهذا الرابط. افتح الرابط على الهاتف نفسه الذي طلبته منه، أو اطلب رابطًا جديدًا.')); return; }
      // web: coming back from "bring my courses from Teams"
      const fromLogin = getPref('ms_teams_login'); setPref('ms_teams_login', '');
      importMsPhoto(r.data?.session?.provider_token); importMsRole(r.data?.session?.provider_token);
      if (takePendingTeamsImport()) {
        const token = r.data?.session?.provider_token;
        if (fromLogin) { if (token) importTeamsInBackground(token); router.replace('/'); return; } // first sign-in: don't make them wait
        const res = await importTeamsWithToken(token);
        router.replace({ pathname: '/courses', params: { teams: 'count' in res ? String(res.count) : res.error } });
        return;
      }
      router.replace('/');  // the gate sends the user to setup or home
    })();
  }, [p.code, p.token_hash, p.type, p.error_description]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        {error ? (
          <>
            <T v="h2" style={{ textAlign: 'center' }}>{error}</T>
            <Button title={t('حاول مرة أخرى')} onPress={() => router.replace('/(auth)/login')} />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={C.primary} />
            <T v="body" color={C.muted}>{t('جارٍ تسجيل دخولك…')}</T>
          </>
        )}
      </View>
    </Screen>
  );
}
