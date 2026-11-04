import { Check, ChevronDown, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, TextInput, View } from 'react-native';

import { Row, T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { LOCALE, nm, t, ta } from '@/lib/i18n';
import { normalize } from '@/lib/util';

type College = { id: string; name_ar: string; majors: { id: string; name_ar: string; degree: string }[] };

/** Pick a college, then a major inside it, from the student's own university. */
export function MajorPicker({ universityId, collegeId, majorId, onChange }: {
  universityId?: string | null; collegeId?: string | null; majorId?: string | null; onChange: (college: string | null, major: string | null) => void;
}) {
  const [cols, setCols] = useState<College[]>([]);
  const [open, setOpen] = useState<'college' | 'major' | null>(null);
  const [q, setQ] = useState('');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [adding, setAdding] = useState(false);
  const [newMajor, setNewMajor] = useState('');
  const [saving, setSaving] = useState(false);

  // "my major isn't here": add it for everyone in the college (an admin checks it later)
  async function addMajor() {
    if (!collegeId || saving) return;
    const name = newMajor.trim();
    if (name.length < 3) { Alert.alert(t('اكتب اسم التخصص كامل')); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('add_my_major', { col: collegeId, major_name: name });
    setSaving(false);
    if (error || !data) { Alert.alert(t('ما انضاف التخصص'), String(error?.message).includes('too_many') ? t('ضفت تخصصات كثير اليوم، جرّب بكرة.') : t('جرّب كمان مرة.')); return; }
    setCols((cur) => cur.map((c) => (c.id === collegeId && !c.majors.some((m) => m.id === data) ? { ...c, majors: [...c.majors, { id: data as string, name_ar: name, degree: 'bachelor' }] } : c)));
    onChange(collegeId, data as string);
    setAdding(false); setNewMajor(''); setOpen(null);
  }

  const load = () => {
    if (!universityId) return;
    setState('loading');
    supabase.from('colleges').select('id, name_ar, name_en, majors(id, name_ar, name_en, degree)').eq('university_id', universityId).order('name_ar')
      .then(({ data, error }) => { if (error) { setState('error'); return; } setCols((data ?? []) as College[]); setState('ok'); }, () => setState('error'));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [universityId]);

  const col = cols.find((c) => c.id === collegeId);
  const major = col?.majors.find((m) => m.id === majorId);
  const all = open === 'college' ? cols.length : (col?.majors.length ?? 0);
  const list = useMemo(() => {
    const s = normalize(q);
    const items = open === 'college' ? cols.map((c) => ({ id: c.id, name: nm(c) })) : (col?.majors ?? []).map((m) => ({ id: m.id, name: nm(m) + (m.degree === 'diploma' ? t(' (دبلوم)') : '') }));
    return (s ? items.filter((x) => normalize(x.name).includes(s)) : items).sort((a, b) => a.name.localeCompare(b.name, LOCALE));
  }, [open, cols, col, q]);

  if (!universityId) return null;
  if (state === 'loading' && cols.length === 0) return <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />;
  if (state === 'error' && cols.length === 0) return (
    <Tap onPress={load} style={{ minHeight: 48, justifyContent: 'center' }} accessibilityRole="button">
      <T v="small" color={C.red}>{t('ما قدرنا نحمّل الكليات. اكبس لتجرب كمان مرة.')}</T>
    </Tap>
  );
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
      {open === 'college' && renderList()}
      {box(t('التخصص'), nm(major), 'major', !col)}
      {open === 'major' && renderList()}
    </View>
  );

  // a plain function (not a component) so the search box keeps focus while typing
  function renderList() {
    return (
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
        {all > 8 && (
          <Row gap={8} style={{ paddingHorizontal: 12, minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Search size={16} color={C.muted} />
            <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('دوّر')} placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
          </Row>
        )}
        <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {list.length === 0 && <T v="small" color={C.muted} style={{ padding: 14 }}>{open === 'major' && all === 0 ? t('ما في تخصصات مضافة لهالكلية لهلأ.') : t('ما لقينا إشي بهالاسم')}</T>}
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
        {open === 'major' && (adding ? (
          <Row gap={8} style={{ padding: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={newMajor} onChangeText={setNewMajor} autoFocus placeholder={t('اسم تخصصك')} placeholderTextColor={C.faint} maxLength={90}
              style={{ flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: C.field, paddingHorizontal: 12, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
            <Tap onPress={addMajor} disabled={saving} style={{ minHeight: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
              {saving ? <ActivityIndicator color={C.onPrimary} /> : <T v="bold" color={C.onPrimary} style={{ fontSize: 14 }}>{t('ضيف')}</T>}
            </Tap>
          </Row>
        ) : (
          <Tap haptic={false} onPress={() => { setAdding(true); setNewMajor(q); }} style={{ minHeight: 46, paddingHorizontal: 14, justifyContent: 'center', borderTopWidth: 1, borderTopColor: C.line }}>
            <T v="small" color={C.primary}>{t('مش لاقي تخصصك؟ ضيفه')}</T>
          </Tap>
        ))}
      </View>
    );
  }
}
