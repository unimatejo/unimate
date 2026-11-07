import { router } from 'expo-router';
import { BadgeCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Field, Row, T } from '@/components/ui';
import { MajorPicker } from '@/components/profile/MajorPicker';
import { ChatViewer } from './ChatViewer';
import { TITLE_ORDER, TitleBadge, titleLabel } from '@/components/profile/TitleBadge';
import { Act, Actions, Item, Muted, Panel, Pill, Section, Status, audit, confirm, done, fmtDate, fmtNum, promptText, useAdminRole, useLoad } from './kit';
import { refreshFrames, useFrame, type FrameLevel } from '@/lib/frames';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { latinDigits } from '@/lib/util';
import { t } from '@/lib/i18n';

export type UserRow = { id: string; full_name: string; username: string | null; avatar_url: string | null; status: string; university: string | null; major: string | null; email: string | null; student_number: string | null; created_at: string; post_count: number; follower_count: number; is_admin: boolean };
const FRAME_LEVELS: [FrameLevel, string][] = [['gold', t('ذهبي')], ['silver', t('فضي')], ['bronze', t('برونزي')], ['blue', t('أزرق')]];
type Edit = { full_name: string; bio: string; university_id: string | null; college_id: string | null; major_id: string | null; entry_year: string; student_number: string; shown_followers: string; shown_following: string };
type Conv = { id: string; kind: string; title: string | null; context_label: string | null; last_message_at: string; members: { id: string; name: string; state: string }[]; message_count: number };

