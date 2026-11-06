import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react-native';
import { Alert, View } from 'react-native';

import { Avatar, Field, Row, T } from '@/components/ui';
import { ChatViewer } from './ChatViewer';
import { TITLE_ORDER, TitleBadge, titleLabel } from '@/components/profile/TitleBadge';
import { Act, Actions, Item, Muted, Panel, Pill, Section, Status, audit, confirm, done, fmtDate, fmtNum, promptText, useAdminRole, useLoad } from './kit';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

export type UserRow = { id: string; full_name: string; username: string | null; avatar_url: string | null; status: string; university: string | null; major: string | null; email: string | null; student_number: string | null; created_at: string; post_count: number; follower_count: number; is_admin: boolean };
type Conv = { id: string; kind: string; title: string | null; context_label: string | null; last_message_at: string; members: { id: string; name: string; state: string }[]; message_count: number };

/** One user in the admin panel: profile, status, blue check, title, chats (owner) and actions. */
export function UserDetail({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const { data: rows, reload } = useLoad<UserRow[]>(() => supabase.rpc('admin_find_users', { q: id, lim: 1 }), [id]);
  const u = rows?.[0];
  // titles and someone's chat list are for the owner; moderators see reported chats from the reports screen
  const owner = useAdminRole() === 'owner';
  const { data: convs } = useLoad<Conv[]>(() => owner ? supabase.rpc('admin_user_conversations', { target: id }) as never : Promise.resolve({ data: [], error: null }), [id, owner]);
  const { data: posts } = useLoad<{ id: string; body: string; category: string; created_at: string; is_hidden: boolean }[]>(
    () => supabase.from('posts').select('id, body, category, created_at, is_hidden').eq('author_id', id).order('created_at', { ascending: false }).limit(20), [id]);
  const [open, setOpen] = useState<Conv | null>(null);
  const [edit, setEdit] = useState<{ full_name: string; bio: string } | null>(null);

  useEffect(() => { setOpen(null); setEdit(null); }, [id]);
  const { data: acad, reload: reloadAcad } = useLoad<{ academic_title: string | null; title_verified: boolean; account_type: string; is_verified: boolean; username: string | null; lapsed_blue: boolean; lapsed_title: boolean; position_title: string | null }>(
    () => supabase.from('profiles').select('academic_title, title_verified, account_type, is_verified, username, lapsed_blue, lapsed_title, position_title').eq('id', id).single(), [id]);
  const [uname, setUname] = useState<string | null>(null);
  const [pos, setPos] = useState<string | null>(null);
  const [pickTitle, setPickTitle] = useState(false);
  // Instagram / Snapchat on the profile (icons + bio): admins can remove them, and stop new ones
  const { data: soc, reload: reloadSoc } = useLoad<{ instagram: string | null; snapchat: string | null; blocked: boolean }>(
    () => supabase.rpc('admin_socials_state', { p_user: id }), [id]);
  const [socBusy, setSocBusy] = useState(false);
  async function clearSocials() {
    const ok = await confirm(t('تشيل حسابات التواصل؟'),
      t('بتنشال حسابات إنستغرام وسناب من البروفايل ومن النبذة. إذا رجع دخل على حسابه بيقدر يضيفها عادي.'),
      t('شيلها'));
    if (!ok) return;
    setSocBusy(true);
    const { data, error } = await supabase.rpc('admin_clear_socials', { p_user: id });
    setSocBusy(false);
    if (error) { Alert.alert(t('ما زبط'), error.message); return; }
    done(); reloadSoc(); reload(); onChanged?.();
    const d = data as { bio_changed: boolean } | null;
    Alert.alert(t('انشالت ✓'), d?.bio_changed ? t('وكمان انشالت الحسابات من النبذة.') : t('النبذة ما كان فيها حسابات.'));
  }
  // bad words in group chats: strikes and the current mute
  const { data: strikes, reload: reloadStrikes } = useLoad<{ count: number; until: string | null; level: number | null; recent: { word: string; at: string }[] }>(
    () => supabase.rpc('admin_chat_strikes', { target: id }), [id]);
  async function unmute(reset: boolean) {
    const ok = await confirm(reset ? t('تصفّر مخالفاته؟') : t('تفك الكتم؟'), reset ? t('بيرجع يبلّش من أول درجة (10 دقائق).') : t('بيقدر يكتب بالجروبات هلأ، والمخالفات بتضل محسوبة.'), reset ? t('صفّر') : t('فك الكتم'));
    if (!ok) return;
    await supabase.rpc('admin_unmute', { target: id, p_reset: reset });
    done(); reloadStrikes();
  }
  async function setTitle(k: string | null) {
    const ok = await confirm(k ? t('توثيق كـ {0}؟', [titleLabel(k)]) : t('تشيل اللقب؟'),
      k ? t('بيظهر اللقب جنب اسم {0} للكل.', [u?.full_name ?? '']) : t('بيرجع حساب عادي بدون لقب، وبتنشال العلامة الزرقاء إذا إجت من اللقب.'), k ? t('وثّق') : t('شيله'));
    if (!ok) return;
    await supabase.rpc('admin_set_title', { p_user: id, p_title: k, p_type: k ? null : 'student' });
    done(); setPickTitle(false); reloadAcad(); onChanged?.();
  }

  /** the full official title shown on the profile ("عميد شؤون الطلبة"); empty = the short one */
  async function savePosition(next: string) {
    const { error } = await supabase.rpc('admin_set_position', { p_user: id, p_position: next.trim() || null });
    if (error) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
    done(); setPos(null); reloadAcad(); onChanged?.();
  }

  /** the owner sets anyone's @username; empty = a plain numbered one (user12345678) */
  async function setUsername(next: string | null) {
    const ok = await confirm(next ? t('تغيّر اليوزر لـ @{0}؟', [next]) : t('تشيل اليوزر؟'), next ? t('بيتغيّر رابط حسابه كمان.') : t('بيصير اليوزر رقم، مثل user12345678.'), next ? t('غيّر') : t('شيله'));
    if (!ok) return;
    const { error } = await supabase.rpc('admin_set_username', { p_user: id, p_username: next });
    if (error) { Alert.alert(t('ما زبط'), /taken/.test(error.message) ? t('هاليوزر مأخوذ.') : /bad_username/.test(error.message) ? t('اليوزر حروف إنجليزية صغيرة وأرقام و . و _ بس (3 لـ 24).') : t('جرّب كمان مرة.')); return; }
    done(); setUname(null); reloadAcad(); onChanged?.();
  }

  // the blue check is for important people only (presidents, deans, people the owner picks)
  async function setBlueCheck(on: boolean) {
    const ok = await confirm(on ? t('تعطي {0} العلامة الزرقاء؟', [u?.full_name ?? '']) : t('تشيل العلامة الزرقاء؟'),
      on ? t('العلامة الزرقاء للشخصيات المهمة بس: رئيس الجامعة، العمداء، ومن تختاره.') : t('بيرجع الحساب بدون علامة.'), on ? t('أعطيه') : t('شيلها'));
    if (!ok) return;
    const { error } = await supabase.rpc('admin_set_blue_check', { p_user: id, p_on: on });
    if (error) { Alert.alert(t('ما زبط'), error.message); return; }
    done(); reloadAcad(); onChanged?.();
  }

  async function setStatus(s: string) {
    const label = s === 'active' ? t('تفعيل الحساب') : s === 'suspended' ? t('إيقاف مؤقت') : t('حظر نهائي');
    if (s !== 'active' && !(await confirm(`${label}؟`, t('{0} ما رح يقدر يستخدم يونيميت لحد ما ترجّعه.', [u?.full_name ?? '']), label))) return;
    const reason = await promptText(s === 'active' ? t('سبب إعادة التفعيل؟') : t('سبب الإيقاف؟ (بينحفظ بالسجل)'));
    if (reason === null) return;
    await supabase.rpc('admin_set_status', { target: id, new_status: s, reason });
    done(); reload(); onChanged?.();
  }
  async function saveEdit() {
    if (!edit) return;
    await supabase.from('profiles').update({ full_name: edit.full_name, bio: edit.bio }).eq('id', id);
    await audit('edit_profile', 'user', id, edit);
    done(); setEdit(null); reload(); onChanged?.();
  }
  async function removeAvatar() {
    if (!(await confirm(t('تشيل صورة البروفايل؟'), t('الصورة بتنشال عند الكل.'), t('شيلها')))) return;
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', id);
    await audit('remove_avatar', 'user', id); reload();
  }

  if (!u) return <Muted>{t('بيحمّل…')}</Muted>;
  return (
    <View style={{ gap: 12 }}>
      <Row gap={12}>
        <Avatar id={u.id} name={u.full_name} url={u.avatar_url} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h2">{u.full_name}</T>
          <Muted>{u.username ? `@${u.username} · ` : ''}{u.university ?? t('بدون جامعة')}{u.major ? ` · ${u.major}` : ''}</Muted>
          <Row gap={6}><Status s={u.status} />{u.is_admin && <Pill label={t('مشرف')} tone="violet" />}</Row>
        </View>
      </Row>
      <Panel>
        <T v="small" selectable>{t('الإيميل')}: {u.email ? `\u2066${u.email}\u2069` : '—'}</T>
        <T v="small">{t('الرقم الجامعي')}: {u.student_number ?? '—'}</T>
        <T v="small">{t('سجّل: {0} · {1} منشور · {2} متابِع', [fmtDate(u.created_at), fmtNum(u.post_count), fmtNum(u.follower_count)])}</T>
        <T v="tiny" color={C.faint} selectable>{u.id}</T>
      </Panel>
      <Actions>
        {u.status !== 'active' && <Act label={t('فعّل الحساب')} kind="green" onPress={() => setStatus('active')} />}
        {u.status !== 'suspended' && <Act label={t('إيقاف مؤقت')} onPress={() => setStatus('suspended')} />}
        {u.status !== 'banned' && <Act label={t('حظر نهائي')} kind="danger" onPress={() => setStatus('banned')} />}
        <Act label={t('تعديل')} onPress={async () => {
          const { data: p } = await supabase.from('profiles').select('bio').eq('id', id).single();
          setEdit({ full_name: u.full_name, bio: p?.bio ?? '' });
        }} />
        {u.avatar_url && <Act label={t('شيل الصورة')} onPress={removeAvatar} />}
      </Actions>
      <Section title={t('حسابات التواصل')} />
      <Panel>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Pill label={soc?.instagram ? `Instagram: \u2066@${soc.instagram}\u2069` : t('ما في إنستغرام')} tone={soc?.instagram ? 'violet' : ''} />
          <Pill label={soc?.snapchat ? `Snapchat: \u2066@${soc.snapchat}\u2069` : t('ما في سناب')} tone={soc?.snapchat ? 'orange' : ''} />
        </Row>
        <Muted>{t('للي ما بيقدر يدخل على حسابه: بتنشال من البروفايل ومن النبذة (روابط، @يوزر، «انستا: …»)، وبيقدر يرجّعها لما يدخل.')}</Muted>
        <Actions>
          <Act label={t('شيل الحسابات')} loading={socBusy} onPress={clearSocials} />
        </Actions>
      </Panel>
      <Section title={t('مخالفات الجروبات')} />
      <Panel>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Pill label={t('{0} مخالفة', [fmtNum(strikes?.count ?? 0)])} tone={(strikes?.count ?? 0) > 0 ? 'orange' : ''} />
          {strikes?.until ? <Pill label={t('مكتوم لحد {0}', [fmtDate(strikes.until)])} tone="red" /> : <Pill label={t('مش مكتوم')} tone="green" />}
        </Row>
        {(strikes?.recent ?? []).map((r, i) => <Muted key={i}>{`${fmtDate(r.at)} · ${r.word}`}</Muted>)}
        {(strikes?.count ?? 0) > 0 && (
          <Actions>
            {strikes?.until ? <Act label={t('فك الكتم')} kind="primary" onPress={() => unmute(false)} /> : null}
            <Act label={t('صفّر المخالفات')} onPress={() => unmute(true)} />
          </Actions>
        )}
      </Panel>
      {owner && <Section title={t('اليوزر')} />}
      {owner && <Panel>
        <Muted>{acad?.username ? `@${acad.username}` : t('بدون يوزر')}</Muted>
        {uname !== null && <Field label={t('اليوزر الجديد')} value={uname} autoCapitalize="none" autoCorrect={false} maxLength={24} onChangeText={(v) => setUname(v.toLowerCase().replace(/[^a-z0-9._]/g, ''))} />}
        <Actions>
          {uname === null
            ? <Act label={t('غيّر اليوزر')} onPress={() => setUname(acad?.username ?? '')} />
            : <Act label={t('احفظ')} kind="primary" onPress={() => uname.length >= 3 && setUsername(uname)} />}
          {uname !== null && <Act label={t('إلغاء')} onPress={() => setUname(null)} />}
          <Act label={t('شيل اليوزر (رقم)')} kind="danger" onPress={() => setUsername(null)} />
        </Actions>
      </Panel>}
      {owner && <Section title={t('العلامة الزرقاء')} />}
      {owner && <Panel>
        <Row gap={8}>
          {acad?.is_verified ? <BadgeCheck size={20} color={C.white} fill={C.primary} /> : null}
          <Muted>{acad?.is_verified ? t('الحساب موثّق بالعلامة الزرقاء') : acad?.lapsed_blue ? t('العلامة موقوفة: ما دخل بإيميله الجامعي من 6 شهور، وبترجع لحالها لما يدخل') : t('بدون علامة زرقاء')}</Muted>
        </Row>
        <Actions>
          {acad?.is_verified
            ? <Act label={t('شيل العلامة')} kind="danger" onPress={() => setBlueCheck(false)} />
            : <Act label={t('أعطيه العلامة الزرقاء')} kind="primary" onPress={() => setBlueCheck(true)} />}
        </Actions>
      </Panel>}
      {owner && <Section title={t('اللقب الأكاديمي')} />}
      {owner && <Panel>
        <Row gap={8}>
          {acad?.title_verified && acad.academic_title ? <TitleBadge title={acad.academic_title} verified size="md" label={acad.position_title} /> : <Muted>{acad?.lapsed_title && acad.academic_title ? t('اللقب موقوف ({0}): ما دخل بإيميله الجامعي من 6 شهور', [titleLabel(acad.academic_title)]) : acad?.account_type === 'faculty' ? t('إيميله من الجامعة، ممكن يكون دكتور أو موظف') : t('بدون لقب')}</Muted>}
        </Row>
        <Actions>
          <Act label={pickTitle ? t('إلغاء') : t('غيّر اللقب')} onPress={() => setPickTitle(!pickTitle)} />
          {acad?.academic_title && <Act label={t('شيل اللقب (إلغاء)')} kind="danger" onPress={() => setTitle(null)} />}
          {acad?.academic_title && pos === null && <Act label={t('المسمّى الكامل')} onPress={() => setPos(acad.position_title ?? '')} />}
        </Actions>
        {pos !== null && (
          <>
            <Field label={t('المسمّى الكامل (مثلاً: عميد شؤون الطلبة)')} value={pos} maxLength={80} onChangeText={setPos} />
            <Actions>
              <Act label={t('احفظ')} kind="primary" onPress={() => savePosition(pos)} />
              <Act label={t('إلغاء')} onPress={() => setPos(null)} />
            </Actions>
          </>
        )}
        {pickTitle && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TITLE_ORDER.map((k) => <Act key={k} label={titleLabel(k)} kind={acad?.academic_title === k ? 'primary' : 'soft'} onPress={() => setTitle(k)} />)}
          </View>
        )}
      </Panel>}
      {edit && (
        <Panel>
          <Field label={t('الاسم')} value={edit.full_name} onChangeText={(v) => setEdit({ ...edit, full_name: v })} />
          <Field label={t('النبذة')} value={edit.bio} onChangeText={(v) => setEdit({ ...edit, bio: v })} multiline />
          <Actions><Act label={t('احفظ')} kind="primary" onPress={saveEdit} /><Act label={t('إلغاء')} onPress={() => setEdit(null)} /></Actions>
        </Panel>
      )}

      {owner && <>
      <Section title={t('المحادثات ({0})', [String(convs?.length ?? 0)])} right={open ? <Act label={t('رجوع')} onPress={() => setOpen(null)} /> : undefined} />
      {open ? (
        <Panel>
          <T v="bold">{open.title ?? open.members.map((m) => m.name).join('، ')}</T>
          <ChatViewer conversationId={open.id} members={open.members} rightId={id} />
        </Panel>
      ) : (
        <View style={{ gap: 8 }}>
          {(convs ?? []).map((c) => (
            <Item key={c.id} onPress={() => setOpen(c)}
              title={c.title ?? c.members.filter((m) => m.id !== id).map((m) => m.name).join('، ')}
              sub={`${c.kind === 'direct' ? t('خاص') : c.kind === 'group' ? t('مجموعة') : t('مجتمع')} · ${t('{0} رسالة', [fmtNum(c.message_count)])} · ${fmtDate(c.last_message_at)}${c.context_label ? ` · ${c.context_label}` : ''}`} />
          ))}
          {convs?.length === 0 && <Muted>{t('ما في محادثات.')}</Muted>}
        </View>
      )}
      </>}

      <Section title={t('آخر المنشورات')} />
      <View style={{ gap: 8 }}>
        {(posts ?? []).map((p) => <Item key={p.id} title={p.body.slice(0, 120)} sub={`${p.category} · ${fmtDate(p.created_at)}${p.is_hidden ? ` · ${t('مخفي')}` : ''}`} dim={p.is_hidden} />)}
        {posts?.length === 0 && <Muted>{t('ما في منشورات.')}</Muted>}
      </View>
    </View>
  );
}
