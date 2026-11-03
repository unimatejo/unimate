import { Check, ChevronDown, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { Row, T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { nm, t, ta } from '@/lib/i18n';

type College = { id: string; name_ar: string; majors: { id: string; name_ar: string; degree: string }[] };

/** Pick a college, then a major inside it, from the student's own university. */
export function MajorPicker({ universityId, collegeId, majorId, onChange }: {
  universityId?: string | null; collegeId?: string | null; majorId?: string | null; onChange: (college: string | null, major: string | null) => void;
}) {
  const [cols, setCols] = useState<College[]>([]);
  const [open, setOpen] = useState<'college' | 'major' | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!universityId) return;
    supabase.from('colleges').select('id, name_ar, majors(id, name_ar, name_en, degree)').eq('university_id', universityId).order('name_ar')
      .then(({ data }) => setCols((data ?? []) as College[]));
  }, [universityId]);

  const col = cols.find((c) => c.id === collegeId);
  const major = col?.majors.find((m) => m.id === majorId);
  const list = useMemo(() => {
    const s = q.trim();
    const items = open === 'college' ? cols.map((c) => ({ id: c.id, name: nm(c) })) : (col?.majors ?? []).map((m) => ({ id: m.id, name: nm(m) + (m.degree === 'diploma' ? t(' (دبلوم)') : '') }));
    return (s ? items.filter((x) => x.name.includes(s)) : items).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [open, cols, col, q]);

  if (!universityId) return null;
  if (cols.length === 0) return <T v="small" color={C.muted}>{t('كليات جامعتك بتنضاف قريباً.')}</T>;

  const box = (label: string, value: string | undefined, which: 'college' | 'major', disabled = false) => (
    <Tap haptic={false} scale={0.99} disabled={disabled} onPress={() => { setQ(''); setOpen(open === which ? null : which); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, borderRadius: 16, backgroundColor: C.field, paddingHorizontal: 14, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <T v="tiny" color={C.muted}>{label}</T>
        <T v="bodyMd" color={value ? C.ink : C.faint}>{value ?? t('اختار')}</T>
      </View>
      <ChevronDown size={18} color={C.muted} style={{ transform: [{ rotate: open === which ? '180deg' : '0deg' }] }} />
    </Tap>
  );

  return (
    <View style={{ gap: 8 }}>
      {box(t('الكلية'), nm(col), 'college')}
      {open === 'college' && <List />}
      {box(t('التخصص'), nm(major), 'major', !col)}
      {open === 'major' && <List />}
    </View>
  );

  function List() {
    return (
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
        {list.length > 8 && (
          <Row gap={8} style={{ paddingHorizontal: 12, minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Search size={16} color={C.muted} />
            <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('دوّر')} placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
          </Row>
        )}
        <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {list.slice(0, 60).map((x) => {
            const on = open === 'college' ? x.id === collegeId : x.id === majorId;
            return (
              <Tap key={x.id} haptic={false} scale={0.99} onPress={() => {
                if (open === 'college') { onChange(x.id, x.id === collegeId ? majorId ?? null : null); setOpen('major'); }
                else { onChange(collegeId ?? null, x.id); setOpen(null); }
                setQ('');
              }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14 }}>
                <T v="body" style={{ flex: 1 }}>{x.name}</T>
                {on && <Check size={18} color={C.primary} />}
              </Tap>
            );
          })}
        </ScrollView>
      </View>
    );
  }
}
