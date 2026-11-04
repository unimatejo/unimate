import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Screen, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { importTeamsInBackground, importTeamsWithToken, retryMicrosoftWithoutTeams, takePendingTeamsImport } from '@/lib/auth';
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
        setError(/state/i.test(p.error_description) ? t('تسجيل الدخول أخد وقت طويل أو انفتح بمتصفح ثاني. اكبس «جرّب كمان مرة».') : t('الرابط انتهى أو انستخدم قبل. اطلب رابط جديد.'));
        return;
      }
      let r: { error: unknown; data?: { session?: { provider_token?: string | null } | null } };
      try {
        r = p.code
          ? await supabase.auth.exchangeCodeForSession(p.code)
          : p.token_hash
            ? await supabase.auth.verifyOtp({ token_hash: p.token_hash, type: (p.type as 'email' | 'magiclink') ?? 'email' })
            : { error: new Error('no code') };
      } catch (e) { r = { error: e }; }
      if (r.error) { setError(t('ما زبط الدخول بهالرابط. افتح الرابط على نفس التلفون اللي طلبت منه، أو اطلب رابط جديد.')); return; }
      // web: coming back from "bring my courses from Teams"
      const fromLogin = getPref('ms_teams_login'); setPref('ms_teams_login', '');
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
            <Button title={t('جرّب كمان مرة')} onPress={() => router.replace('/(auth)/login')} />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={C.primary} />
            <T v="body" color={C.muted}>{t('بندخّلك…')}</T>
          </>
        )}
      </View>
    </Screen>
  );
}
