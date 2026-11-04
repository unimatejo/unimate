import { useState } from 'react';
import { View } from 'react-native';

import { AdminScreen, Muted, Panel, Pill, State, fmtDate, useLoad } from '@/components/admin/kit';
import { T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type E = { id: number; fatal: boolean; message: string; stack: string | null; screen: string | null; platform: string | null; app_version: string | null; created_at: string; user: { full_name: string } | null };

export default function Errors() {
  const { data, loading, error } = useLoad<E[]>(() => supabase.from('client_errors').select('*, user:profiles(full_name)').order('created_at', { ascending: false }).limit(200) as never, []);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <AdminScreen title={t('أخطاء التطبيق')} subtitle={t('أي خطأ بيصير على تلفونات الطلاب بيوصل هون لحاله')}>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((e) => (
            <Tap key={e.id} onPress={() => setOpen(open === e.id ? null : e.id)} scale={0.99} haptic={false}>
              <Panel>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {e.fatal && <Pill label={t('خطير')} tone="red" />}
                  {e.screen ? <Pill label={e.screen} /> : null}
                  {e.platform ? <Pill label={`${e.platform} ${e.app_version ?? ''}`} tone="blue" /> : null}
                </View>
                <T v="small" style={{ writingDirection: 'ltr', textAlign: 'left' }} selectable numberOfLines={open === e.id ? undefined : 3}>{e.message}</T>
                <Muted>{[fmtDate(e.created_at), e.user?.full_name].filter(Boolean).join(' · ')}</Muted>
                {open === e.id && e.stack ? <T v="tiny" color={C.muted} selectable style={{ writingDirection: 'ltr', textAlign: 'left' }}>{e.stack.slice(0, 1500)}</T> : null}
              </Panel>
            </Tap>
          ))}
        </View>
      </State>
    </AdminScreen>
  );
}
