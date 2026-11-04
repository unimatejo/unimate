import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Camera, ChevronRight, FileText, Images, Plus, Radio, Wand2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Chip, Row, T, Tap } from '@/components/ui';
import { StoryEditor } from '@/components/StoryEditor';
import { StoryOverlays } from '@/components/StoryOverlays';
import type { Overlay } from '@/lib/storyOverlay';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { C, CATEGORY, F, isDark, R, SPRING } from '@/lib/theme';
import { pickMedia, pickPdf, pickPhotos, uploadFile, type Picked } from '@/lib/upload';
import { flip, rtlLayout, t, ta } from '@/lib/i18n';

const POST_AUD = [['university', t('الجامعة')], ['college', t('كليتي')], ['major', t('تخصصي')], ['friends', t('أصدقائي')]] as const;
const STORY_AUD = [['friends', t('أصدقائي')], ['close_friends', t('المقربين')], ['major', t('تخصصي')], ['university', t('الجامعة')]] as const;

type Mode = 'post' | 'story' | 'reel' | 'live';
const MODES: [Mode, string][] = [['post', t('منشور')], ['story', t('ستوري')], ['reel', t('ريلز')], ['live', t('مباشر')]];
const TITLES: Record<Mode, string> = { post: t('منشور جديد'), story: t('ستوري جديدة'), reel: t('ريلز جديد'), live: t('بث مباشر') };

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" nativeControls={false} />;
}

