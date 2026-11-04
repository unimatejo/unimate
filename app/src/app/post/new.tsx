import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { BarChart3, Camera, FileText, Image as ImageIcon, MapPin, Plus, Video, Wand2, X } from 'lucide-react-native';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar, Button, Chip, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { StoryEditor } from '@/components/StoryEditor';
import { StoryOverlays } from '@/components/StoryOverlays';
import type { Overlay } from '@/lib/storyOverlay';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { C, CATEGORY, F, isDark } from '@/lib/theme';
import { pickMedia, pickPdf, pickPhotos, uploadFile, type Picked } from '@/lib/upload';
import { t, ta } from '@/lib/i18n';

const POST_AUD = [['university', t('الجامعة')], ['college', t('كليتي')], ['major', t('تخصصي')], ['friends', t('أصدقائي')]] as const;
const STORY_AUD = [['friends', t('أصدقائي')], ['close_friends', t('المقربين')], ['major', t('تخصصي')], ['university', t('الجامعة')]] as const;

export default function NewPost() {
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; category?: string; community?: string }>();
  const [mode, setMode] = useState(params.mode === 'story' ? 1 : 0);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [lf, setLf] = useState<'lost' | 'found'>('found');
  const [cat, setCat] = useState(params.category ?? 'square');
  const [aud, setAud] = useState(0);
  const [media, setMedia] = useState<Picked | null>(null);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ uri: string; mime: string; name: string; size: number | null } | null>(null);
  const [poll, setPoll] = useState<string[] | null>(null);
  const isPost = mode === 0;
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [editing, setEditing] = useState(false);

  async function pick(camera = false, video = false) {
    try {
      const m = await pickMedia({ camera, video });
      if (m) { setMedia(m); if (!isPost) { setOverlays([]); setEditing(true); } } // stories open the editor right away
    }
    catch (e) { Alert.alert(t('ما زبط'), (e as Error).message); }
  }

  async function publish() {
    if (busy) return;
    if (!profile?.university_id) { Alert.alert(t('ما انتشر'), t('كمّل معلومات حسابك (الجامعة) أول.')); return; }
    setBusy(true);
    try {
      if (isPost) {
        const opts = poll?.map((o) => o.trim()).filter(Boolean) ?? null;
        if (poll && (!body.trim() || (opts?.length ?? 0) < 2)) { Alert.alert(t('الاستطلاع'), t('اكتب السؤال فوق وخيارين على الأقل.')); setBusy(false); return; }
        if (!body.trim() && !media && !photos.length && !pdf) { Alert.alert(t('اكتب إشي أو ضيف صورة أو ملف')); setBusy(false); return; }
        // upload files first, so a failed upload never leaves an empty post behind
        const all = [...(media ? [media] : []), ...photos];
        const paths = await Promise.all(all.map((m) => uploadFile('posts', (profile?.id ?? ''), m)));
        const pdfPath = pdf ? await uploadFile('posts', (profile?.id ?? ''), pdf) : null;
        const price_jod = cat === 'market' && price ? Number(price.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g, '.')) : null;
        if (price_jod != null && !Number.isFinite(price_jod)) { Alert.alert(t('السعر بالدينار'), t('اكتب السعر أرقام بس.')); setBusy(false); return; }
        const { data: post, error } = await supabase.from('posts').insert({
          author_id: (profile?.id ?? ''), university_id: profile.university_id, community_id: params.community ?? null,
          category: cat, audience: params.community ? 'community' : POST_AUD[aud][0],
          title: title.trim() || null, body: body.trim(),
          price_jod,
          lost_found: cat === 'lost_found' ? lf : null,
          poll: opts && opts.length >= 2 ? { options: opts.slice(0, 4) } : null,
        }).select('id').single();
        if (error) throw error;
        const rows = [
          ...paths.map((url, i) => ({ post_id: post.id, kind: 'image', url, position: i + 2, file_name: null as string | null, size_bytes: null as number | null })),
          ...(pdfPath && pdf ? [{ post_id: post.id, kind: 'file', url: pdfPath, position: 1, file_name: pdf.name, size_bytes: pdf.size }] : []),
        ];
        if (rows.length) {
          const { error: me } = await supabase.from('post_media').insert(rows);
          if (me) { await supabase.from('posts').delete().eq('id', post.id); throw me; }
        }
      } else {
        if (!media) { Alert.alert(t('ضيف صورة أو فيديو للستوري')); setBusy(false); return; }
        const path = await uploadFile('stories', (profile?.id ?? ''), media);
        const { error } = await supabase.from('stories').insert({
          author_id: (profile?.id ?? ''), university_id: profile.university_id, kind: media.kind, media_url: path,
          duration_sec: media.duration ? Math.ceil(media.duration / 1000) : null, caption: body.trim() || null, audience: STORY_AUD[aud][0], overlays,
        });
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (router.canGoBack()) router.back(); else router.replace('/community');
    } catch (e) {
      reportError(e);
      Alert.alert(t('ما انتشر'), (e as Error).message?.length < 120 && !/row-level|violates|JWT/i.test((e as Error).message) ? (e as Error).message : t('تأكد من الإنترنت وجرّب كمان مرة.'));
    } finally { setBusy(false); }
  }

  const auds = isPost ? POST_AUD : STORY_AUD;
  return (
    <Screen bg={C.card}>
      <Row gap={8} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <Tap onPress={() => router.back()} accessibilityLabel={t('إلغاء')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={24} color={C.ink} /></Tap>
        <View style={{ flex: 1 }}><Segmented items={[t('منشور'), t('ستوري')]} value={mode} onChange={(i) => { setMode(i); setAud(0); setMedia(null); setPhotos([]); }} /></View>
        <Button title={isPost ? t('نشر') : t('شارك')} loading={busy} disabled={busy || (isPost && !body.trim() && !media && !photos.length && !pdf)} onPress={publish} style={{ minHeight: 42, borderRadius: 14, paddingHorizontal: 18 }} />
      </Row>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Row gap={12} center={false}>
            <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={44} />
            <View style={{ flex: 1, gap: 6 }}>
              {isPost && ['market', 'tutoring', 'events', 'opportunities', 'summaries'].includes(cat) && (
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={title} onChangeText={setTitle} placeholder={t('العنوان')} placeholderTextColor={C.faint} style={{ fontFamily: F.title, fontSize: 18, color: C.ink, textAlign: ta, minHeight: 40 }} />
              )}
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={body} onChangeText={setBody} multiline autoFocus
                placeholder={isPost ? t('شو ببالك؟ اسأل، شارك ملخص، أو احكي للدفعة...') : t('اكتب على الستوري...')} placeholderTextColor={C.faint}
                style={{ fontFamily: F.body, fontSize: 17, lineHeight: 28, color: C.ink, textAlign: ta, minHeight: 120, textAlignVertical: 'top' }} accessibilityLabel={t('نص المنشور')} />
            </View>
          </Row>

          {media && (
            <Animated.View entering={FadeIn} style={[{ borderRadius: 22, overflow: 'hidden', backgroundColor: C.bg }, isPost ? { height: 220 } : { width: 170, aspectRatio: 9 / 16, alignSelf: 'center' }]}>
              <Image source={{ uri: media.uri }} style={{ flex: 1 }} contentFit="cover" />
              {!isPost && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none"><StoryOverlays items={overlays} width={170} height={170 * 16 / 9} /></View>}
              {!isPost && (
                <Tap onPress={() => setEditing(true)} accessibilityLabel={t('عدّل الستوري')} style={{ position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(14,20,48,0.6)' }}>
                  <Wand2 size={16} color={C.white} /><T v="tiny" color={C.white}>{t('عدّل')}</T>
                </Tap>
              )}
              <Tap onPress={() => { setMedia(null); setOverlays([]); }} accessibilityLabel={t('شيل الصورة')} style={{ position: 'absolute', top: 10, left: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(14,20,48,0.6)', alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.white} /></Tap>
            </Animated.View>
          )}

          {isPost && photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((ph, i) => (
                <Animated.View key={ph.uri} entering={FadeIn} style={{ width: 130, height: 160, borderRadius: 18, overflow: 'hidden', backgroundColor: C.soft }}>
                  <Image source={{ uri: ph.uri }} style={{ flex: 1 }} contentFit="cover" />
                  <Tap onPress={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} accessibilityLabel={t('شيل الصورة')} style={{ position: 'absolute', top: 6, left: 6, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(14,20,48,0.6)', alignItems: 'center', justifyContent: 'center' }}><X size={15} color={C.white} /></Tap>
                  <View style={{ position: 'absolute', bottom: 6, right: 6, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(14,20,48,0.6)', alignItems: 'center', justifyContent: 'center' }}><T v="tiny" color="#fff">{i + 1}</T></View>
                </Animated.View>
              ))}
            </ScrollView>
          )}

          {isPost && pdf && (
            <Row gap={10} style={{ backgroundColor: C.soft, borderRadius: 16, padding: 12 }}>
              <FileText size={22} color="#E11D48" />
              <T v="bold" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{pdf.name}</T>
              <Tap onPress={() => setPdf(null)} accessibilityLabel={t('شيل الملف')} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.muted} /></Tap>
            </Row>
          )}
          {isPost && poll && (
            <View style={{ gap: 8, backgroundColor: C.violetSoft, borderRadius: 18, padding: 12 }}>
              <T v="bold" color={C.violet}>{t('خيارات الاستطلاع (السؤال هو النص فوق)')}</T>
              {poll.map((o, i) => (
                <Row key={i} gap={6}>
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={o} onChangeText={(t) => setPoll(poll.map((x, j) => (j === i ? t : x)))} maxLength={60} placeholder={t('الخيار {0}', [i + 1])} placeholderTextColor={C.faint}
                    style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.card, paddingHorizontal: 12, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
                  {poll.length > 2 && <Tap onPress={() => setPoll(poll.filter((_, j) => j !== i))} accessibilityLabel={t('شيل الخيار')} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={C.muted} /></Tap>}
                </Row>
              ))}
              {poll.length < 4 && <Tap onPress={() => setPoll([...poll, ''])} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}><Plus size={16} color={C.violet} /><T v="bold" color={C.violet}>{t('ضيف خيار')}</T></Tap>}
            </View>
          )}

          <Row gap={8}>
            {((isPost ? [
              [t('صور'), ImageIcon, C.green, C.greenSoft, async () => { const ps = await pickPhotos(10 - photos.length - (media ? 1 : 0)); if (ps.length) setPhotos((cur) => [...cur, ...ps].slice(0, 10)); }],
              [t('كاميرا'), Camera, C.pink, C.pinkSoft, () => pick(true)],
              [t('ملف PDF'), FileText, C.primary, C.primarySoft, async () => { const f = await pickPdf(); if (f) setPdf(f); }],
              [t('استطلاع'), BarChart3, C.violet, C.violetSoft, () => setPoll(poll ? null : ['', ''])],
            ] : [
              [t('كاميرا'), Camera, C.pink, C.pinkSoft, () => pick(true, true)],
              [t('فيديو 15ث'), Video, C.ink, C.soft, () => pick(false, true)],
              [t('صورة'), ImageIcon, C.green, C.greenSoft, () => pick()],
            ]) as [string, typeof Camera, string, string, () => void | Promise<void>][]).map(([label, Icon, fg, bg, fn]) => (
              <Tap key={label} onPress={fn} style={{ flex: 1, minHeight: 76, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon size={24} color={fg} /><T v="tiny" color={fg}>{label}</T>
              </Tap>
            ))}
          </Row>

          {isPost && !params.community && (
            <View style={{ gap: 10 }}>
              <T v="bold">{t('بأي قسم؟')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(CATEGORY).map(([k, v]) => <Chip key={k} label={v.label} dot={v.color} active={cat === k} onPress={() => setCat(k)} />)}
              </View>
            </View>
          )}
          {isPost && cat === 'lost_found' && (
            <Row gap={8}><Chip label={t('لقيت')} active={lf === 'found'} onPress={() => setLf('found')} /><Chip label={t('ضاع مني')} active={lf === 'lost'} onPress={() => setLf('lost')} /></Row>
          )}
          {isPost && cat === 'market' && (
            <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={t('السعر بالدينار')} placeholderTextColor={C.faint}
              style={{ minHeight: 50, borderRadius: 16, backgroundColor: C.field, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, textAlign: ta }} />
          )}
          {!isPost && (
            <Row gap={8} center={false} style={{ backgroundColor: C.primarySoft, borderRadius: 16, padding: 12 }}>
              <MapPin size={17} color={C.primaryDark} />
              <T v="small" color={C.primaryDark} style={{ flex: 1 }}>{t('الستوري بتختفي بعد 24 ساعة. الفيديو لحد 15 ثانية، والصور بتقدر تثبّتها بأبرز القصص.')}</T>
            </Row>
          )}

          {!params.community && (
            <View style={{ gap: 8 }}>
              <T v="bold">{t('مين بيشوفه؟')}</T>
              <Row gap={6}>
                {auds.map(([k, l], i) => (
                  <Tap key={k} onPress={() => setAud(i)} accessibilityRole="radio" accessibilityState={{ selected: aud === i }}
                    style={{ flex: 1, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: aud === i ? 2 : 1, borderColor: aud === i ? C.primary : C.line, backgroundColor: aud === i ? C.primarySoft : C.card }}>
                    <T v="tiny" color={aud === i ? C.primary : C.ink2}>{l}</T>
                  </Tap>
                ))}
              </Row>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={editing && !!media} animationType="fade" onRequestClose={() => setEditing(false)} statusBarTranslucent>
        {media && <StoryEditor media={media} initial={overlays} onCancel={() => { setEditing(false); if (!overlays.length) setMedia(null); }}
          onDone={(m, o) => { setMedia(m); setOverlays(o); setEditing(false); }} />}
      </Modal>
      {busy && (
        <Animated.View entering={FadeIn} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(14,20,48,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: C.card, borderRadius: 26, paddingVertical: 26, paddingHorizontal: 34, alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={C.primary} />
            <T v="bold">{isPost ? t('عم ننشر منشورك…') : t('عم نرفع قصتك…')}</T>
            {media?.kind === 'video' && <T v="tiny" color={C.muted}>{t('الفيديو بياخذ ثواني أكثر')}</T>}
          </View>
        </Animated.View>
      )}
    </Screen>
  );
}
