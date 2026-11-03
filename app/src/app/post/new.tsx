import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { BarChart3, Camera, FileText, Image as ImageIcon, MapPin, Plus, Video, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar, Button, Chip, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { CATEGORY, C, F } from '@/lib/theme';
import { pickMedia, pickPdf, uploadFile, type Picked } from '@/lib/upload';

const POST_AUD = [['university', 'الجامعة'], ['college', 'كليتي'], ['major', 'تخصصي'], ['friends', 'أصدقائي']] as const;
const STORY_AUD = [['friends', 'أصدقائي'], ['close_friends', 'المقربين'], ['major', 'دفعتي'], ['university', 'الجامعة']] as const;

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
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ uri: string; mime: string; name: string; size: number | null } | null>(null);
  const [poll, setPoll] = useState<string[] | null>(null);
  const isPost = mode === 0;

  async function pick(camera = false, video = false) {
    try { const m = await pickMedia({ camera, video }); if (m) setMedia(m); }
    catch (e) { Alert.alert('ما زبط', (e as Error).message); }
  }

  async function publish() {
    if (!profile?.university_id) return;
    setBusy(true);
    try {
      if (isPost) {
        const opts = poll?.map((o) => o.trim()).filter(Boolean) ?? null;
        if (poll && (!body.trim() || (opts?.length ?? 0) < 2)) { Alert.alert('الاستطلاع', 'اكتب السؤال فوق وخيارين على الأقل.'); setBusy(false); return; }
        if (!body.trim() && !media && !pdf) { Alert.alert('اكتب إشي أو ضيف صورة أو ملف'); setBusy(false); return; }
        const { data: post, error } = await supabase.from('posts').insert({
          author_id: (profile?.id ?? ''), university_id: profile.university_id, community_id: params.community ?? null,
          category: cat, audience: params.community ? 'community' : POST_AUD[aud][0],
          title: title.trim() || null, body: body.trim(),
          price_jod: cat === 'market' && price ? Number(price) : null,
          lost_found: cat === 'lost_found' ? lf : null,
          poll: opts && opts.length >= 2 ? { options: opts.slice(0, 4) } : null,
        }).select('id').single();
        if (error) throw error;
        if (media) {
          const path = await uploadFile('posts', (profile?.id ?? ''), media);
          await supabase.from('post_media').insert({ post_id: post.id, kind: 'image', url: path, size_bytes: media.size ?? null });
        }
        if (pdf) {
          const path = await uploadFile('posts', (profile?.id ?? ''), pdf);
          await supabase.from('post_media').insert({ post_id: post.id, kind: 'file', url: path, file_name: pdf.name, size_bytes: pdf.size, position: 1 });
        }
      } else {
        if (!media) { Alert.alert('ضيف صورة أو فيديو للستوري'); setBusy(false); return; }
        const path = await uploadFile('stories', (profile?.id ?? ''), media);
        const { error } = await supabase.from('stories').insert({
          author_id: (profile?.id ?? ''), university_id: profile.university_id, kind: media.kind, media_url: path,
          duration_sec: media.duration ? Math.ceil(media.duration / 1000) : null, caption: body.trim() || null, audience: STORY_AUD[aud][0],
        });
        if (error) throw error;
      }
      router.back();
    } catch (e) {
      Alert.alert('ما انتشر', (e as Error).message);
    } finally { setBusy(false); }
  }

  const auds = isPost ? POST_AUD : STORY_AUD;
  return (
    <Screen bg={C.white}>
      <Row gap={8} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <Tap onPress={() => router.back()} accessibilityLabel="إلغاء" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={24} color={C.ink} /></Tap>
        <View style={{ flex: 1 }}><Segmented items={['منشور', 'ستوري']} value={mode} onChange={(i) => { setMode(i); setAud(0); setMedia(null); }} /></View>
        <Button title={isPost ? 'نشر' : 'شارك'} loading={busy} onPress={publish} style={{ minHeight: 42, borderRadius: 14, paddingHorizontal: 18 }} />
      </Row>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Row gap={12} center={false}>
            <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={44} />
            <View style={{ flex: 1, gap: 6 }}>
              {isPost && ['market', 'tutoring', 'events', 'opportunities', 'summaries'].includes(cat) && (
                <TextInput value={title} onChangeText={setTitle} placeholder="العنوان" placeholderTextColor={C.faint} style={{ fontFamily: F.title, fontSize: 18, color: C.ink, textAlign: 'right', minHeight: 40 }} />
              )}
              <TextInput value={body} onChangeText={setBody} multiline autoFocus
                placeholder={isPost ? 'شو ببالك؟ اسأل، شارك ملخص، أو احكي للدفعة...' : 'اكتب على الستوري...'} placeholderTextColor={C.faint}
                style={{ fontFamily: F.body, fontSize: 17, lineHeight: 28, color: C.ink, textAlign: 'right', minHeight: 120, textAlignVertical: 'top' }} accessibilityLabel="نص المنشور" />
            </View>
          </Row>

          {media && (
            <Animated.View entering={FadeIn} style={{ borderRadius: 22, overflow: 'hidden', height: 220, backgroundColor: C.bg }}>
              <Image source={{ uri: media.uri }} style={{ flex: 1 }} contentFit="cover" />
              <Tap onPress={() => setMedia(null)} accessibilityLabel="شيل الصورة" style={{ position: 'absolute', top: 10, left: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(14,20,48,0.6)', alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.white} /></Tap>
            </Animated.View>
          )}

          {isPost && pdf && (
            <Row gap={10} style={{ backgroundColor: '#F6F8FC', borderRadius: 16, padding: 12 }}>
              <FileText size={22} color="#E11D48" />
              <T v="bold" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{pdf.name}</T>
              <Tap onPress={() => setPdf(null)} accessibilityLabel="شيل الملف" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.muted} /></Tap>
            </Row>
          )}
          {isPost && poll && (
            <View style={{ gap: 8, backgroundColor: C.violetSoft, borderRadius: 18, padding: 12 }}>
              <T v="bold" color={C.violet}>خيارات الاستطلاع (السؤال هو النص فوق)</T>
              {poll.map((o, i) => (
                <Row key={i} gap={6}>
                  <TextInput value={o} onChangeText={(t) => setPoll(poll.map((x, j) => (j === i ? t : x)))} maxLength={60} placeholder={`الخيار ${i + 1}`} placeholderTextColor={C.faint}
                    style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.white, paddingHorizontal: 12, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: 'right' }} />
                  {poll.length > 2 && <Tap onPress={() => setPoll(poll.filter((_, j) => j !== i))} accessibilityLabel="شيل الخيار" style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={C.muted} /></Tap>}
                </Row>
              ))}
              {poll.length < 4 && <Tap onPress={() => setPoll([...poll, ''])} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}><Plus size={16} color={C.violet} /><T v="bold" color={C.violet}>ضيف خيار</T></Tap>}
            </View>
          )}

          <Row gap={8}>
            {((isPost ? [
              ['صورة', ImageIcon, C.green, C.greenSoft, () => pick()],
              ['كاميرا', Camera, C.pink, C.pinkSoft, () => pick(true)],
              ['ملف PDF', FileText, C.primary, C.primarySoft, async () => { const f = await pickPdf(); if (f) setPdf(f); }],
              ['استطلاع', BarChart3, C.violet, C.violetSoft, () => setPoll(poll ? null : ['', ''])],
            ] : [
              ['كاميرا', Camera, C.pink, C.pinkSoft, () => pick(true, true)],
              ['فيديو 15ث', Video, C.ink, '#EEF0F6', () => pick(false, true)],
              ['صورة', ImageIcon, C.green, C.greenSoft, () => pick()],
            ]) as [string, typeof Camera, string, string, () => void | Promise<void>][]).map(([label, Icon, fg, bg, fn]) => (
              <Tap key={label} onPress={fn} style={{ flex: 1, minHeight: 76, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon size={24} color={fg} /><T v="tiny" color={fg}>{label}</T>
              </Tap>
            ))}
          </Row>

          {isPost && !params.community && (
            <View style={{ gap: 10 }}>
              <T v="bold">بأي قسم؟</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(CATEGORY).map(([k, v]) => <Chip key={k} label={v.label} dot={v.color} active={cat === k} onPress={() => setCat(k)} />)}
              </View>
            </View>
          )}
          {isPost && cat === 'lost_found' && (
            <Row gap={8}><Chip label="لقيت" active={lf === 'found'} onPress={() => setLf('found')} /><Chip label="ضاع مني" active={lf === 'lost'} onPress={() => setLf('lost')} /></Row>
          )}
          {isPost && cat === 'market' && (
            <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="السعر بالدينار" placeholderTextColor={C.faint}
              style={{ minHeight: 50, borderRadius: 16, backgroundColor: C.field, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, textAlign: 'right' }} />
          )}
          {!isPost && (
            <Row gap={8} center={false} style={{ backgroundColor: C.primarySoft, borderRadius: 16, padding: 12 }}>
              <MapPin size={17} color="#1E3A8A" />
              <T v="small" color="#1E3A8A" style={{ flex: 1 }}>الستوري بتختفي بعد 24 ساعة. الفيديو لحد 15 ثانية، والصور بتقدر تثبّتها بأبرز القصص.</T>
            </Row>
          )}

          {!params.community && (
            <View style={{ gap: 8 }}>
              <T v="bold">مين بيشوفه؟</T>
              <Row gap={6}>
                {auds.map(([k, l], i) => (
                  <Tap key={k} onPress={() => setAud(i)} accessibilityRole="radio" accessibilityState={{ selected: aud === i }}
                    style={{ flex: 1, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: aud === i ? 2 : 1, borderColor: aud === i ? C.primary : C.line, backgroundColor: aud === i ? C.primarySoft : C.white }}>
                    <T v="tiny" color={aud === i ? C.primary : C.ink2}>{l}</T>
                  </Tap>
                ))}
              </Row>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
