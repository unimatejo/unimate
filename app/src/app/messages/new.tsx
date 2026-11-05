import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Check, Search, UsersRound } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/Glyph';
import { Avatar, Button, Empty, Field, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { nm, t, ta } from '@/lib/i18n';

type P = { id: string; full_name: string; username: string | null; avatar_url: string | null; is_verified: boolean; major: { name_ar: string } | null };

/** New message: pick one person to chat, or switch to group mode and pick several. */
export default function NewMessage() {
  const params = useLocalSearchParams<{ group?: string }>();
  const { profile } = useAuth();
  const [group, setGroup] = useState(params.group === '1');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<P[]>([]);
  const [picked, setPicked] = useState<P[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const t = setTimeout(async () => {
      const s = q.trim().replace(/^@/, '').replace(/[,()]/g, ' ');
      const sel = 'id, full_name, username, avatar_url, is_verified, major:majors!profiles_major_id_fkey(name_ar, name_en)';
      if (!s) {
        const { data } = await supabase.from('follows').select(`p:profiles!follows_followee_id_fkey(${sel})`).eq('follower_id', profile.id).eq('status', 'accepted').limit(100);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPeople(((data ?? []) as any[]).map((x) => x.p).filter(Boolean));
      } else {
        const { data } = await supabase.from('profiles').select(sel).or(`full_name.ilike.%${s}%,username.ilike.%${s.toLowerCase()}%`).neq('id', profile.id).limit(30);
        setPeople((data ?? []) as unknown as P[]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, profile]);

  async function openChat(p: P) {
    const { data, error } = await supabase.rpc('start_direct', { target: p.id, context: null });
    if (error) { Alert.alert(t('ما بتقدر تراسله'), error.message.includes('not accepting') ? t('هاد الطالب مسكّر الرسائل.') : t('جرّب بعدين.')); return; }
    router.replace({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  function toggle(p: P) {
    setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : cur.length >= 49 ? cur : [...cur, p]));
  }

  async function createGroup() {
    if (title.trim().length < 2) { Alert.alert(t('سمّي الجروب')); return; }
    if (picked.length < 1) { Alert.alert(t('اختار شخص واحد على الأقل')); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('create_group', { title: title.trim(), members: picked.map((p) => p.id) });
    setBusy(false);
    if (error) { Alert.alert(t('ما انعمل الجروب'), t('جرّب كمان مرة.')); return; }
    router.replace({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  const ids = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);

  return (
    <Screen>
      <Header title={group ? t('جروب جديد') : t('رسالة جديدة')} />
      <View style={{ paddingHorizontal: 18, gap: 12 }}>
        {!group && (
          <Tap onPress={() => setGroup(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 12 }}>
            <GlyphTile icon={UsersRound} colors={GRAD.violet} size={44} />
            <T v="bold" style={{ flex: 1 }}>{t('اعمل جروب')}</T>
          </Tap>
        )}
        {group && (
          <>
            <Field label={t('اسم الجروب')} value={title} onChangeText={setTitle} maxLength={60} placeholder={t('مثلاً شلة مشروع التخرج')} />
            {picked.length > 0 && (
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {picked.map((p) => (
                  <Tap key={p.id} onPress={() => toggle(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <T v="tiny" color={C.primaryDark}>{p.full_name.split(' ')[0]} ✕</T>
                  </Tap>
                ))}
              </Row>
            )}
          </>
        )}
        <Row gap={8} style={{ minHeight: 46, borderRadius: 15, backgroundColor: C.soft, paddingHorizontal: 14 }}>
          <Search size={19} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} autoCapitalize="none" placeholder={t('دوّر بالاسم أو اليوزر')} placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 15, textAlign: ta, color: C.ink }} />
        </Row>
        {!q && <T v="tiny" color={C.muted}>{t('اللي بتتابعهم')}</T>}
      </View>
      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 18, gap: 6, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <Tap onPress={() => (group ? toggle(item) : openChat(item))} scale={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 10 }}>
            <Avatar id={item.id} name={item.full_name} url={item.avatar_url} size={46} />
            <View style={{ flex: 1 }}>
              <Row gap={4}><T v="bodyMd" numberOfLines={1} style={{ flexShrink: 1 }}>{item.full_name}</T>{item.is_verified && <BadgeCheck size={14} color={C.white} fill={C.primary} />}</Row>
              <T v="tiny" color={C.muted} numberOfLines={1}>{[item.username ? `@${item.username}` : null, nm(item.major)].filter(Boolean).join(' · ')}</T>
            </View>
            {group && (
              <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: ids.has(item.id) ? C.primary : C.line, backgroundColor: ids.has(item.id) ? C.primary : C.card, alignItems: 'center', justifyContent: 'center' }}>
                {ids.has(item.id) && <Animated.View entering={FadeIn.duration(200)}><Check size={15} color={C.white} strokeWidth={3} /></Animated.View>}
              </View>
            )}
          </Tap>
        )}
        ListEmptyComponent={<Empty title={q ? t('ما لقينا حدا') : t('ما بتتابع حدا لهلأ')} body={q ? t('جرّب اسم ثاني أو اليوزر.') : t('دوّر على زميلك بالاسم أو اليوزر.')} />}
      />
      {group && (
        <View style={{ position: 'absolute', bottom: 30, left: 18, right: 18 }}>
          <Button title={`اعمل الجروب${picked.length ? ` (${picked.length + 1})` : ''}`} loading={busy} onPress={createGroup} />
        </View>
      )}
    </Screen>
  );
}
