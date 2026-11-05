import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Empty, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

/** Group invite link: app.unimate.my/join/<code> → join and open the chat. */
export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!code) return;
    supabase.rpc('group_join', { p_code: code }).then(({ data, error }) => {
      if (error || !data) { setBad(true); return; }
      router.replace({ pathname: '/messages/[id]', params: { id: data as string } });
    }, () => setBad(true));
  }, [code]);
  return (
    <Screen>
      {bad
        ? <Empty title={t('الرابط مش شغّال')} body={t('ممكن يكون انتهى أو المشرف غيّره.')} action={<Button kind="soft" title={t('ارجع للرسائل')} onPress={() => router.replace('/messages')} style={{ marginTop: 10, paddingHorizontal: 20 }} />} />
        : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.muted} /></View>}
    </Screen>
  );
}