/** One user in the admin panel: profile, status, blue check, title, chats (owner) and actions. */
export function UserDetail({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const { data: rows, reload } = useLoad<UserRow[]>(() => supabase.rpc('admin_find_users', { q: id, lim: 1 }), [id]);
  const u = rows?.[0];
  // titles and someone's chat list are for the owner; moderators see reported chats from the reports screen
  const owner = useAdminRole() === 'owner';
  const frame = useFrame(id);
  const { data: convs } = useLoad<Conv[]>(() => owner ? supabase.rpc('admin_user_conversations', { target: id }) as never : Promise.resolve({ data: [], error: null }), [id, owner]);
  const { data: posts, reload: reloadPosts } = useLoad<{ id: string; body: string; category: string; created_at: string; is_hidden: boolean }[]>(
    () => supabase.from('posts').select('id, body, category, created_at, is_hidden').eq('author_id', id).order('created_at', { ascending: false }).limit(20), [id]);
  const [open, setOpen] = useState<Conv | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);

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

  // a special honor frame by hand (0109); the ones from official grades are worked out by themselves
  async function setFrame(level: FrameLevel | null) {
    const note = level ? await promptText(t('سبب الإطار'), t('بيبيّن تحت اسمه، مثلاً «بطل مسابقة البرمجة»'), '') : '';
    if (note === null) return;
    const { error } = await supabase.rpc('admin_set_frame', { p_user: id, p_level: level, p_note: note || null });
    if (error) { Alert.alert(t('ما زبط'), error.message); return; }
    done(); refreshFrames();
  }

  // the blue check is for important people only (presidents, deans, people the owner picks)
  async function setBlueCheck(on: boolean) {
    const ok = await confirm(on ? t('تعطي {0} العلامة الزرقاء؟', [u?.full_name ?? '']) : t('تشيل العلامة الزرقاء؟'),
      on ? t('العلامة الزرقاء للشخصيات المهمة بس: رئيس الجامعة، العمداء، ومن تختاره.') : t('بتنشال وما بترجع لحالها، حتى لو عنده لقب عميد أو رئيس. بترجع بس إذا إنت أعطيته إياها.'), on ? t('أعطيه') : t('شيلها'));
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
  async function openEdit() {
    const { data: p } = await supabase.from('profiles').select('full_name, bio, university_id, college_id, major_id, entry_year, shown_followers, shown_following').eq('id', id).single();
    if (!p) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
    setEdit({
      full_name: p.full_name ?? '', bio: p.bio ?? '', university_id: p.university_id, college_id: p.college_id, major_id: p.major_id,
      entry_year: p.entry_year ? String(p.entry_year) : '', student_number: u?.student_number ?? '',
      shown_followers: p.shown_followers != null ? String(p.shown_followers) : '', shown_following: p.shown_following != null ? String(p.shown_following) : '',
    });
  }
  /** one checked, logged change on the server (admin_update_profile, 0135); empty numbers clear what's shown */
  async function saveEdit() {
    if (!edit || saving) return;
    const num = (v: string) => (v.trim() === '' ? null : Number(latinDigits(v.trim())));
    const shownF = num(edit.shown_followers), shownG = num(edit.shown_following), year = num(edit.entry_year);
    if ([shownF, shownG, year].some((n) => n !== null && (!Number.isInteger(n) || n < 0))) { Alert.alert(t('الأرقام'), t('اكتب أرقام صحيحة بس.')); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_profile', { p_user: id, p_changes: {
      full_name: edit.full_name.trim(), bio: edit.bio, major_id: edit.major_id, college_id: edit.college_id,
      entry_year: year, student_number: latinDigits(edit.student_number.trim()), shown_followers: shownF, shown_following: shownG,
    } });
    setSaving(false);
    if (error) {
      Alert.alert(t('ما انحفظ'), /bad_name/.test(error.message) ? t('الاسم لازم يكون بين 2 و 60 حرف.')
        : /bad_student_number/.test(error.message) ? t('الرقم الجامعي أرقام وحروف إنجليزية بس.') : t('جرّب كمان مرة.'));
      return;
    }
    done(); setEdit(null); reload(); onChanged?.();
  }

  async function setPostHidden(postId: string, hide: boolean) {
    const { error } = await supabase.from('posts').update({ is_hidden: hide }).eq('id', postId);
    if (error) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
    await audit(hide ? 'hide_post' : 'unhide_post', 'post', postId, { author: id });
    done(); reloadPosts();
  }
  async function deletePost(postId: string) {
    if (!(await confirm(t('تحذف المنشور؟'), t('بينحذف عند الكل وما بيرجع.'), t('احذف')))) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
    await audit('delete_post', 'post', postId, { author: id });
    done(); reloadPosts(); onChanged?.();
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
        <Act label={edit ? t('إلغاء التعديل') : t('تعديل')} onPress={() => (edit ? setEdit(null) : openEdit())} />
        {u.avatar_url && <Act label={t('شيل الصورة')} onPress={removeAvatar} />}
      </Actions>
      {edit && (
        <Panel>
          <Field label={t('الاسم')} value={edit.full_name} maxLength={60} onChangeText={(v) => setEdit({ ...edit, full_name: v })} />
          <Field label={t('النبذة')} value={edit.bio} maxLength={300} onChangeText={(v) => setEdit({ ...edit, bio: v })} multiline />
          <Field label={t('الرقم الجامعي')} value={edit.student_number} maxLength={20} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => setEdit({ ...edit, student_number: v })} />
          <Field label={t('سنة الدخول')} value={edit.entry_year} maxLength={4} keyboardType="number-pad" onChangeText={(v) => setEdit({ ...edit, entry_year: v })} />
          <MajorPicker universityId={edit.university_id ?? undefined} collegeId={edit.college_id} majorId={edit.major_id} onChange={(c, m) => setEdit({ ...edit, college_id: c, major_id: m })} />
          <Section title={t('الأرقام اللي بتبيّن على البروفايل')} />
          <Muted>{t('بتبيّن فوق بالبروفايل بس. قائمة المتابعين لما حدا يفتحها بتضل الحقيقية. فاضي = الرقم الحقيقي ({0} متابِع).', [fmtNum(u.follower_count)])}</Muted>
          <Row gap={10}>
            <View style={{ flex: 1 }}><Field label={t('المتابِعين')} value={edit.shown_followers} keyboardType="number-pad" maxLength={9} onChangeText={(v) => setEdit({ ...edit, shown_followers: v })} /></View>
            <View style={{ flex: 1 }}><Field label={t('اللي بيتابعهم')} value={edit.shown_following} keyboardType="number-pad" maxLength={9} onChangeText={(v) => setEdit({ ...edit, shown_following: v })} /></View>
          </Row>
          <Actions><Act label={t('احفظ')} kind="primary" loading={saving} onPress={saveEdit} /><Act label={t('إلغاء')} onPress={() => setEdit(null)} /></Actions>
        </Panel>
      )}
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
          {acad?.is_verified ? <BadgeCheck size={20} color={C.white} fill={C.verified} /> : null}
          <Muted>{acad?.is_verified ? t('الحساب موثّق بالعلامة الزرقاء') : acad?.lapsed_blue ? t('العلامة موقوفة: ما دخل بإيميله الجامعي من 6 شهور، وبترجع لحالها لما يدخل') : t('بدون علامة زرقاء')}</Muted>
        </Row>
        <Actions>
          {acad?.is_verified
            ? <Act label={t('شيل العلامة')} kind="danger" onPress={() => setBlueCheck(false)} />
            : <Act label={t('أعطيه العلامة الزرقاء')} kind="primary" onPress={() => setBlueCheck(true)} />}
        </Actions>
      </Panel>}
      {owner && <Section title={t('إطار التكريم')} />}
      {owner && <Panel>
        <Muted>{frame ? t('لابس إطار: {0}', [frame.label]) : t('بدون إطار. الإطارات بتيجي لحالها من علامات الجامعة لأول 10، وهون بتعطي إطار خاص لمناسبة.')}</Muted>
        <Muted>{t('ما بيبيّن إلا إذا الطالب مشغّل «شارك بلوحة المتفوقين» وبدون اسم مستعار.')}</Muted>
        <Actions>
          {FRAME_LEVELS.map(([lv, label]) => <Act key={lv} label={label} onPress={() => setFrame(lv)} />)}
          <Act label={t('شيل الإطار الخاص')} kind="danger" onPress={() => setFrame(null)} />
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
        {(posts ?? []).map((p) => (
          <View key={p.id} style={{ gap: 6 }}>
            <Item title={p.body.slice(0, 120) || t('(بدون نص)')} sub={`${p.category} · ${fmtDate(p.created_at)}${p.is_hidden ? ` · ${t('مخفي')}` : ''}`} dim={p.is_hidden}
              onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} />
            <Actions>
              <Act label={p.is_hidden ? t('رجّعه') : t('خبّيه')} onPress={() => setPostHidden(p.id, !p.is_hidden)} />
              <Act label={t('احذف')} kind="danger" onPress={() => deletePost(p.id)} />
            </Actions>
          </View>
        ))}
        {posts?.length === 0 && <Muted>{t('ما في منشورات.')}</Muted>}
      </View>
    </View>
  );
}
