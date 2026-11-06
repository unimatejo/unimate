import { Check, School } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { SheetModal } from '@/components/chat/ChatExtras';
import { T, Tap } from '@/components/ui';
import { nm, t, ta } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import type { University } from '@/lib/types';
import { normalize } from '@/lib/util';

/** Pick a university to look at its campus map; yours is first and always one tap back. */
export function UniSwitcher({ open, onClose, current, mine, onPick }: {
  open: boolean; onClose: () => void; current: string | null; mine: string | null; onPick: (u: University) => void;
}) {
  const [all, setAll] = useState<University[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open || all.length) return;
    supabase.from('universities').select('*').not('center_lat', 'is', null).order('name_ar').then(({ data }) => setAll((data as University[] | null) ?? []));
  }, [open, all.length]);
  const list = useMemo(() => {
    const n = normalize(q);
    const hit = all.filter((u) => !n || normalize(u.name_ar).includes(n) || normalize(u.name_en ?? '').includes(n));
    return [...hit.filter((u) => u.id === mine), ...hit.filter((u) => u.id !== mine)];
  }, [all, q, mine]);

  return (
    <SheetModal open={open} onClose={onClose} style={{ maxHeight: '80%' }}>
      <View style={{ padding: 16, gap: 10, flexShrink: 1 }}>
        <T v="h3">{t('خرائط الجامعات')}</T>
        <TextInput value={q} onChangeText={setQ} placeholder={t('ابحث عن جامعة')} placeholderTextColor={C.faint} keyboardAppearance={isDark ? 'dark' : 'light'}
          style={{ minHeight: 48, borderRadius: 14, backgroundColor: C.soft, paddingHorizontal: 14, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} accessibilityLabel={t('ابحث عن جامعة')} />
        <FlatList data={list} keyExtractor={(u) => u.id} keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}
          renderItem={({ item: u }) => (
            <Tap onPress={() => { onPick(u); onClose(); }} accessibilityLabel={nm(u)}
              style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <School size={20} color={u.id === mine ? C.primary : C.muted} />
              <View style={{ flex: 1 }}>
                <T v="bodyMd" numberOfLines={1}>{nm(u)}</T>
                {u.id === mine && <T v="tiny" color={C.primary}>{t('جامعتك')}</T>}
              </View>
              {u.id === current && <Check size={20} color={C.primary} />}
            </Tap>
          )} />
      </View>
    </SheetModal>
  );
}