/** The bottom pill: منشور / ستوري / ريلز / مباشر, with the selected one sliding (spring). */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const idx = MODES.findIndex(([k]) => k === mode);
  useEffect(() => { x.value = withSpring(idx * w, SPRING); }, [idx, w, x]);
  const rtl = rtlLayout();
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: rtl ? -x.value : x.value }] }));
  return (
    <View accessibilityRole="tablist" style={{ alignSelf: 'center', flexDirection: 'row', padding: 5, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
      {w > 0 && <Animated.View style={[{ position: 'absolute', top: 5, bottom: 5, ...(Platform.OS === 'web' ? (rtl ? { right: 5 } : { left: 5 }) : { start: 5 }), width: w, borderRadius: R.pill, backgroundColor: C.inverse }, pill]} />}
      {MODES.map(([k, label]) => (
        <Tap key={k} haptic onPress={() => k !== mode && onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: k === mode }}
          onLayout={(e) => { if (!w) setW(e.nativeEvent.layout.width); }}
          style={{ width: 76, minHeight: 40, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' }}>
          <T v="bold" color={k === mode ? C.onInverse : C.muted} style={{ fontSize: 14 }}>{label}</T>
        </Tap>
      ))}
    </View>
  );
}

/**
 * Create, like Instagram: pick what to make at the bottom (post / story / reel / live), choose the photos or video,
 * then "التالي" to write the caption and who sees it. Stories open the editor and can be shared straight from it.
 */
export default function Create() {
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ mode?: string; category?: string; community?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'story' ? 'story' : params.mode === 'reel' ? 'reel' : 'post');
  const [step, setStep] = useState<'pick' | 'compose'>('pick');
  const [items, setItems] = useState<Picked[]>([]);
  const [active, setActive] = useState(0);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [lf, setLf] = useState<'lost' | 'found'>('found');
  const [cat, setCat] = useState(params.category ?? 'square');
  const [aud, setAud] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ uri: string; mime: string; name: string; size: number | null } | null>(null);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [editing, setEditing] = useState(false);
  const isStory = mode === 'story';
  const media = items[active] ?? items[0] ?? null;

  function switchMode(m: Mode) {
    setMode(m); setStep('pick'); setItems([]); setActive(0); setOverlays([]); setAud(0); setPdf(null); setPoll(null);
  }

  async function addFromGallery() {
    try {
      if (mode === 'post') {
        const ps = await pickPhotos(10 - items.length);
        if (ps.length) { setItems((cur) => [...cur, ...ps].slice(0, 10)); setActive(items.length); }
      } else {
        const m = await pickMedia({ video: true, videoOnly: mode === 'reel', maxSec: mode === 'reel' ? 60 : 15 });
        if (!m) return;
        if (mode === 'reel' && m.kind !== 'video') { Alert.alert(t('الريلز فيديو'), t('اختار فيديو لحد دقيقة.')); return; }
        setItems([m]); setActive(0);
        if (isStory) { setOverlays([]); setEditing(true); }
      }
    } catch (e) { Alert.alert(t('ما زبط'), (e as Error).message); }
  }
  async function fromCamera() {
    try {
      const m = await pickMedia({ camera: true, video: mode !== 'post', videoOnly: mode === 'reel', maxSec: mode === 'reel' ? 60 : 15 });
      if (!m) return;
      if (mode === 'post') { setItems((cur) => [...cur, m].slice(0, 10)); setActive(items.length); return; }
      setItems([m]); setActive(0);
      if (isStory) { setOverlays([]); setEditing(true); }
    } catch (e) { Alert.alert(t('ما زبط'), (e as Error).message); }
  }
  function toggleItem(i: number) {
    // tap a chosen photo to see it; tap it again to take it out (numbers re-order like Instagram)
    if (i !== active) { setActive(i); return; }
    Haptics.selectionAsync().catch(() => {});
    setItems((cur) => cur.filter((_, j) => j !== i)); setActive(0);
  }

  function next() {
    if (mode === 'live') return;
    if (mode === 'reel' && !media) { addFromGallery(); return; }
    if (isStory && !media) { addFromGallery(); return; }
    if (isStory && media) { setEditing(true); return; }
    setStep('compose');
  }

  async function publish(story?: { m: Picked; o: Overlay[]; audience: string }) {
    if (busy) return;
    if (!profile?.university_id) { Alert.alert(t('ما انتشر'), t('كمّل معلومات حسابك (الجامعة) أول.')); return; }
    setBusy(true);
    try {
      if (isStory) {
        const m = story?.m ?? media;
        if (!m) { Alert.alert(t('ضيف صورة أو فيديو للستوري')); setBusy(false); return; }
        const path = await uploadFile('stories', profile.id, m);
        const { error } = await supabase.from('stories').insert({
          author_id: profile.id, university_id: profile.university_id, kind: m.kind, media_url: path,
          duration_sec: m.duration ? Math.ceil(m.duration / 1000) : null, caption: body.trim() || null,
          audience: story?.audience ?? STORY_AUD[aud][0], overlays: story?.o ?? overlays,
        });
        if (error) throw error;
      } else {
        const opts = poll?.map((o) => o.trim()).filter(Boolean) ?? null;
        if (poll && (!body.trim() || (opts?.length ?? 0) < 2)) { Alert.alert(t('الاستطلاع'), t('اكتب السؤال فوق وخيارين على الأقل.')); setBusy(false); return; }
        if (mode === 'post' && !body.trim() && !items.length && !pdf) { Alert.alert(t('اكتب إشي أو ضيف صورة أو ملف')); setBusy(false); return; }
        if (mode === 'reel' && !media) { Alert.alert(t('اختار فيديو للريلز')); setBusy(false); return; }
        // upload files first, so a failed upload never leaves an empty post behind
        const paths = await Promise.all(items.map((m) => uploadFile('posts', profile.id, m)));
        const pdfPath = pdf && mode === 'post' ? await uploadFile('posts', profile.id, pdf) : null;
        const price_jod = cat === 'market' && price ? Number(price.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g, '.')) : null;
        if (price_jod != null && !Number.isFinite(price_jod)) { Alert.alert(t('السعر بالدينار'), t('اكتب السعر أرقام بس.')); setBusy(false); return; }
        const { data: post, error } = await supabase.from('posts').insert({
          author_id: profile.id, university_id: profile.university_id, community_id: params.community ?? null,
          category: mode === 'reel' ? 'square' : cat, audience: params.community ? 'community' : POST_AUD[aud][0],
          title: mode === 'post' ? title.trim() || null : null, body: body.trim(),
          price_jod: mode === 'post' ? price_jod : null,
          lost_found: mode === 'post' && cat === 'lost_found' ? lf : null,
          poll: mode === 'post' && opts && opts.length >= 2 ? { options: opts.slice(0, 4) } : null,
        }).select('id').single();
        if (error) throw error;
        const rows = [
          ...paths.map((url, i) => ({ post_id: post.id, kind: items[i].kind, url, position: i + 2, file_name: null as string | null, size_bytes: null as number | null })),
          ...(pdfPath && pdf ? [{ post_id: post.id, kind: 'file', url: pdfPath, position: 1, file_name: pdf.name, size_bytes: pdf.size }] : []),
        ];
        if (rows.length) {
          const { error: me } = await supabase.from('post_media').insert(rows);
          if (me) { await supabase.from('posts').delete().eq('id', post.id); throw me; }
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (router.canGoBack()) router.back(); else router.replace('/community');
    } catch (e) {
      reportError(e);
      Alert.alert(t('ما انتشر'), (e as Error).message?.length < 120 && !/row-level|violates|JWT/i.test((e as Error).message) ? (e as Error).message : t('تأكد من الإنترنت وجرّب كمان مرة.'));
    } finally { setBusy(false); }
  }

  const tile = (width - 3 * 5) / 4;
  const canNext = mode === 'live' ? false : mode === 'post' ? true : true;

  // ---------- step 2: caption, section, audience ----------
  if (step === 'compose' && !isStory) {
    const auds = POST_AUD;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <Row gap={8} style={{ paddingHorizontal: 12, minHeight: 56 }}>
          <Tap onPress={() => setStep('pick')} accessibilityLabel={t('رجوع')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={24} color={C.ink} style={flip} /></Tap>
          <T style={{ flex: 1, textAlign: 'center', fontFamily: F.bodyBold, fontSize: 17 }}>{TITLES[mode]}</T>
          <Tap onPress={() => publish()} disabled={busy} accessibilityLabel={t('نشر')}
            style={{ minHeight: 38, paddingHorizontal: 20, borderRadius: R.pill, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
            <T v="bold" color={C.onPrimary}>{busy ? t('عم ننشر…') : t('نشر')}</T>
          </Tap>
        </Row>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <Row gap={12} center={false}>
              {media ? (
                <View style={{ width: 84, height: mode === 'reel' ? 130 : 84, borderRadius: 16, overflow: 'hidden', backgroundColor: C.soft }}>
                  {media.kind === 'video' ? <VideoPreview uri={media.uri} /> : <Image source={{ uri: media.uri }} style={{ flex: 1 }} contentFit="cover" />}
                  {items.length > 1 && <View style={{ position: 'absolute', top: 6, left: 6, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}><T v="tiny" color="#fff">{items.length}</T></View>}
                </View>
              ) : <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={44} />}
              <View style={{ flex: 1, gap: 6 }}>
                {mode === 'post' && ['market', 'tutoring', 'events', 'opportunities', 'summaries'].includes(cat) && (
                  <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={title} onChangeText={setTitle} placeholder={t('العنوان')} placeholderTextColor={C.faint} style={{ fontFamily: F.title, fontSize: 18, color: C.ink, textAlign: ta, minHeight: 40 }} />
                )}
                <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={body} onChangeText={setBody} multiline autoFocus
                  placeholder={mode === 'reel' ? t('اكتب وصف للريلز…') : t('شو ببالك؟ اسأل، شارك ملخص، أو احكي للدفعة...')} placeholderTextColor={C.faint}
                  style={{ fontFamily: F.body, fontSize: 17, lineHeight: 28, color: C.ink, textAlign: ta, minHeight: 110, textAlignVertical: 'top' }} accessibilityLabel={t('نص المنشور')} />
              </View>
            </Row>

            {mode === 'post' && pdf && (
              <Row gap={10} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 12 }}>
                <FileText size={22} color={C.primary} />
                <T v="bold" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{pdf.name}</T>
                <Tap onPress={() => setPdf(null)} accessibilityLabel={t('شيل الملف')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.muted} /></Tap>
              </Row>
            )}
            {mode === 'post' && poll && (
              <View style={{ gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 12 }}>
                <T v="bold">{t('خيارات الاستطلاع (السؤال هو النص فوق)')}</T>
                {poll.map((o, i) => (
                  <Row key={i} gap={6}>
                    <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={o} onChangeText={(v) => setPoll(poll.map((x, j) => (j === i ? v : x)))} maxLength={60} placeholder={t('الخيار {0}', [i + 1])} placeholderTextColor={C.faint}
                      style={{ flex: 1, minHeight: 44, borderRadius: 16, backgroundColor: C.soft, paddingHorizontal: 12, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
                    {poll.length > 2 && <Tap onPress={() => setPoll(poll.filter((_, j) => j !== i))} accessibilityLabel={t('شيل الخيار')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={C.muted} /></Tap>}
                  </Row>
                ))}
                {poll.length < 4 && <Tap onPress={() => setPoll([...poll, ''])} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}><Plus size={16} color={C.primary} /><T v="bold" color={C.primary}>{t('ضيف خيار')}</T></Tap>}
              </View>
            )}
            {mode === 'post' && (
              <Row gap={8}>
                <Chip label={t('ملف PDF')} active={!!pdf} onPress={async () => { const f = await pickPdf(); if (f) setPdf(f); }} />
                <Chip label={t('استطلاع')} active={!!poll} onPress={() => setPoll(poll ? null : ['', ''])} />
              </Row>
            )}

            {mode === 'post' && !params.community && (
              <View style={{ gap: 10 }}>
                <T v="bold">{t('بأي قسم؟')}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(CATEGORY).map(([k, v]) => <Chip key={k} label={v.label} dot={v.color} active={cat === k} onPress={() => setCat(k)} />)}
                </View>
              </View>
            )}
            {mode === 'post' && cat === 'lost_found' && (
              <Row gap={8}><Chip label={t('لقيت')} active={lf === 'found'} onPress={() => setLf('found')} /><Chip label={t('ضاع مني')} active={lf === 'lost'} onPress={() => setLf('lost')} /></Row>
            )}
            {mode === 'post' && cat === 'market' && (
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={t('السعر بالدينار')} placeholderTextColor={C.faint}
                style={{ minHeight: 50, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, color: C.ink, textAlign: ta }} />
            )}

            {!params.community && (
              <View style={{ gap: 10 }}>
                <T v="bold">{t('مين بيشوفه؟')}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {auds.map(([k, l], i) => <Chip key={k} label={l} active={aud === i} onPress={() => setAud(i)} />)}
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ---------- step 1: choose ----------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <Row gap={8} style={{ paddingHorizontal: 12, minHeight: 56 }}>
        <Tap onPress={() => router.back()} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={24} color={C.ink} /></Tap>
        <T style={{ flex: 1, textAlign: 'center', fontFamily: F.bodyBold, fontSize: 17 }}>{TITLES[mode]}</T>
        <Tap onPress={next} disabled={!canNext} accessibilityLabel={t('التالي')}
          style={{ minHeight: 38, paddingHorizontal: 20, borderRadius: R.pill, backgroundColor: canNext ? C.primary : C.soft, alignItems: 'center', justifyContent: 'center' }}>
          <T v="bold" color={canNext ? C.onPrimary : C.muted}>{t('التالي')}</T>
        </Tap>
      </Row>

      {mode === 'live' ? (
        <Animated.View entering={FadeIn} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Radio size={38} color={C.primary} /></View>
          <T v="h2" style={{ textAlign: 'center' }}>{t('البث المباشر جاي قريباً')}</T>
          <T v="small" color={C.muted} style={{ textAlign: 'center', maxWidth: 300 }}>{t('عم نشتغل عليه. لهلأ بتقدر تنزّل ستوري أو ريلز.')}</T>
        </Animated.View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {/* big preview of the chosen photo / video */}
          <Tap haptic={false} scale={0.99} onPress={media ? (isStory ? () => setEditing(true) : undefined) : addFromGallery}
            accessibilityLabel={media ? t('المعاينة') : t('اختار من الصور')}
            style={{ marginHorizontal: 12, marginTop: 4, height: mode === 'post' ? Math.min(360, width - 24) : 420, borderRadius: 24, backgroundColor: C.card, borderWidth: media ? 0 : 1, borderColor: C.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {media ? (
              <>
                {media.kind === 'video' ? <VideoPreview key={media.uri} uri={media.uri} /> : <Image source={{ uri: media.uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={150} />}
                {isStory && overlays.length > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}><StoryOverlays items={overlays} width={width - 24} height={420} /></View>}
                {isStory && (
                  <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: 'rgba(7,10,28,0.55)' }}>
                    <Wand2 size={16} color="#fff" /><T v="tiny" color="#fff">{t('عدّل')}</T>
                  </View>
                )}
              </>
            ) : (
              <Animated.View entering={FadeInDown.springify().damping(SPRING.damping)} style={{ alignItems: 'center', gap: 10, padding: 24 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Images size={28} color={C.primary} /></View>
                <T v="bodyMd">{mode === 'reel' ? t('اختار فيديو لحد دقيقة') : mode === 'story' ? t('اختار صورة أو فيديو') : t('اختار صور، أو اكبس التالي لمنشور نص')}</T>
              </Animated.View>
            )}
          </Tap>

          <Row style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10, justifyContent: 'space-between' }}>
            <T v="bold" style={{ fontSize: 15 }}>{mode === 'post' && items.length ? t('{0} من 10', [items.length]) : t('الأحدث')}</T>
            <Tap onPress={fromCamera} accessibilityLabel={t('الكاميرا')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={20} color={C.ink} />
            </Tap>
          </Row>

          {/* chosen items: 4 columns, numbered in the order picked */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, paddingHorizontal: 3 }}>
            {items.map((it, i) => (
              <Tap key={it.uri} haptic={false} scale={0.97} onPress={() => toggleItem(i)} accessibilityLabel={t('الصورة {0}', [i + 1])}
                style={{ width: tile, height: tile, backgroundColor: C.soft, overflow: 'hidden', opacity: i === active ? 1 : 0.85 }}>
                {it.kind === 'video' ? <View style={{ flex: 1, backgroundColor: '#000' }} /> : <Image source={{ uri: it.uri }} style={{ flex: 1 }} contentFit="cover" />}
                <View style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff', backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="tiny" color={C.onPrimary} style={{ fontFamily: F.bodyBold }}>{i + 1}</T>
                </View>
                {i === active && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderWidth: 3, borderColor: C.primary }} />}
              </Tap>
            ))}
            {(mode === 'post' ? items.length < 10 : items.length === 0) && (
              <Tap onPress={addFromGallery} accessibilityLabel={t('ضيف من الصور')}
                style={{ width: tile, height: tile, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Plus size={24} color={C.ink} />
                <T v="tiny" color={C.muted}>{t('من الصور')}</T>
              </Tap>
            )}
          </View>
          {mode === 'story' && (
            <T v="tiny" color={C.muted} style={{ paddingHorizontal: 18, paddingTop: 12 }}>{t('الستوري بتختفي بعد 24 ساعة. الفيديو لحد 15 ثانية، والصور بتقدر تثبّتها بأبرز القصص.')}</T>
          )}
        </ScrollView>
      )}

      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 14, left: 0, right: 0 }} pointerEvents="box-none">
        <ModeSwitch mode={mode} onChange={switchMode} />
      </SafeAreaView>

      <Modal visible={editing && !!media} animationType="slide" onRequestClose={() => setEditing(false)} statusBarTranslucent>
        {media && <StoryEditor media={media} initial={overlays} sharing={busy}
          onCancel={() => { setEditing(false); if (!overlays.length && !items.length) setItems([]); }}
          onDone={(m, o) => { setItems([m]); setOverlays(o); setEditing(false); }}
          onShare={(m, o, audience) => { setItems([m]); setOverlays(o); publish({ m, o, audience }); }} />}
      </Modal>
      {busy && !editing && (
        <Animated.View entering={FadeIn} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.overlay, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: C.card, borderRadius: R.xl, paddingVertical: 24, paddingHorizontal: 32, alignItems: 'center', gap: 6 }}>
            <T v="bold">{isStory ? t('عم نرفع قصتك…') : t('عم ننشر منشورك…')}</T>
            {media?.kind === 'video' && <T v="tiny" color={C.muted}>{t('الفيديو بياخذ ثواني أكثر')}</T>}
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

