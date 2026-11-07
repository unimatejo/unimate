import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Act, AdminScreen, Muted, Panel, Section, UniPicker, confirm, done, useLoad, useUnis } from '@/components/admin/kit';
import { TwoLang } from '@/components/admin/TwoLang';
import { Chip, Field, T } from '@/components/ui';
import { nm, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

type Named = { id: string; name_ar: string; name_en: string | null };
type College = Named & { majors: Named[] };

/** what the notification is about: a ready title start the owner finishes */
const KINDS: [string, string][] = [
  ['📢', t('إعلان')], ['🎉', t('فعالية')], ['🎓', t('حفل تخرج')], ['📝', t('امتحانات')], ['⚠️', t('تنبيه مهم')], ['🎁', t('عرض')],
];
/** pages a notification can open */
const PAGES: [string, string][] = [
  ['/announcements', t('الإعلانات')], ['/exams', t('امتحاناتي')], ['/(tabs)/schedule', t('الجدول')], ['/rides', t('التوصيلات')],
  ['/map', t('الخريطة')], ['/honor', t('المتفوقون')], ['/swap', t('تبديل الشعب')],
];
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => thisYear - i);

/**
 * Admin › send a notification (owner only). It goes to everyone, one university, one college, one major, or one
 * intake year (a graduation, a college event, a notice for one major), with its English for students using English,
 * and can open a page of the app or a site when tapped.
 */
export default function Notify() {
  const unis = useUnis();
  const [uni, setUni] = useState('');
  const [college, setCollege] = useState('');
  const [major, setMajor] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [body, setBody] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const colleges = useLoad<College[]>(() => uni
    ? supabase.from('colleges').select('id, name_ar, name_en, majors(id, name_ar, name_en)').eq('university_id', uni).order('name_ar') as never
    : Promise.resolve({ data: [], error: null }), [uni]);
  const col = colleges.data?.find((c) => c.id === college);

  const who = [
    major ? nm(col?.majors.find((m) => m.id === major)) : college ? nm(col) : uni ? nm(unis.find((u) => u.id === uni)) : t('كل الطلاب في كل الجامعات'),
    year ? t('دفعة {0}', [year]) : null,
  ].filter(Boolean).join(' · ');

  async function send() {
    const l = link.trim();
    if (l && !(/^\/[^\s]*$/.test(l) && !l.startsWith('/admin')) && !/^https:\/\/\S+$/.test(l)) { setMsg(t('اختر صفحة من القائمة أو اكتب رابطًا يبدأ بـ https://')); return; }
    if (!(await confirm(t('إرسال الإشعار؟'), t('سيصل الإشعار إلى {0}.', [who]), t('أرسل')))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_notify', {
      title: title.trim(), body: body.trim() || null, uni: uni || null, college: college || null, major: major || null, entry_year: year,
      link: l || null, title_en: titleEn.trim() || null, body_en: bodyEn.trim() || null,
    });
    setBusy(false);
    setMsg(error ? error.message : t('تم الإرسال إلى {0} طالب ✓', [String(data)]));
    if (!error) { done(); setTitle(''); setTitleEn(''); setBody(''); setBodyEn(''); setLink(''); }
  }

  return (
    <AdminScreen ownerOnly title={t('إرسال إشعار')} subtitle={t('يظهر في صفحة الإشعارات، ويصل كإشعار لمن فعّلوها')}>
      <Section title={t('لمن')} />
      <Panel>
        <UniPicker value={uni} onChange={(v) => { setUni(v); setCollege(''); setMajor(''); }} label={t('الجامعة')} />
        {uni ? (
          <>
            <T v="small" color={C.muted}>{t('الكلية (اختياري)')}</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label={t('كل الكليات')} active={!college} onPress={() => { setCollege(''); setMajor(''); }} />
              {(colleges.data ?? []).map((c) => <Chip key={c.id} label={nm(c) ?? ''} active={college === c.id} onPress={() => { setCollege(c.id); setMajor(''); }} />)}
            </ScrollView>
          </>
        ) : null}
        {col?.majors.length ? (
          <>
            <T v="small" color={C.muted}>{t('التخصص (اختياري)')}</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label={t('كل التخصصات')} active={!major} onPress={() => setMajor('')} />
              {col.majors.map((m) => <Chip key={m.id} label={nm(m) ?? ''} active={major === m.id} onPress={() => setMajor(m.id)} />)}
            </ScrollView>
          </>
        ) : null}
        <T v="small" color={C.muted}>{t('الدفعة (سنة الالتحاق، اختياري)')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('كل الدفعات')} active={year === null} onPress={() => setYear(null)} />
          {YEARS.map((y) => <Chip key={y} label={String(y)} active={year === y} onPress={() => setYear(y)} />)}
        </View>
        <T v="bodyMd">{t('سيصل إلى: {0}', [who])}</T>
      </Panel>

      <Section title={t('الإشعار')} />
      <Panel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map(([e, l]) => <Chip key={l} label={`${e} ${l}`} onPress={() => setTitle(`${e} ${title.replace(/^\p{Extended_Pictographic}️?\s*/u, '')}`)} />)}
        </View>
        <TwoLang label={t('العنوان')} ar={title} en={titleEn} onAr={setTitle} onEn={setTitleEn} max={80} />
        <TwoLang label={t('النص')} ar={body} en={bodyEn} onAr={setBody} onEn={setBodyEn} max={300} multiline />
        <T v="small" color={C.muted}>{t('ما يُفتح عند الضغط عليه (اختياري)')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('صفحة الإشعارات')} active={!link} onPress={() => setLink('')} />
          {PAGES.map(([p, l]) => <Chip key={p} label={l} active={link === p} onPress={() => setLink(p)} />)}
        </View>
        <Field label={t('أو رابط https')} value={link.startsWith('/') ? '' : link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
        <Act label={t('أرسل')} kind="primary" onPress={send} disabled={title.trim().length < 3} loading={busy} />
        {msg && <T v="small" color={msg.includes('✓') ? C.greenInk : C.red}>{msg}</T>}
        <Muted>{t('لا يمكن سحب الإشعار بعد إرساله. إن تُركت الإنجليزية فارغة يرى مستخدمو الإنجليزية النص العربي.')}</Muted>
      </Panel>
    </AdminScreen>
  );
}
