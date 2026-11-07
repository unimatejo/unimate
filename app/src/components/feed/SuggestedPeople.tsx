import { router } from 'expo-router';
import { BadgeCheck, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Avatar, Button, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isAR, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, shadow } from '@/lib/theme';

type S = { id: string; full_name: string; username: string | null; avatar_url: string | null; is_verified: boolean; major_ar: string | null; major_en: string | null; reason: string };

const WHY: Record<string, string> = { cohort: 'من دفعتك', major: 'من تخصصك', college: 'من كليتك', university: 'من جامعتك' };

/** "People you may know" row: classmates from your major, cohort and college. */
export function SuggestedPeople() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<S[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    supabase.rpc('suggested_people', { lim: 15 }).then(({ data }) => setRows((data ?? []) as S[]));
  }, [profile]);

  async function follow(id: string) {
    if (!profile) return;
    setDone((d) => new Set(d).add(id));
    const { data } = await supabase.from('follows').insert({ follower_id: profile.id, followee_id: id }).select('status').single();
    if (data?.status === 'pending') setPending((x) => new Set(x).add(id));
  }

  const shown = rows;
  if (shown.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ paddingHorizontal: 18 }}>
        <T v="h3" style={{ flex: 1 }}>{t('أشخاص قد تعرفهم')}</T>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 18 }}>
        {shown.map((p) => (
          <Animated.View key={p.id} entering={FadeIn} exiting={FadeOut} layout={LinearTransition}
            style={[{ width: 150, backgroundColor: C.card, borderRadius: 22, padding: 12, alignItems: 'center', gap: 6 }, shadow]}>
            <Tap onPress={() => setRows((r) => r.filter((x) => x.id !== p.id))} accessibilityLabel={t('إزالة الاقتراح')} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <X size={14} color={C.faint} />
            </Tap>
            <Tap haptic={false} onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.id } })} style={{ alignItems: 'center', gap: 6 }}>
              <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={64} />
              <Row gap={3} style={{ maxWidth: 126 }}>
                <T v="bold" numberOfLines={1} style={{ fontSize: 13, flexShrink: 1 }}>{p.full_name}</T>
                {p.is_verified && <BadgeCheck size={13} color={C.white} fill={C.verified} />}
              </Row>
              <T v="tiny" color={C.muted} numberOfLines={1}>{t(WHY[p.reason] ?? WHY.university)}</T>
              <T v="tiny" color={C.faint} numberOfLines={1} style={{ maxWidth: 126 }}>{(isAR ? p.major_ar : p.major_en || p.major_ar) ?? ''}</T>
            </Tap>
            <Button kind={done.has(p.id) ? 'soft' : 'primary'} title={pending.has(p.id) ? t('تم إرسال الطلب') : done.has(p.id) ? t('تتابعه') : t('متابعة')} onPress={() => (done.has(p.id) ? undefined : follow(p.id))}
              style={{ minHeight: 34, alignSelf: 'stretch', borderRadius: 12 }} />
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}
