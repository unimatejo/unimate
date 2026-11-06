import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronDown, ChevronRight, Copy, Crop, Expand, FileText, Images, Plus, Radio, Shrink, Wand2, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Chip, Row, T, Tap } from '@/components/ui';
import { FramedMedia } from '@/components/media/FramedMedia';
import { StoryEditor } from '@/components/story/StoryEditor';
import { StoryOverlays } from '@/components/story/StoryOverlays';
import type { Overlay } from '@/lib/storyOverlay';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { C, CATEGORY, F, isDark, R, SPRING } from '@/lib/theme';
import { autoCrop, openCropper, playLength } from '@/lib/cropper';
import { pickMedia, pickPdf, pickPhotos, uploadFile, uploadPicked, type Picked } from '@/lib/upload';
import { GalleryGrid } from '@/components/create/GalleryGrid';
import { userMessage } from '@/lib/run';
import { takeStoryDraft } from '@/lib/storyDraft';
import { StoryCamera } from '@/components/create/StoryCamera';
import { assetToPicked, cameraModule, galleryAlbums, mediaLibrary, type GalleryAlbum, type GalleryAsset } from '@/lib/nativeMedia';
import { flip, t, ta } from '@/lib/i18n';

const POST_AUD = [['university', t('الجامعة')], ['college', t('كليتي')], ['major', t('تخصصي')], ['friends', t('أصدقائي')]] as const;
const STORY_AUD = [['friends', t('أصدقائي')], ['close_friends', t('المقربين')], ['major', t('تخصصي')], ['university', t('الجامعة')]] as const;

type Mode = 'post' | 'story' | 'reel' | 'live';
const MODES: [Mode, string][] = [['post', t('منشور')], ['story', t('ستوري')], ['reel', t('ريلز')], ['live', t('مباشر')]];
const TITLES: Record<Mode, string> = { post: t('منشور جديد'), story: t('ستوري جديدة'), reel: t('ريلز جديد'), live: t('بث مباشر') };

/** a picked video, framed and trimmed the way it was set in the crop editor */
function VideoPreview({ m }: { m: Picked }) {
  return <FramedMedia uri={m.uri} kind="video" meta={m.meta} />;
}

