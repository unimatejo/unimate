import { useState } from 'react';

import { Act, AdminScreen, Muted, Panel, UniPicker, confirm, done, useUnis } from '@/components/admin/kit';
import { Field, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Admin › send a notification to everyone, one university or one college (owner only). */
export default function Notify() {
  const unis = useUnis();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [uni, setUni] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const who = uni ? unis.find((u) => u.id === uni)?.name_ar ?? '' : t('كل الطلاب بكل الجامعات');
    if (!(await confirm(t('تبعت الإشعار؟'), t('رح يوصل الإشعار لـ {0}.', [who]), t('ابعت')))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_notify', { title: title.trim(), body: body.trim() || null, target: null, uni: uni || null });
    setBusy(false);
    setMsg(error ? error.message : t('انبعت لـ {0} طالب ✓', [String(data)]));
    if (!error) { done(); setTitle(''); setBody(''); }
  }

  return (
    <AdminScreen ownerOnly title={t('إرسال إشعار')} subtitle={t('بيطلع بصفحة الإشعارات، وبيوصل كإشعار للي مفعّلين')}>
      <Panel>
        <UniPicker value={uni} onChange={setUni} label={t('لمين')} />
        <Field label={t('العنوان')} value={title} onChangeText={setTitle} maxLength={80} />
        <Field label={t('النص')} value={body} onChangeText={setBody} maxLength={300} multiline style={{ minHeight: 100, paddingTop: 14 }} />
        <Act label={t('ابعت')} kind="primary" onPress={send} disabled={title.trim().length < 3} loading={busy} />
        {msg && <T v="small" color={msg.includes('✓') ? C.greenInk : C.red}>{msg}</T>}
        <Muted>{t('الإشعار ما بينسحب بعد ما ينبعت.')}</Muted>
      </Panel>
    </AdminScreen>
  );
}
