import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Check, ImagePlus, Play, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Row, T, Tap } from '@/components/ui';
import { Bone } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { LOCALE, t, ta } from '@/lib/i18n';
import { mediaUrl, photoWidth, supabase } from '@/lib/supabase';
import { C, F, isDark, R } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { pickMedia, uploadPicked } from '@/lib/upload';

export type HighlightRef = { id: string; title: string; cover_url: string | null };
type Story = { id: string; media_url: string; kind: 'image' | 'video'; created_at: string; uri?: string | null };

const MAX = 100; // per highlight, same as the database (0105)
const ARCHIVE_DAYS = 30;

/**
 * New or edit highlight, like Instagram: pick stories from your archive (photos and videos, last 30 days plus
 * everything already in a highlight), name it, choose its cover (one of its photos, or any photo from the gallery). Editing adds / removes stories, renames, changes the cover, or deletes the highlight.
 */
export function HighlightEditor({ open, edit, onClose, onSaved }: {
  open: boolean; edit?: HighlightRef | null; onClose: () => void; onSaved: () => void;
}) {
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const [list, setList] = useState<Story[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [had, setHad] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState<string | null>(null);   // storage path
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [pickingCover, setPickingCover] = useState(false); // tapping a photo below makes it the cover
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !profile) return;
    setList(null); setSel([]); setHad([]); setPickingCover(false);
    setTitle(edit?.title ?? ''); setCover(edit?.cover_url ?? null);
    const since = new Date(Date.now() - ARCHIVE_DAYS * 86400000).toISOString();
    Promise.all([
      supabase.from('stories').select('id, media_url, kind, created_at').eq('author_id', profile.id).in('kind', ['image', 'video'])
        .or(`created_at.gt.${since},is_highlighted.eq.true`).order('created_at', { ascending: false }).limit(150),
      edit ? supabase.from('highlight_items').select('story_id').eq('highlight_id', edit.id).order('added_at') : Promise.resolve({ data: [] as { story_id: string }[] }),
    ]).then(async ([{ data: rows }, { data: items }]) => {
      const ids = ((items ?? []) as { story_id: string }[]).map((x) => x.story_id);
      setSel(ids); setHad(ids);
      const stories = (rows ?? []) as Story[];
      setList(await Promise.all(stories.map(async (s) => ({ ...s, uri: s.kind === 'image' ? await mediaUrl('stories', s.media_url, photoWidth(130)) : null }))));
    });
  }, [open, profile, edit]);

  // the cover: the one chosen, else the first picked photo
  const firstPhoto = useMemo(() => list?.find((s) => sel.includes(s.id) && s.kind === 'image')?.media_url ?? null, [list, sel]);
  const coverPath = cover ?? firstPhoto;
  useEffect(() => { setCoverUri(null); if (coverPath) mediaUrl('stories', coverPath, photoWidth(90)).then(setCoverUri); }, [coverPath]);

  function tapStory(s: Story) {
    Haptics.selectionAsync().catch(() => {});
    if (pickingCover) {
      if (s.kind !== 'image') { toast(t('الغلاف لازم يكون صورة')); return; }
      setCover(s.media_url); setPickingCover(false); return;
    }
    if (sel.includes(s.id)) {
      if (cover === s.media_url) setCover(null);
      setSel(sel.filter((x) => x !== s.id));
    } else if (sel.length >= MAX) toast(t('الحد {0} قصة بالهايلايت', [String(MAX)]));
    else setSel([...sel, s.id]);
  }

  /** any photo from the gallery, saved in my own folder (readable by whoever sees my profile, 0107). The phone's own
   *  square crop: this editor is itself a sheet, and an iPhone can't put our crop screen on top of it. */
  async function coverFromGallery() {
    if (!profile) return;
    const m = await pickMedia({ square: true, maxWidth: 720 });
    if (!m) return;
    try {
      const { path } = await uploadPicked('stories', profile.id, m);
      setCover(path); setPickingCover(false);
    } catch { toast.error(t('ما زبط رفع الصورة، جرّب كمان مرة.')); }
  }

  async function save() {
    if (!profile || busy) return;
    if (!sel.length) { Alert.alert(t('اختار قصة وحدة على الأقل')); return; }
    const name = title.trim().slice(0, 30);
    if (!name) { Alert.alert(t('سمّي الهايلايت')); return; }
    setBusy(true);
    try {
      let id = edit?.id;
      if (id) {
        const { error } = await supabase.from('highlights').update({ title: name, cover_url: coverPath }).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('highlights').insert({ owner_id: profile.id, title: name, cover_url: coverPath }).select('id').single();
        if (error || !data) throw error;
        id = data.id;
      }
      const gone = had.filter((x) => !sel.includes(x));
      const added = sel.filter((x) => !had.includes(x));
      if (gone.length) { const { error } = await supabase.from('highlight_items').delete().eq('highlight_id', id).in('story_id', gone); if (error) throw error; }
      // one at a time, in the order picked: that's the order they play in
      for (const story_id of added) { const { error } = await supabase.from('highlight_items').insert({ highlight_id: id, story_id }); if (error) throw error; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(edit ? t('انحفظ الهايلايت ✓') : t('انعمل الهايلايت ✓'));
      onSaved(); onClose();
    } catch (e) {
      Alert.alert(t('ما زبط'), String((e as Error)?.message ?? '').includes('limit') ? t('الحد {0} قصة بالهايلايت', [String(MAX)]) : t('جرّب كمان مرة.'));
    } finally { setBusy(false); }
  }

  function remove() {
    if (!edit) return;
    Alert.alert(t('تحذف الهايلايت؟'), t('القصص نفسها ما بتنحذف، بس بتطلع من الهايلايت.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('احذف'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('highlights').delete().eq('id', edit.id);
        if (error) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
        toast(t('انحذف الهايلايت')); onSaved(); onClose();
      } },
    ]);
  }

  const side = (width - 16 * 2 - 6 * 2) / 3;
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <Row gap={8} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <Tap onPress={onClose} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={C.ink} /></Tap>
          <T v="h3" style={{ flex: 1, textAlign: 'center' }}>{edit ? t('تعديل الهايلايت') : t('هايلايت جديد')}</T>
          <Tap onPress={save} disabled={busy} style={{ minHeight: 38, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
            <T v="bold" color={C.onPrimary}>{t('تم')}</T>
          </Tap>
        </Row>

        {/* cover + name, the way it will look on the profile */}
        <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 }}>
          <View style={{ width: 86, height: 86, borderRadius: 43, padding: 3, borderWidth: 1.5, borderColor: C.line }}>
            <View style={{ flex: 1, borderRadius: 40, overflow: 'hidden', backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
              {coverUri ? <Image source={{ uri: coverUri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={120} />
                : <T style={{ fontFamily: F.display, fontSize: 28 }} color={C.muted}>{(title.trim()[0] ?? '★')}</T>}
            </View>
          </View>
          <Row gap={8}>
            <Tap onPress={() => setPickingCover((v) => !v)} style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: pickingCover ? C.inverse : C.soft, justifyContent: 'center' }}>
              <T v="small" color={pickingCover ? C.onInverse : C.ink} style={{ fontFamily: F.bodyBold }}>{pickingCover ? t('اختار صورة من تحت') : t('غيّر الغلاف')}</T>
            </Tap>
            <Tap onPress={coverFromGallery} accessibilityLabel={t('غلاف من صورك')} style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: C.soft, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ImagePlus size={16} color={C.ink} /><T v="small" style={{ fontFamily: F.bodyBold }}>{t('من صورك')}</T>
            </Tap>
          </Row>
          <TextInput value={title} onChangeText={setTitle} maxLength={30} placeholder={t('اسم الهايلايت، مثلاً «سنة أولى»')} placeholderTextColor={C.faint} keyboardAppearance={isDark ? 'dark' : 'light'}
            style={{ alignSelf: 'stretch', minHeight: 48, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
          <T v="tiny" color={C.muted}>{t('{0} مختارة · قصص آخر {1} يوم', [String(sel.length), String(ARCHIVE_DAYS)])}</T>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: edit ? 110 : 40 }}>
          {list === null ? [0, 1, 2, 3, 4, 5].map((k) => <Bone key={k} w={side} h={side * 1.6} r={16} />)
            : list.length === 0 ? <View style={{ width: '100%' }}><Empty title={t('ما عندك قصص بالأرشيف')} body={t('نزّل ستوري وبعدين بتقدر تحطها بهايلايت.')} /></View>
            : list.map((s) => {
              const n = sel.indexOf(s.id);
              const isCover = coverPath === s.media_url;
              return (
                <Pressable key={s.id} onPress={() => tapStory(s)} accessibilityRole="checkbox" accessibilityState={{ checked: n >= 0 }}
                  accessibilityLabel={`${s.kind === 'video' ? t('فيديو') : t('صورة')} ${new Date(s.created_at).toLocaleDateString(LOCALE)}`}
                  style={{ width: side, height: side * 1.6, borderRadius: 16, overflow: 'hidden', backgroundColor: s.kind === 'video' ? '#1B2250' : C.soft,
                    opacity: pickingCover && s.kind !== 'image' ? 0.35 : 1, borderWidth: isCover ? 3 : 0, borderColor: C.primary }}>
                  {s.uri ? <Image source={{ uri: s.uri }} style={{ flex: 1 }} contentFit="cover" />
                    : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Play size={28} color="#fff" fill="#fff" /></View>}
                  <T v="tiny" color="#fff" style={{ position: 'absolute', bottom: 6, right: 8, fontFamily: F.bodyBold, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>
                    {new Date(s.created_at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}
                  </T>
                  {!pickingCover && (
                    <View style={{ position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#fff', backgroundColor: n >= 0 ? C.primary : 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                      {n >= 0 && <T v="tiny" color={C.onPrimary} style={{ fontFamily: F.bodyBold }}>{n + 1}</T>}
                    </View>
                  )}
                  {pickingCover && isCover && <View style={{ position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Check size={14} color={C.onPrimary} /></View>}
                </Pressable>
              );
            })}
        </ScrollView>

        {edit && (
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 26 }}>
            <Tap onPress={remove} style={{ minHeight: 50, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Trash2 size={18} color={C.red} /><T v="bold" color={C.red}>{t('احذف الهايلايت')}</T>
            </Tap>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