/** Instagram's mode bar: the words on a dark rounded strip, the current one bright. */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ alignSelf: 'center', flexDirection: 'row', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, backgroundColor: 'rgba(18,18,22,0.88)' }}>
      {MODES.map(([k, label]) => (
        <Tap key={k} haptic onPress={() => k !== mode && onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: k === mode }} scale={0.94}
          style={{ minWidth: 64, minHeight: 38, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
          <T v="bold" color={k === mode ? '#FFFFFF' : 'rgba(255,255,255,0.5)'} style={{ fontSize: 14, letterSpacing: 0.2 }}>{label}</T>
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
  // like Instagram: the first photo's shape (1:1, 4:5, …) is used for every photo of the post
  const [postAspect, setPostAspect] = useState<number | null>(null);
  const isStory = mode === 'story';
  const maxSec = mode === 'reel' ? 60 : 15;
  const cropMode = isStory ? 'story' : 'post';
  const media = items[active] ?? items[0] ?? null;

  // ---- the phone's gallery under the preview (Instagram); missing on web and older app builds ----
  const gallery = !!mediaLibrary();
  const camera = !!cameraModule();
  /** gallery ids of the chosen items, same order as `items` (camera shots get their own ids) */
  const [sel, setSel] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [album, setAlbum] = useState<GalleryAlbum | null>(null);
  const [albums, setAlbums] = useState<GalleryAlbum[] | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  /** square (Instagram's default) or the photo's own shape */
  const [fit, setFit] = useState<'square' | 'original'>('square');
  const [camOpen, setCamOpen] = useState(false);
  const pickSeq = useRef(0);

  // a photo/video already picked from the stories row ("+" on the web): straight to the editor, full screen
  useEffect(() => {
    if (!isStory) return;
    const d = takeStoryDraft();
    if (!d) return;
    (async () => {
      let m: Picked | null = d;
      if (d.kind === 'video') { const r = await openCropper(d, { mode: 'story', maxSec }); m = r ? { ...r.media, aspect: r.aspect } : null; }
      if (!m) return;
      setItems([m]); setActive(0); setOverlays([]); setEditing(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchMode(m: Mode) {
    setMode(m); setStep('pick'); setItems([]); setActive(0); setOverlays([]); setAud(0); setPdf(null); setPoll(null); setPostAspect(null);
    setSel([]); setMulti(false); setFit('square'); setCamOpen(false);
  }

  /** the frame shape for a post: square, or the first photo's own shape kept between 4:5 and 1.91:1 like Instagram */
  const first = items[0];
  const naturalAspect = first?.width && first?.height ? Math.min(1.91, Math.max(0.8, first.width / first.height)) : 1;
  const frameAspect = mode === 'reel' ? 9 / 16 : postAspect ?? (fit === 'square' ? 1 : naturalAspect);

  const pickAsset = useCallback(async (a: GalleryAsset) => {
    if (mode === 'reel' && a.mediaType !== 'video') return;
    // a long video is never refused: the editor opens on it and the student keeps the part they want
    const i = sel.indexOf(a.id);
    if (multi && mode === 'post') {
      // tap a chosen one again: show it first, then a second tap takes it out
      if (i >= 0) {
        if (items[active] && sel[active] === a.id) {
          Haptics.selectionAsync().catch(() => {});
          setItems((cur) => cur.filter((_, j) => j !== i)); setSel((cur) => cur.filter((x) => x !== a.id)); setActive(0);
        } else setActive(i);
        return;
      }
      if (sel.length >= 10) { Alert.alert(t('10 بالكثير'), t('بتقدر تختار لحد 10 صور وفيديوهات.')); return; }
    } else if (i >= 0) return;
    const seq = ++pickSeq.current;
    setLoadingId(a.id);
    try {
      let m = await assetToPicked(a);
      if (seq !== pickSeq.current && !multi) return;
      if (m.kind === 'video' && (m.duration ?? 0) > 60_500) {
        const r = await openCropper(m, { mode: 'post', aspect: mode === 'reel' ? 9 / 16 : null, maxSec: 60 });
        if (!r) return;
        m = r.media;
      }
      Haptics.selectionAsync().catch(() => {});
      if (multi && mode === 'post') {
        setItems((cur) => [...cur, m].slice(0, 10)); setSel((cur) => [...cur, a.id].slice(0, 10)); setActive(sel.length);
      } else {
        setItems([m]); setSel([a.id]); setActive(0); setPostAspect(null);
      }
    } catch (e) { Alert.alert(t('ما زبط'), userMessage(e)); }
    finally { if (seq === pickSeq.current) setLoadingId(null); }
  }, [mode, sel, multi, items, active]);

  const onFirstAsset = useCallback((a: GalleryAsset | null) => { if (a && !items.length && (mode !== 'reel' || a.mediaType === 'video')) pickAsset(a); }, [items.length, mode, pickAsset]);

  function toggleMulti() {
    Haptics.selectionAsync().catch(() => {});
    if (multi) { setItems((cur) => cur.slice(active, active + 1)); setSel((cur) => cur.slice(active, active + 1)); setActive(0); }
    setMulti(!multi);
  }
  async function openAlbums() {
    setAlbumOpen(true);
    if (!albums) setAlbums(await galleryAlbums());
  }
  /** shots from the in-app camera join the chosen items like gallery picks */
  async function fromInAppCamera(m: Picked) {
    setCamOpen(false);
    if (mode === 'reel' && m.kind !== 'video') return;
    const id = `cam-${Date.now()}`;
    if (multi && mode === 'post') { setItems((cur) => [...cur, m].slice(0, 10)); setSel((cur) => [...cur, id].slice(0, 10)); setActive(items.length); }
    else { setItems([m]); setSel([id]); setActive(0); setPostAspect(null); }
  }
  /** story camera: photos go straight to the editor; videos are trimmed to 15s first */
  async function storyShot(m: Picked) {
    let out: Picked | null = m;
    if (m.kind === 'video') { const r = await openCropper(m, { mode: 'story', maxSec }); out = r ? { ...r.media, aspect: r.aspect } : null; }
    if (!out) return;
    setItems([out]); setActive(0); setOverlays([]); setEditing(true);
  }

  async function addFromGallery() {
    try {
      if (mode === 'post') {
        const ps = await pickPhotos(10 - items.length);
        if (!ps.length) return;
        let aspect = postAspect;
        let list: Picked[];
        if (aspect == null) {
          // the first photo opens the crop editor; its shape is used for the rest (each can be adjusted by tapping it)
          const r = await openCropper(ps[0], { mode: 'post' });
          if (!r) return;
          aspect = r.aspect;
          setPostAspect(aspect);
          list = [r.media, ...(await Promise.all(ps.slice(1).map((p) => autoCrop(p, aspect as number))))];
        } else list = await Promise.all(ps.map((p) => autoCrop(p, aspect as number)));
        setItems((cur) => [...cur, ...list].slice(0, 10)); setActive(items.length);
      } else {
        // stories: photos go straight to the story editor (it frames them freely, like Instagram); videos are trimmed first
        const m = isStory ? await storyPick(false) : await pickMedia({ video: true, videoOnly: mode === 'reel', maxSec, crop: cropMode, aspect: mode === 'reel' ? 9 / 16 : null });
        if (!m) return;
        if (mode === 'reel' && m.kind !== 'video') { Alert.alert(t('الريلز فيديو'), t('اختار فيديو لحد دقيقة.')); return; }
        setItems([m]); setActive(0);
        if (isStory) { setOverlays([]); setEditing(true); }
      }
    } catch (e) { Alert.alert(t('ما زبط'), userMessage(e)); }
  }
  async function storyPick(camera: boolean): Promise<Picked | null> {
    const p = await pickMedia({ video: true, camera, maxSec, anyLength: !camera });
    if (!p || p.kind !== 'video') return p;
    const r = await openCropper(p, { mode: 'story', maxSec });
    return r ? { ...r.media, aspect: r.aspect } : null;
  }
  async function fromCamera() {
    try {
      const m = isStory ? await storyPick(true) : await pickMedia({ camera: true, video: mode !== 'post', videoOnly: mode === 'reel', maxSec, crop: cropMode, aspect: mode === 'reel' ? 9 / 16 : mode === 'post' ? postAspect : null });
      if (!m) return;
      if (mode === 'post') { if (postAspect == null && m.aspect) setPostAspect(m.aspect); setItems((cur) => [...cur, m].slice(0, 10)); setActive(items.length); return; }
      setItems([m]); setActive(0);
      if (isStory) { setOverlays([]); setEditing(true); }
    } catch (e) { Alert.alert(t('ما زبط'), userMessage(e)); }
  }
  function toggleItem(i: number) {
    // tap a chosen photo to see it; tap it again to crop it again (the × takes it out)
    if (i !== active) { setActive(i); return; }
    recrop(i);
  }
  function removeItem(i: number) {
    Haptics.selectionAsync().catch(() => {});
    setItems((cur) => { const n = cur.filter((_, j) => j !== i); if (!n.length) setPostAspect(null); return n; });
    setActive(0);
  }
  /** open the crop editor again for one item (from the full original photo); with several photos the shape stays the same */
  async function recrop(i: number) {
    const it = items[i];
    if (!it) return;
    if (isStory) { setEditing(true); return; }
    const r = await openCropper(it, { mode: 'post', aspect: mode === 'reel' ? 9 / 16 : items.length > 1 ? postAspect : null, maxSec });
    if (!r) return;
    let next = items.map((x, j) => (j === i ? r.media : x));
    if (items.length === 1 && mode === 'post') setPostAspect(r.aspect);
    else if (items.length > 1 && postAspect && Math.abs(r.aspect - postAspect) > 0.01) next = await Promise.all(next.map((x, j) => (j === i ? x : autoCrop(x, r.aspect))));
    setItems(next);
  }

  const [preparing, setPreparing] = useState(false);
  async function next() {
    if (mode === 'live' || preparing) return;
    if (mode === 'reel' && !media) { addFromGallery(); return; }
    if (isStory && !media) { addFromGallery(); return; }
    if (isStory && media) { setEditing(true); return; }
    if (gallery && items.length) {
      setPreparing(true);
      try {
        if (mode === 'reel') {
          // reels: frame + trim in the editor (9:16, up to a minute) unless already done
          if (!media?.meta) { const r = await openCropper(media!, { mode: 'post', aspect: 9 / 16, maxSec }); if (!r) return; setItems([r.media]); }
        } else {
          // photos picked from the grid are cut to the post's frame (the ones cropped by hand stay as they are)
          const a = postAspect ?? frameAspect;
          setPostAspect(a);
          const out = await Promise.all(items.map((m) => (m.orig || m.meta ? m : autoCrop(m, a))));
          setItems(out);
        }
      } finally { setPreparing(false); }
    }
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
        const up = await uploadPicked('stories', profile.id, m);
        const row = {
          author_id: profile.id, university_id: profile.university_id, kind: m.kind, media_url: up.path,
          duration_sec: playLength(m), caption: (m.meta?.caption ?? body.trim()) || null,
          audience: story?.audience ?? STORY_AUD[aud][0], overlays: story?.o ?? overlays, meta: up.meta,
        };
        // the file is up: try saving the story a few times so a short network drop doesn't lose it
        let error: unknown = null;
        for (let i = 0; i < 3; i++) {
          ({ error } = await supabase.from('stories').insert(row));
          if (!error) break;
          await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        }
        if (error) throw error;
      } else {
        const opts = poll?.map((o) => o.trim()).filter(Boolean) ?? null;
        if (poll && (!body.trim() || (opts?.length ?? 0) < 2)) { Alert.alert(t('الاستطلاع'), t('اكتب السؤال فوق وخيارين على الأقل.')); setBusy(false); return; }
        if (mode === 'post' && !body.trim() && !items.length && !pdf) { Alert.alert(t('اكتب إشي أو ضيف صورة أو ملف')); setBusy(false); return; }
        if (mode === 'reel' && !media) { Alert.alert(t('اختار فيديو للريلز')); setBusy(false); return; }
        // upload files first, so a failed upload never leaves an empty post behind
        const ups = await Promise.all(items.map((m) => uploadPicked('posts', profile.id, m)));
        const paths = ups.map((u) => u.path);
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
          ...paths.map((url, i) => ({ post_id: post.id, kind: items[i].kind, url, position: i + 2, file_name: null as string | null, size_bytes: null as number | null, meta: ups[i].meta })),
          ...(pdfPath && pdf ? [{ post_id: post.id, kind: 'file', url: pdfPath, position: 1, file_name: pdf.name, size_bytes: pdf.size, meta: null }] : []),
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
      Alert.alert(t('ما انتشر'), userMessage(e));
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
                  {media.kind === 'video' ? <VideoPreview m={media} /> : <Image source={{ uri: media.uri }} style={{ flex: 1 }} contentFit="cover" />}
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

  const albumSheet = (
    <Modal visible={albumOpen} transparent animationType="fade" onRequestClose={() => setAlbumOpen(false)}>
      <Pressable onPress={() => setAlbumOpen(false)} style={{ flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' }}>
        <Pressable style={{ maxHeight: '70%', backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingBottom: 28 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: 8 }} />
          <T v="bold" style={{ textAlign: 'center', fontSize: 16, paddingBottom: 8 }}>{t('الألبومات')}</T>
          {albums === null ? <ActivityIndicator color={C.muted} style={{ padding: 24 }} /> : (
            <FlatList data={[{ id: '', title: t('الأحدث'), count: 0 }, ...albums]} keyExtractor={(a) => a.id || 'recent'}
              renderItem={({ item }) => (
                <Tap haptic onPress={() => { setAlbum(item.id ? item : null); setAlbumOpen(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 20 }}>
                  <T v={(album?.id ?? '') === item.id ? 'bold' : 'body'}>{item.title}</T>
                  {item.count > 0 && <T v="small" color={C.muted}>{item.count}</T>}
                </Tap>
              )} />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
  const editorModal = (
    <Modal visible={editing && !!media} animationType="slide" onRequestClose={() => setEditing(false)} statusBarTranslucent>
      {media && <StoryEditor media={media} initial={overlays} sharing={busy}
        onCancel={() => { setEditing(false); if (!overlays.length && !items.length) setItems([]); }}
        onDone={(m, o) => { setItems([m]); setOverlays(o); setEditing(false); }}
        onShare={(m, o, audience) => { setItems([m]); setOverlays(o); publish({ m, o, audience }); }} />}
    </Modal>
  );
  const busyOverlay = busy && !editing ? (
    <Animated.View entering={FadeIn} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.overlay, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ backgroundColor: C.card, borderRadius: R.xl, paddingVertical: 24, paddingHorizontal: 32, alignItems: 'center', gap: 6 }}>
        <T v="bold">{isStory ? t('عم نرفع قصتك…') : t('عم ننشر منشورك…')}</T>
        {media?.kind === 'video' && <T v="tiny" color={C.muted}>{t('الفيديو بياخذ ثواني أكثر')}</T>}
      </View>
    </Animated.View>
  ) : null;
  const modeBar = (
    <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 14, left: 0, right: 0 }} pointerEvents="box-none">
      <ModeSwitch mode={mode} onChange={switchMode} />
    </SafeAreaView>
  );

  // ---------- story: the camera opens straight away (Instagram); its gallery button slides the photos up from below ----------
  if (isStory && camera) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StoryCamera maxSec={15} onPicked={storyShot} onClose={() => (router.canGoBack() ? router.back() : router.replace('/community'))}
          onSystemPicker={addFromGallery} footer={<ModeSwitch mode={mode} onChange={switchMode} />} />
        {editorModal}
        {busyOverlay}
      </View>
    );
  }

  // ---------- post / reel with the phone's gallery right under the preview (Instagram) ----------
  if (gallery && (mode === 'post' || mode === 'reel')) {
    const pw = mode === 'reel' ? Math.min(width, 440 * 9 / 16) : width;
    const ph = mode === 'reel' ? pw * 16 / 9 : Math.min(width / frameAspect, width * 1.25);
    const header = (
      <View>
        <View style={{ width: pw, height: ph, alignSelf: 'center', backgroundColor: C.soft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {media ? (
            <Animated.View key={media.uri} entering={FadeIn.duration(180)} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
              {media.kind === 'image' && !media.meta
                ? <Image source={{ uri: media.uri }} style={{ flex: 1 }} contentFit={mode === 'reel' ? 'cover' : 'cover'} transition={120} />
                : <FramedMedia key={media.uri + JSON.stringify(media.meta ?? {})} uri={media.uri} kind={media.kind} meta={media.meta} />}
            </Animated.View>
          ) : <ActivityIndicator color={C.muted} />}
          {media && (
            <Tap onPress={() => recrop(active)} accessibilityLabel={t('قص')} style={{ position: 'absolute', bottom: 12, ...(Platform.OS === 'web' ? { left: 12 } : { start: 12 }), flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: 'rgba(7,10,28,0.6)' }}>
              <Crop size={15} color="#fff" /><T v="tiny" color="#fff">{t('قص')}</T>
            </Tap>
          )}
          {media && mode === 'post' && postAspect == null && (
            <Tap onPress={() => { Haptics.selectionAsync().catch(() => {}); setFit((f) => (f === 'square' ? 'original' : 'square')); }}
              accessibilityLabel={fit === 'square' ? t('الحجم الأصلي') : t('مربّع')}
              style={{ position: 'absolute', bottom: 12, ...(Platform.OS === 'web' ? { right: 12 } : { end: 12 }), width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(7,10,28,0.6)', alignItems: 'center', justifyContent: 'center' }}>
              {fit === 'square' ? <Expand size={16} color="#fff" /> : <Shrink size={16} color="#fff" />}
            </Tap>
          )}
        </View>
        <Row style={{ paddingStart: 14, paddingEnd: 10, paddingVertical: 8, justifyContent: 'space-between' }}>
          <Tap onPress={openAlbums} accessibilityLabel={t('اختار ألبوم')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
            <T v="bold" style={{ fontSize: 16 }}>{album?.title ?? t('الأحدث')}</T><ChevronDown size={18} color={C.ink} />
          </Tap>
          <Row gap={8}>
            {mode === 'post' && (
              <Tap onPress={toggleMulti} accessibilityLabel={t('اختيار أكثر من وحدة')} accessibilityState={{ selected: multi }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: multi ? C.primary : C.card, borderWidth: multi ? 0 : 1, borderColor: C.line }}>
                <Copy size={15} color={multi ? C.onPrimary : C.ink} />
                <T v="tiny" color={multi ? C.onPrimary : C.ink}>{multi ? t('{0} من 10', [items.length]) : t('اختار أكثر')}</T>
              </Tap>
            )}
            <Tap onPress={() => (camera ? setCamOpen(true) : fromCamera())} accessibilityLabel={t('الكاميرا')}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={18} color={C.ink} />
            </Tap>
          </Row>
        </Row>
      </View>
    );
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
        <Row gap={8} style={{ paddingHorizontal: 12, minHeight: 52 }}>
          <Tap onPress={() => router.back()} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={24} color={C.ink} /></Tap>
          <T style={{ flex: 1, textAlign: 'center', fontFamily: F.bodyBold, fontSize: 17 }}>{TITLES[mode]}</T>
          <Tap onPress={next} disabled={preparing || (mode === 'reel' && !media)} accessibilityLabel={t('التالي')}
            style={{ minHeight: 44, minWidth: 64, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', opacity: preparing || (mode === 'reel' && !media) ? 0.4 : 1 }}>
            {preparing ? <ActivityIndicator color={C.blue} size="small" /> : <T v="bold" color={C.blue} style={{ fontSize: 16 }}>{t('التالي')}</T>}
          </Tap>
        </Row>
        <GalleryGrid key={`${mode}|${album?.id ?? ''}`} kind={mode === 'reel' ? 'video' : 'all'} album={album?.id ?? null} selected={sel} multi={multi && mode === 'post'}
          activeId={sel[active] ?? null} busyId={loadingId} onPick={pickAsset} header={header} onFirst={onFirstAsset} contentBottom={110} />
        {modeBar}

        {albumSheet}
        <Modal visible={camOpen} animationType="slide" onRequestClose={() => setCamOpen(false)} statusBarTranslucent>
          {camOpen && <StoryCamera maxSec={maxSec} videoOnly={mode === 'reel'} onPicked={fromInAppCamera} onClose={() => setCamOpen(false)}
            onSystemPicker={() => { setCamOpen(false); addFromGallery(); }} />}
        </Modal>
        {busyOverlay}
      </SafeAreaView>
    );
  }

  // ---------- story without the in-app camera (web): a dark full screen with the camera and the photos, like Instagram ----------
  if (isStory && !camera) {
    return (
      <View style={{ flex: 1, backgroundColor: '#05070F' }}>
        <LinearGradient colors={['#1B1F4B', '#05070F']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <SafeAreaView style={{ flex: 1 }}>
          <Row style={{ paddingHorizontal: 12, minHeight: 56 }}>
            <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={26} color="#fff" /></Tap>
            <T style={{ flex: 1, textAlign: 'center', fontFamily: F.bodyBold, fontSize: 17 }} color="#fff">{TITLES.story}</T>
            <View style={{ width: 44 }} />
          </Row>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 28, paddingBottom: 90 }}>
            <Tap onPress={addFromGallery} scale={0.96} accessibilityLabel={t('اختار من الصور')}
              style={{ width: '100%', maxWidth: 340, minHeight: 120, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Images size={34} color="#fff" />
              <T v="bold" color="#fff" style={{ fontSize: 17 }}>{t('من الصور والفيديوهات')}</T>
            </Tap>
            <Tap onPress={fromCamera} scale={0.96} accessibilityLabel={t('صوّر')}
              style={{ width: '100%', maxWidth: 340, minHeight: 64, borderRadius: 22, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Camera size={22} color="#05070F" />
              <T v="bold" color="#05070F" style={{ fontSize: 16 }}>{t('صوّر هلأ')}</T>
            </Tap>
            <T v="tiny" color="rgba(255,255,255,0.6)" style={{ textAlign: 'center', maxWidth: 300 }}>{t('بعدها بتحرّك الصورة وتكبّرها بإصبعين، وبتضيف نص وملصقات. الستوري بتختفي بعد 24 ساعة.')}</T>
          </View>
        </SafeAreaView>
        {modeBar}
        {editorModal}
        {busyOverlay}
      </View>
    );
  }

  // ---------- step 1 without the phone's gallery (web, older app builds): the system picker ----------
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
            style={{ marginHorizontal: 12, marginTop: 4, height: mode === 'post' ? Math.min(420, (width - 24) / (postAspect ?? 1)) : 420, ...(mode === 'post' ? {} : { width: Math.min(width - 24, 420 * 9 / 16), alignSelf: 'center' }), borderRadius: 24, backgroundColor: C.card, borderWidth: media ? 0 : 1, borderColor: C.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {media ? (
              <>
                <FramedMedia key={media.uri + JSON.stringify(media.meta ?? {})} uri={media.uri} kind={media.kind} meta={media.meta} />
                {isStory && overlays.length > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}><StoryOverlays items={overlays} width={Math.min(width - 24, 420 * 9 / 16)} height={420} /></View>}
                {isStory && (
                  <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: 'rgba(7,10,28,0.55)' }}>
                    <Wand2 size={16} color="#fff" /><T v="tiny" color="#fff">{t('عدّل')}</T>
                  </View>
                )}
                {!isStory && (
                  <Tap onPress={() => recrop(active)} accessibilityLabel={t('قص')} style={{ position: 'absolute', bottom: 12, ...(Platform.OS === 'web' ? { left: 12 } : { start: 12 }), flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: 'rgba(7,10,28,0.6)' }}>
                    <Crop size={16} color="#fff" /><T v="tiny" color="#fff">{t('قص')}</T>
                  </Tap>
                )}
              </>
            ) : (
              <Animated.View entering={FadeInDown.springify().damping(SPRING.damping)} style={{ alignItems: 'center', gap: 10, padding: 24 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Images size={28} color={C.primary} /></View>
                <T v="h3" style={{ textAlign: 'center' }}>{t('اختر من جهازك')}</T>
                <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{mode === 'reel' ? t('اختار فيديو لحد دقيقة') : mode === 'story' ? t('اختار صورة أو فيديو') : t('اختار صور، أو اكبس التالي لمنشور نص')}</T>
              </Animated.View>
            )}
          </Tap>

          <Row style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10, justifyContent: 'space-between' }}>
            <T v="bold" style={{ fontSize: 15 }}>{mode === 'post' && items.length ? t('{0} من 10', [items.length]) : t('الأحدث')}</T>
            <Tap onPress={() => (camera && !isStory ? setCamOpen(true) : fromCamera())} accessibilityLabel={t('الكاميرا')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
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
                {i === active && (
                  <Tap onPress={() => removeItem(i)} accessibilityLabel={t('شيل الصورة')} hitSlop={8}
                    style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(5,7,15,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={15} color="#fff" />
                  </Tap>
                )}
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

      {modeBar}
      <Modal visible={camOpen} animationType="slide" onRequestClose={() => setCamOpen(false)} statusBarTranslucent>
        {camOpen && <StoryCamera maxSec={maxSec} videoOnly={mode === 'reel'} onPicked={fromInAppCamera} onClose={() => setCamOpen(false)}
          onSystemPicker={() => { setCamOpen(false); addFromGallery(); }} />}
      </Modal>
      {editorModal}
      {busyOverlay}
    </SafeAreaView>
  );
}
