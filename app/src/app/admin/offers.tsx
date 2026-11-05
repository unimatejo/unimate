import { useState } from 'react';
import { View } from 'react-native';

import { Act, AdminScreen, Item, Muted, Panel, Section, UniPicker, confirm, done, fmtDate, fmtNum, useLoad, useUnis } from '@/components/admin/kit';
import { Field, T, Toggle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Send = { id: string; title: string; university_id: string | null; in_app: number; emailed: number; created_at: string };

/** Offers: in-app to students who keep "offers" on, and by email to those who opted in. */
export default function Offers() {
  const unis = useUnis();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [uni, setUni] = useState('');
  const [email, setEmail] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const hist = useLoad<Send[]>(() => supabase.from('offer_sends').select('id, title, university_id, in_app, emailed, created_at').order('created_at', { ascending: false }).limit(30), [tick]);
  const badLink = link.trim() !== '' && !/^https:\/\/\S+$/.test(link.trim());

  async function send() {
    const who = uni ? unis.find((u) => u.id === uni)?.name_ar ?? '' : t('كل الجامعات');
    if (!(await confirm(t('تبعت العرض؟'), t('رح يوصل العرض لطلاب {0}{1}.', [who, email ? t('، وعلى الإيميل للي مفعّلين العروض على الإيميل') : '']), t('ابعت')))) return;
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc('admin_send_offer', { title: title.trim(), body: body.trim() || null, uni: uni || null, link: link.trim() || null });
      if (error) { setMsg(error.message); return; }
      const r = data as { id: string; in_app: number; email_reach: number };
      let line = t('وصل جوا التطبيق لـ {0} طالب ✓', [fmtNum(r.in_app)]);
      if (email && r.email_reach > 0) {
        const { data: e, error: ee } = await supabase.functions.invoke('send-offer-email', { body: { send_id: r.id } });
        if (ee) {
          const code = await (ee as { context?: Response }).context?.json?.().catch(() => null);
          line += code?.error === 'smtp_not_configured' ? t('. الإيميل لسا مش مفعّل (SMTP_PASS).') : t('. الإيميل ما انبعت: {0}', [ee.message]);
        } else line += t('، وعلى الإيميل لـ {0} من {1}', [fmtNum((e as { sent: number }).sent), fmtNum((e as { total: number }).total)]);
      } else if (email) line += t('. ما في حدا مفعّل العروض على الإيميل لهلأ.');
      done(); setMsg(line); setTitle(''); setBody(''); setLink(''); setTick((x) => x + 1);
    } finally { setBusy(false); }
  }

  return (
    <AdminScreen ownerOnly title={t('العروض')} subtitle={t('جوا التطبيق للي مفعّلين العروض، وعلى الإيميل للي وافقوا بس')}>
      <Panel>
        <UniPicker value={uni} onChange={setUni} label={t('لمين')} />
        <Field label={t('العنوان')} value={title} onChangeText={setTitle} maxLength={80} placeholder={t('خصم 20% لطلاب الأردنية')} />
        <Field label={t('التفاصيل')} value={body} onChangeText={setBody} maxLength={600} multiline style={{ minHeight: 90, paddingTop: 14 }} />
        <Field label={t('رابط العرض (اختياري)')} value={link} onChangeText={setLink} placeholder="https://" autoCapitalize="none" style={{ writingDirection: 'ltr', textAlign: 'left' }} />
        {badLink && <T v="small" color={C.red}>{t('الرابط لازم يبدأ بـ https://')}</T>}
        <Toggle value={email} onChange={setEmail} label={t('كمان على الإيميل')} />
        <Act label={busy ? t('عم يبعت…') : t('ابعت العرض')} kind="primary" onPress={send} disabled={title.trim().length < 3 || badLink} loading={busy} />
        {msg && <T v="small">{msg}</T>}
      </Panel>
      <Section title={t('آخر العروض')} />
      <View style={{ gap: 8 }}>
        {(hist.data ?? []).map((s) => (
          <Item key={s.id} title={s.title} sub={`${s.university_id ? unis.find((u) => u.id === s.university_id)?.name_ar ?? '' : t('الكل')} · ${t('تطبيق {0} · إيميل {1}', [fmtNum(s.in_app), fmtNum(s.emailed)])} · ${fmtDate(s.created_at)}`} />
        ))}
        {!hist.loading && (hist.data ?? []).length === 0 && <Muted>{t('ما في عروض لهلأ.')}</Muted>}
      </View>
    </AdminScreen>
  );
}
