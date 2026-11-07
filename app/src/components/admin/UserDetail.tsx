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
  const { data: posts, reload: reloadPosts } = useLoad<{ id: string; body: string; category: string; created_at: string; is_hidden: boolean; like_count: number; shown_likes: number | null }[]>(
    () => supabase.from('posts').select('id, body, category, created_at, is_hidden, like_count, shown_likes').eq('author_id', id).order('created_at', { ascending: false }).limit(20), [id]);
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
    const ok = await confirm(t('إزالة حسابات التواصل؟'),
      t('ستُزال حسابات إنستغرام وسناب شات من الملف الشخصي ومن النبذة. إذا عاد وسجّل الدخول إلى حسابه يمكنه إضافتها مجدداً.'),
      t('إزالة'));
    if (!ok) return;
    setSocBusy(true);
    const { data, error } = await supabase.rpc('admin_clear_socials', { p_user: id });
    setSocBusy(false);
    if (error) { Alert.alert(t('تعذّر ذلك'), error.message); return; }
    done(); reloadSoc(); reload(); onChanged?.();
    const d = data as { bio_changed: boolean } | null;
    Alert.alert(t('تمت الإزالة ✓'), d?.bio_changed ? t('كما أُزيلت الحسابات من النبذة.') : t('لم تكن في النبذة أي حسابات.'));
  }
  // bad words in group chats: strikes and the current mute
  const { data: strikes, reload: reloadStrikes } = useLoad<{ count: number; until: string | null; level: number | null; recent: { word: string; at: string }[] }>(
    () => supabase.rpc('admin_chat_strikes', { target: id }), [id]);
  async function unmute(reset: boolean) {
    const ok = await confirm(reset ? t('تصفير مخالفاته؟') : t('إلغاء الكتم؟'), reset ? t('سيبدأ من جديد من الدرجة الأولى (10 دقائق).') : t('يمكنه الكتابة في المجموعات الآن، وتبقى المخالفات محسوبة.'), reset ? t('إعادة تعيين') : t('إلغاء الكتم'));
    if (!ok) return;
    await supabase.rpc('admin_unmute', { target: id, p_reset: reset });
    done(); reloadStrikes();
  }
  async function setTitle(k: string | null) {
    const ok = await confirm(k ? t('توثيق كـ {0}؟', [titleLabel(k)]) : t('إزالة اللقب؟'),
      k ? t('سيظهر اللقب بجانب اسم {0} للجميع.', [u?.full_name ?? '']) : t('سيعود حساباً عادياً بدون لقب، وستُزال العلامة الزرقاء إذا كانت من اللقب.'), k ? t('وثّق') : t('إزالة'));
    if (!ok) return;
    await supabase.rpc('admin_set_title', { p_user: id, p_title: k, p_type: k ? null : 'student' });
    done(); setPickTitle(false); reloadAcad(); onChanged?.();
  }

  /** the full official title shown on the profile ("عميد شؤون الطلبة"); empty = the short one */
  async function savePosition(next: string) {
    const { error } = await supabase.rpc('admin_set_position', { p_user: id, p_position: next.trim() || null });
    if (error) { Alert.alert(t('تعذّر ذلك'), t('حاول مرة أخرى.')); return; }
    done(); setPos(null); reloadAcad(); onChanged?.();
  }

  /** the owner sets anyone's @username; empty = a plain numbered one (user12345678) */
  async function setUsername(next: string | null) {
    const ok = await confirm(next ? t('تغيير اسم المستخدم إلى @{0}؟', [next]) : t('إزالة اسم المستخدم؟'), next ? t('سيتغيّر رابط حسابه أيضاً.') : t('سيصبح اسم المستخدم رقماً، مثل user12345678.'), next ? t('غيّر') : t('إزالة'));
    if (!ok) return;
    const { error } = await supabase.rpc('admin_set_username', { p_user: id, p_username: next });
    if (error) { Alert.alert(t('تعذّر ذلك'), /taken/.test(error.message) ? t('اسم المستخدم هذا محجوز.') : /bad_username/.test(error.message) ? t('اسم المستخدم أحرف إنجليزية صغيرة وأرقام و . و _ فقط (من 3 إلى 24).') : t('حاول مرة أخرى.')); return; }
    done(); setUname(null); reloadAcad(); onChanged?.();
  }

  // a special honor frame by hand (0109); the ones from official grades are worked out by themselves
  async function setFrame(level: FrameLevel | null) {
    const note = level ? await promptText(t('سبب الإطار'), t('يظهر تحت اسمه، مثلاً «بطل مسابقة البرمجة»'), '') : '';
    if (note === null) return;
    const { error } = await supabase.rpc('admin_set_frame', { p_user: id, p_level: level, p_note: note || null });
    if (error) { Alert.alert(t('تعذّر ذلك'), error.message); return; }
    done(); refreshFrames();
  }

  // the blue check is for important people only (presidents, deans, people the owner picks)
  async function setBlueCheck(on: boolean) {
    const ok = await confirm(on ? t('منح {0} العلامة الزرقاء؟', [u?.full_name ?? '']) : t('إزالة العلامة الزرقاء؟'),
      on ? t('العلامة الزرقاء للشخصيات المهمة فقط: رئيس الجامعة، والعمداء، ومن تختاره.') : t('ستُزال ولن تعود تلقائياً، حتى لو كان لديه لقب عميد أو رئيس. لن تعود إلا إذا منحته إياها أنت.'), on ? t('امنحه') : t('إزالة'));
    if (!ok) return;
    const { error } = await supabase.rpc('admin_set_blue_check', { p_user: id, p_on: on });
    if (error) { Alert.alert(t('تعذّر ذلك'), error.message); return; }
    done(); reloadAcad(); onChanged?.();
  }

  async function setStatus(s: string) {
    const label = s === 'active' ? t('تفعيل الحساب') : s === 'suspended' ? t('إيقاف مؤقت') : t('حظر نهائي');
    if (s !== 'active' && !(await confirm(`${label}؟`, t('لن يتمكن {0} من استخدام يونيميت حتى تعيد تفعيله.', [u?.full_name ?? '']), label))) return;
    const reason = await promptText(s === 'active' ? t('سبب إعادة التفعيل؟') : t('سبب الإيقاف؟ (يُحفظ في السجل)'));
    if (reason === null) return;
    await supabase.rpc('admin_set_status', { target: id, new_status: s, reason });
    done(); reload(); onChanged?.();
  }
  async function openEdit() {
    const { data: p } = await supabase.from('profiles').select('full_name, bio, university_id, college_id, major_id, entry_year, shown_followers, shown_following').eq('id', id).single();
    if (!p) { Alert.alert(t('تعذّر ذلك'), t('حاول مرة أخرى.')); return; }
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
    if ([shownF, shownG, year].some((n) => n !== null && (!Number.isInteger(n) || n < 0))) { Alert.alert(t('الأرقام'), t('أدخل أرقاماً صحيحة فقط.')); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_profile', { p_user: id, p_changes: {
      full_name: edit.full_name.trim(), bio: edit.bio, major_id: edit.major_id, college_id: edit.college_id,
      entry_year: year, student_number: latinDigits(edit.student_number.trim()), shown_followers: shownF, shown_following: shownG,
    } });
    setSaving(false);
    if (error) {
      Alert.alert(t('لم يُحفظ'), /bad_name/.test(error.message) ? t('يجب أن يتراوح الاسم بين 2 و 60 حرفاً.')
        : /bad_student_number/.test(error.message) ? t('يتكون الرقم الجامعي من أرقام وحروف إنجليزية فقط.') : t('حاول مرة أخرى.'));
      return;
    }
    done(); setEdit(null); reload(); onChanged?.();
  }

  async function setPostHidden(postId: string, hide: boolean) {
    const { error } = await supabase.from('posts').update({ is_hidden: hide }).eq('id', postId);
    if (error) { Alert.alert(t('تعذّر ذلك'), t('حاول مرة أخرى.')); return; }
    await audit(hide ? 'hide_post' : 'unhide_post', 'post', postId, { author: id });
    done(); reloadPosts();
  }
  /** the like number shown on one post (empty = the real one); the likers list stays real (0137) */
  async function setShownLikes(postId: string, real: number, shown: number | null) {
    const v = await promptText(t('عدد الإعجابات الظاهر'), t('فارغ = الرقم الحقيقي ({0}).', [fmtNum(real)]), shown != null ? String(shown) : '');
    if (v === null) return;
    const n = v.trim() === '' ? null : Number(latinDigits(v.trim()));
    if (n !== null && (!Number.isInteger(n) || n < 0)) { Alert.alert(t('الأرقام'), t('أدخل أرقاماً صحيحة فقط.')); return; }
    const { error } = await supabase.rpc('admin_set_shown_likes', { p_post: postId, p_count: n });
    if (error) { Alert.alert(t('تعذّر ذلك'), t('حاول مرة أخرى.')); return; }
    done(); reloadPosts();
  }
  async function deletePost(postId: string) {
    if (!(await confirm(t('حذف المنشور؟'), t('سيُحذف لدى الجميع ولن يعود.'), t('احذف')))) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) { Alert.alert(t('تعذّر ذلك'), t('حاول مرة أخرى.')); return; }
    await audit('delete_post', 'post', postId, { author: id });
    done(); reloadPosts(); onChanged?.();
  }
  async function removeAvatar() {
    if (!(await confirm(t('إزالة صورة الملف الشخصي؟'), t('ستُزال الصورة لدى الجميع.'), t('إزالة')))) return;
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', id);
    await audit('remove_avatar', 'user', id); reload();
  }

  if (!u) return <Muted>{t('جارٍ التحميل…')}</Muted>;
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
        <T v="small" selectable>{t('البريد الإلكتروني')}: {u.email ? `\u2066${u.email}\u2069` : '—'}</T>
        <T v="small">{t('الرقم الجامعي')}: {u.student_number ?? '—'}</T>
        <T v="small">{t('انضم: {0} · {1} منشور · {2} متابِع', [fmtDate(u.created_at), fmtNum(u.post_count), fmtNum(u.follower_count)])}</T>
        <T v="tiny" color={C.faint} selectable>{u.id}</T>
      </Panel>
      <Actions>
        {u.status !== 'active' && <Act label={t('فعّل الحساب')} kind="green" onPress={() => setStatus('active')} />}
        {u.status !== 'suspended' && <Act label={t('إيقاف مؤقت')} onPress={() => setStatus('suspended')} />}
        {u.status !== 'banned' && <Act label={t('حظر نهائي')} kind="danger" onPress={() => setStatus('banned')} />}
        <Act label={edit ? t('إلغاء التعديل') : t('تعديل')} onPress={() => (edit ? setEdit(null) : openEdit())} />
        {u.avatar_url && <Act label={t('إزالة الصورة')} onPress={removeAvatar} />}
      </Actions>
      {edit && (
        <Panel>
          <Field label={t('الاسم')} value={edit.full_name} maxLength={60} onChangeText={(v) => setEdit({ ...edit, full_name: v })} />
          <Field label={t('النبذة')} value={edit.bio} maxLength={300} onChangeText={(v) => setEdit({ ...edit, bio: v })} multiline />
          <Field label={t('الرقم الجامعي')} value={edit.student_number} maxLength={20} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => setEdit({ ...edit, student_number: v })} />
          <Field label={t('سنة الدخول')} value={edit.entry_year} maxLength={4} keyboardType="number-pad" onChangeText={(v) => setEdit({ ...edit, entry_year: v })} />
          <MajorPicker universityId={edit.university_id ?? undefined} collegeId={edit.college_id} majorId={edit.major_id} onChange={(c, m) => setEdit({ ...edit, college_id: c, major_id: m })} />
          <Section title={t('الأرقام التي تظهر في الملف الشخصي')} />
          <Muted>{t('يظهر في أعلى الملف الشخصي فقط. تبقى قائمة المتابعين حقيقية عندما يفتحها أحد. فارغ = الرقم الحقيقي ({0} متابِع).', [fmtNum(u.follower_count)])}</Muted>
          <Row gap={10}>
            <View style={{ flex: 1 }}><Field label={t('المتابِعون')} value={edit.shown_followers} keyboardType="number-pad" maxLength={9} onChangeText={(v) => setEdit({ ...edit, shown_followers: v })} /></View>
            <View style={{ flex: 1 }}><Field label={t('من يتابعهم')} value={edit.shown_following} keyboardType="number-pad" maxLength={9} onChangeText={(v) => setEdit({ ...edit, shown_following: v })} /></View>
          </Row>
          <Actions><Act label={t('احفظ')} kind="primary" loading={saving} onPress={saveEdit} /><Act label={t('إلغاء')} onPress={() => setEdit(null)} /></Actions>
        </Panel>
      )}
      <Section title={t('حسابات التواصل')} />
      <Panel>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Pill label={soc?.instagram ? `Instagram: \u2066@${soc.instagram}\u2069` : t('لا يوجد إنستغرام')} tone={soc?.instagram ? 'violet' : ''} />
          <Pill label={soc?.snapchat ? `Snapchat: \u2066@${soc.snapchat}\u2069` : t('لا يوجد سناب شات')} tone={soc?.snapchat ? 'orange' : ''} />
        </Row>
        <Muted>{t('لمن لا يستطيع الدخول إلى حسابه: تُزال من الملف الشخصي ومن النبذة (روابط، @اسم المستخدم، «انستا: …»)، ويمكنه استعادتها عند الدخول.')}</Muted>
        <Actions>
          <Act label={t('إزالة الحسابات')} loading={socBusy} onPress={clearSocials} />
        </Actions>
      </Panel>
      <Section title={t('مخالفات المجموعات')} />
      <Panel>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Pill label={t('{0} مخالفة', [fmtNum(strikes?.count ?? 0)])} tone={(strikes?.count ?? 0) > 0 ? 'orange' : ''} />
          {strikes?.until ? <Pill label={t('مكتوم حتى {0}', [fmtDate(strikes.until)])} tone="red" /> : <Pill label={t('غير مكتوم')} tone="green" />}
        </Row>
        {(strikes?.recent ?? []).map((r, i) => <Muted key={i}>{`${fmtDate(r.at)} · ${r.word}`}</Muted>)}
        {(strikes?.count ?? 0) > 0 && (
          <Actions>
            {strikes?.until ? <Act label={t('إلغاء الكتم')} kind="primary" onPress={() => unmute(false)} /> : null}
            <Act label={t('إعادة تعيين المخالفات')} onPress={() => unmute(true)} />
          </Actions>
        )}
      </Panel>
      {owner && <Section title={t('اسم المستخدم')} />}
      {owner && <Panel>
        <Muted>{acad?.username ? `@${acad.username}` : t('بدون اسم مستخدم')}</Muted>
        {uname !== null && <Field label={t('اسم المستخدم الجديد')} value={uname} autoCapitalize="none" autoCorrect={false} maxLength={24} onChangeText={(v) => setUname(v.toLowerCase().replace(/[^a-z0-9._]/g, ''))} />}
        <Actions>
          {uname === null
            ? <Act label={t('غيّر اسم المستخدم')} onPress={() => setUname(acad?.username ?? '')} />
            : <Act label={t('احفظ')} kind="primary" onPress={() => uname.length >= 3 && setUsername(uname)} />}
          {uname !== null && <Act label={t('إلغاء')} onPress={() => setUname(null)} />}
          <Act label={t('إزالة اسم المستخدم (رقم)')} kind="danger" onPress={() => setUsername(null)} />
        </Actions>
      </Panel>}
      {owner && <Section title={t('العلامة الزرقاء')} />}
      {owner && <Panel>
        <Row gap={8}>
          {acad?.is_verified ? <BadgeCheck size={20} color={C.white} fill={C.verified} /> : null}
          <Muted>{acad?.is_verified ? t('الحساب موثّق بالعلامة الزرقاء') : acad?.lapsed_blue ? t('العلامة موقوفة: لم يسجّل الدخول ببريده الجامعي منذ 6 أشهر، وستعود تلقائياً عند تسجيل دخوله') : t('بدون علامة زرقاء')}</Muted>
        </Row>
        <Actions>
          {acad?.is_verified
            ? <Act label={t('إزالة العلامة')} kind="danger" onPress={() => setBlueCheck(false)} />
            : <Act label={t('امنحه العلامة الزرقاء')} kind="primary" onPress={() => setBlueCheck(true)} />}
        </Actions>
      </Panel>}
      {owner && <Section title={t('إطار التكريم')} />}
      {owner && <Panel>
        <Muted>{frame ? t('يرتدي إطار: {0}', [frame.label]) : t('بدون إطار. تأتي الإطارات تلقائياً من علامات الجامعة لأول 10، ومن هنا تمنح إطاراً خاصاً لمناسبة.')}</Muted>
        <Muted>{t('لا يظهر إلا إذا فعّل الطالب «شارك في لوحة المتفوقين» ودون اسم مستعار.')}</Muted>
        <Actions>
          {FRAME_LEVELS.map(([lv, label]) => <Act key={lv} label={label} onPress={() => setFrame(lv)} />)}
          <Act label={t('إزالة الإطار الخاص')} kind="danger" onPress={() => setFrame(null)} />
        </Actions>
      </Panel>}
      {owner && <Section title={t('اللقب الأكاديمي')} />}
      {owner && <Panel>
        <Row gap={8}>
          {acad?.title_verified && acad.academic_title ? <TitleBadge title={acad.academic_title} verified size="md" label={acad.position_title} /> : <Muted>{acad?.lapsed_title && acad.academic_title ? t('اللقب موقوف ({0}): لم يسجّل الدخول ببريده الجامعي منذ 6 أشهر', [titleLabel(acad.academic_title)]) : acad?.account_type === 'faculty' ? t('بريده الإلكتروني الجامعي، قد يكون دكتوراً أو موظفاً') : t('بدون لقب')}</Muted>}
        </Row>
        <Actions>
          <Act label={pickTitle ? t('إلغاء') : t('غيّر اللقب')} onPress={() => setPickTitle(!pickTitle)} />
          {acad?.academic_title && <Act label={t('إزالة اللقب (إلغاء)')} kind="danger" onPress={() => setTitle(null)} />}
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
          {convs?.length === 0 && <Muted>{t('لا توجد محادثات.')}</Muted>}
        </View>
      )}
      </>}

      <Section title={t('آخر المنشورات')} />
      <View style={{ gap: 8 }}>
        {(posts ?? []).map((p) => (
          <View key={p.id} style={{ gap: 6 }}>
            <Item title={p.body.slice(0, 120) || t('(بدون نص)')} sub={`${p.category} · ${fmtDate(p.created_at)} · ${t('{0} إعجاب', [fmtNum(p.shown_likes ?? p.like_count)])}${p.shown_likes != null ? ` (${t('الحقيقي {0}', [fmtNum(p.like_count)])})` : ''}${p.is_hidden ? ` · ${t('مخفي')}` : ''}`} dim={p.is_hidden}
              onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} />
            <Actions>
              <Act label={p.is_hidden ? t('استعادته') : t('إخفاء')} onPress={() => setPostHidden(p.id, !p.is_hidden)} />
              <Act label={t('عدد الإعجابات')} onPress={() => setShownLikes(p.id, p.like_count, p.shown_likes)} />
              <Act label={t('احذف')} kind="danger" onPress={() => deletePost(p.id)} />
            </Actions>
          </View>
        ))}
        {posts?.length === 0 && <Muted>{t('لا توجد منشورات.')}</Muted>}
      </View>
    </View>
  );
}
