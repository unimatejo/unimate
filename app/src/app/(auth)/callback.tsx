import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Screen, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

/** Opened from the sign-in email link: finishes the sign-in and continues. */
export default function Callback() {
  const p = useLocalSearchParams<{ code?: string; token_hash?: string; type?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (p.error_description) { setError('الرابط انتهى أو انستخدم قبل. اطلب رابط جديد.'); return; }
      const r = p.code
        ? await supabase.auth.exchangeCodeForSession(p.code)
        : p.token_hash
          ? await supabase.auth.verifyOtp({ token_hash: p.token_hash, type: (p.type as 'email' | 'magiclink') ?? 'email' })
          : { error: new Error('no code') };
      if (r.error) { setError('ما زبط الدخول بهالرابط. افتح الرابط على نفس التلفون اللي طلبت منه، أو اطلب رابط جديد.'); return; }
      router.replace('/(auth)/welcome');
    })();
  }, [p.code, p.token_hash, p.type, p.error_description]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        {error ? (
          <>
            <T v="h2" style={{ textAlign: 'center' }}>{error}</T>
            <Button title="رجوع لتسجيل الدخول" onPress={() => router.replace('/(auth)/login')} />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={C.primary} />
            <T v="body" color={C.muted}>بندخّلك…</T>
          </>
        )}
      </View>
    </Screen>
  );
}
