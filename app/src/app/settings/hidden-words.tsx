import { EyeOff, Plus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { run } from '@/lib/run';
import { C, F, isDark } from '@/lib/theme';
import { t, ta } from '@/lib/i18n';

/** Settings › hidden words: comments with these words are hidden for you. */
export default function HiddenWords() {
  const { profile } = useAuth();
  const [words, setWords] = useState<string[]>([]);
  const [w, setW] = useState('');

  useEffect(() => {
    if (!profile) return;
    supabase.from('hidden_words').select('word').eq('user_id', (profile?.id ?? '')).then(({ data }) => setWords((data ?? []).map((x) => x.word)));
  }, [profile]);

  async function add() {
    const v = w.trim().toLowerCase().slice(0, 40);
    if (!v || words.includes(v)) { setW(''); return; }
    setWords((x) => [v, ...x]); setW('');
    const r = await run(supabase.from('hidden_words').insert({ user_id: profile?.id ?? '', word: v }));
    if (!r.ok && r.error?.code !== '23505') { setWords((x) => x.filter((y) => y !== v)); setW(v); }
  }
  async function remove(v: string) {
    setWords((x) => x.filter((y) => y !== v));
    const r = await run(supabase.from('hidden_words').delete().eq('user_id', profile?.id ?? '').eq('word', v));
    if (!r.ok) setWords((x) => [v, ...x]);
  }

  return (
    <Screen>
      <Header title={t('الكلمات المخفية')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Row gap={10} style={{ backgroundColor: C.primarySoft, borderRadius: 18, padding: 12 }}>
          <EyeOff size={18} color={C.primary} />
          <T v="small" color={C.ink2} style={{ flex: 1 }}>{t('سيُخفى عنك تلقائياً أي تعليق أو طلب مراسلة يحتوي على هذه الكلمات.')}</T>
        </Row>
        <Row gap={8}>
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={w} onChangeText={setW} onSubmitEditing={add} placeholder={t('أضف كلمة أو جملة')} placeholderTextColor={C.faint} returnKeyType="done" maxLength={40}
            style={{ flex: 1, minHeight: 50, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 14, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
          <Tap onPress={add} accessibilityLabel={t('أضف')} style={{ width: 50, height: 50, borderRadius: 16, backgroundColor: C.inverse, alignItems: 'center', justifyContent: 'center' }}><Plus size={22} color={C.onInverse} /></Tap>
        </Row>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {words.map((x) => (
            <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 999, paddingRight: 14, paddingLeft: 6, minHeight: 40 }}>
              <T v="bodyMd">{x}</T>
              <Tap onPress={() => remove(x)} accessibilityLabel={t('احذف {0}', [x])} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><X size={14} color={C.ink2} /></Tap>
            </View>
          ))}
        </Row>
      </ScrollView>
    </Screen>
  );
}
