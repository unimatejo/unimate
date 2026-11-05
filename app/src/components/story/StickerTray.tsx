import { Image } from 'expo-image';
import { AtSign, BarChart3, ChevronRight, Clock, Hash, Link2, MapPin, MessageCircleQuestion, Search, SlidersHorizontal, Timer } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../ui';
import { useAuth } from '@/lib/auth';
import { EMOJIS, SLIDER_EMOJIS, type Overlay } from '@/lib/storyOverlay';
import { supabase } from '@/lib/supabase';
import { F } from '@/lib/theme';
import { isAR, LOCALE, nm, t } from '@/lib/i18n';

export type NewSticker = { kind: Overlay['kind']; text: string; extra?: Partial<Overlay> };
type Form = 'place' | 'mention' | 'question' | 'poll' | 'slider' | 'countdown' | 'hashtag' | 'link' | null;

const BG = '#1C1C1E', FIELD = 'rgba(255,255,255,0.1)';
const input = { minHeight: 46, borderRadius: 14, backgroundColor: FIELD, paddingHorizontal: 14, color: '#fff', fontFamily: F.body, fontSize: 16, textAlign: (isAR ? 'right' : 'left') as 'right' | 'left' };

function Chip({ icon, label, color, onPress }: { icon: ReactNode; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFFFFF', opacity: pressed ? 0.8 : 1 })}>
      {icon}<Text style={{ fontFamily: F.bodyBold, fontSize: 14, color }}>{label}</Text>
    </Pressable>
  );
}

function Primary({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button"
      style={{ minHeight: 48, borderRadius: 24, backgroundColor: disabled ? 'rgba(255,255,255,0.12)' : '#FF6B4A', alignItems: 'center', justifyContent: 'center' }}>
      {busy ? <ActivityIndicator color="#0E1430" /> : <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: disabled ? 'rgba(255,255,255,0.5)' : '#0E1430' }}>{label}</Text>}
    </Pressable>
  );
}

/** Instagram's sticker tray: search, sticker chips (each opens its little form), then emoji and UniMate stickers. */
export function StickerTray({ open, start, onClose, onPick }: { open: boolean; start?: Form; onClose: () => void; onPick: (s: NewSticker) => void }) {
  const insets = useSafeAreaInsets();
  const { profile, university } = useAuth();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Form>(null);
  const [pack, setPack] = useState<{ id: string; url: string }[]>([]);
  useEffect(() => { if (open) { setForm(start ?? null); setQ(''); } }, [open, start]);
  useEffect(() => {
    if (!open || pack.length) return;
    supabase.from('pack_stickers').select('id, url').order('position').limit(120).then(({ data }) => setPack((data ?? []) as never), () => {});
  }, [open, pack.length]);

  const time = new Date().toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  const chips: { key: string; label: string; color: string; icon: ReactNode; go: () => void }[] = [
    { key: 'place', label: t('الموقع'), color: '#7C3AED', icon: <MapPin size={17} color="#7C3AED" />, go: () => setForm('place') },
    { key: 'mention', label: t('منشن'), color: '#FF6B2C', icon: <AtSign size={17} color="#FF6B2C" />, go: () => setForm('mention') },
    { key: 'question', label: t('سؤال'), color: '#E0306B', icon: <MessageCircleQuestion size={17} color="#E0306B" />, go: () => setForm('question') },
    { key: 'poll', label: t('استطلاع'), color: '#2E5BFF', icon: <BarChart3 size={17} color="#2E5BFF" />, go: () => setForm('poll') },
    { key: 'slider', label: t('سلايدر إيموجي'), color: '#FF3B5C', icon: <SlidersHorizontal size={17} color="#FF3B5C" />, go: () => setForm('slider') },
    { key: 'countdown', label: t('عدّاد تنازلي'), color: '#7C3AED', icon: <Timer size={17} color="#7C3AED" />, go: () => setForm('countdown') },
    { key: 'hashtag', label: t('هاشتاغ'), color: '#FF8A00', icon: <Hash size={17} color="#FF8A00" />, go: () => setForm('hashtag') },
    { key: 'link', label: t('رابط'), color: '#2E5BFF', icon: <Link2 size={17} color="#2E5BFF" />, go: () => setForm('link') },
    { key: 'time', label: time, color: '#0E1430', icon: <Clock size={17} color="#FF3B5C" />, go: () => onPick({ kind: 'time', text: time, extra: { data: { clock: 'pill' } } }) },
  ];
  const ql = q.trim().toLowerCase();
  const shown = ql ? chips.filter((c) => c.label.toLowerCase().includes(ql)) : chips;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => (form ? setForm(null) : onClose())} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={onClose} accessibilityLabel={t('إغلاق')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ height: form ? undefined : '72%', minHeight: form ? 260 : undefined, maxHeight: '86%', backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: 10 }} />
          {form ? (
            <StickerForm form={form} onBack={() => setForm(null)} onPick={onPick} uniName={nm(university) ?? t('الجامعة')} meId={profile?.id} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, gap: 14, paddingBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 12, backgroundColor: FIELD, paddingHorizontal: 12 }}>
                <Search size={17} color="rgba(255,255,255,0.6)" />
                <TextInput value={q} onChangeText={setQ} placeholder={t('بحث')} placeholderTextColor="rgba(255,255,255,0.5)" keyboardAppearance="dark"
                  style={{ flex: 1, color: '#fff', fontFamily: F.body, fontSize: 15, textAlign: isAR ? 'right' : 'left', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {shown.map((c) => <Chip key={c.key} icon={c.icon} label={c.label} color={c.color} onPress={c.go} />)}
              </View>
              {!ql && pack.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                  {pack.map((s) => (
                    <Pressable key={s.id} onPress={() => onPick({ kind: 'sticker', text: '', extra: { size: 0.06, data: { img: s.url } } })} accessibilityLabel={t('ستيكر')}
                      style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}>
                      <Image source={{ uri: s.url }} style={{ width: 68, height: 68 }} contentFit="contain" />
                    </Pressable>
                  ))}
                </View>
              )}
              {!ql && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
                  {EMOJIS.map((e) => (
                    <Pressable key={e} onPress={() => onPick({ kind: 'emoji', text: e, extra: { size: 0.09 } })} accessibilityLabel={e} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 34 }}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Person = { id: string; full_name: string; username: string | null; avatar_url: string | null };
type Place = { id: string; title: string; subtitle: string | null; lat: number | null; lng: number | null };

/** The little form behind each interactive sticker chip. */
function StickerForm({ form, onBack, onPick, uniName, meId }: { form: NonNullable<Form>; onBack: () => void; onPick: (s: NewSticker) => void; uniName: string; meId?: string }) {
  const [a, setA] = useState('');
  const [opts, setOpts] = useState<string[]>([t('آه'), t('لا')]);
  const [emoji, setEmoji] = useState('😍');
  const [when, setWhen] = useState<number>(1);
  const [people, setPeople] = useState<Person[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);

  // mention: the people you follow first, then anyone by username
  useEffect(() => {
    if (form !== 'mention' || !meId) return;
    const s = a.trim().replace(/^@/, '');
    const h = setTimeout(async () => {
      if (!s) {
        const { data } = await supabase.from('follows').select('p:profiles!follows_followee_id_fkey(id, full_name, username, avatar_url)').eq('follower_id', meId).eq('status', 'accepted').limit(30);
        setPeople(((data ?? []) as unknown as { p: Person | null }[]).map((x) => x.p).filter(Boolean) as Person[]);
      } else {
        const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url').or(`username.ilike.${s}%,full_name.ilike.%${s}%`).limit(20);
        setPeople((data ?? []) as Person[]);
      }
    }, 200);
    return () => clearTimeout(h);
  }, [form, a, meId]);
  // location: places on campus
  useEffect(() => {
    if (form !== 'place') return;
    const h = setTimeout(async () => {
      const { data } = await supabase.rpc('campus_search', { q: a.trim() || ' ', lim: 20 });
      setPlaces(((data ?? []) as Place[]).filter((p) => p.title));
    }, 200);
    return () => clearTimeout(h);
  }, [form, a]);

  const title = { place: t('الموقع'), mention: t('منشن'), question: t('سؤال'), poll: t('استطلاع'), slider: t('سلايدر إيموجي'), countdown: t('عدّاد تنازلي'), hashtag: t('هاشتاغ'), link: t('رابط') }[form];
  const ends = (k: number) => {
    const d = new Date();
    if (k === 0) d.setHours(d.getHours() + 1);
    else if (k === 1) { d.setHours(21, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); }
    else if (k === 2) { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    else d.setDate(d.getDate() + 7);
    return d.toISOString();
  };
  const url = a.trim() && !/^https?:\/\//i.test(a.trim()) ? `https://${a.trim()}` : a.trim();
  const validUrl = /^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(url);

  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable onPress={onBack} accessibilityLabel={t('رجوع')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRight size={22} color="#fff" style={isAR ? undefined : { transform: [{ scaleX: -1 }] }} />
        </Pressable>
        <Text style={{ fontFamily: F.title, fontSize: 17, color: '#fff' }}>{title}</Text>
      </View>

      {form === 'question' && (<>
        <TextInput autoFocus value={a} onChangeText={setA} placeholder={t('اسألني سؤال')} placeholderTextColor="rgba(255,255,255,0.5)" style={input} />
        <Primary label={t('ضيف')} onPress={() => onPick({ kind: 'question', text: a.trim() || t('اسألني سؤال'), extra: { size: 0.05 } })} />
      </>)}

      {form === 'poll' && (<>
        <TextInput autoFocus value={a} onChangeText={setA} placeholder={t('اسأل سؤال…')} placeholderTextColor="rgba(255,255,255,0.5)" style={input} />
        {opts.map((o, i) => (
          <TextInput key={i} value={o} onChangeText={(v) => setOpts((l) => l.map((x, k) => (k === i ? v.slice(0, 40) : x)))} placeholder={t('خيار {0}', [String(i + 1)])} placeholderTextColor="rgba(255,255,255,0.5)" style={input} />
        ))}
        {opts.length < 4 && <Pressable onPress={() => setOpts((l) => [...l, ''])} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ fontFamily: F.bodyBold, color: '#FF8A6B' }}>+ {t('ضيف خيار')}</Text></Pressable>}
        <Primary label={t('ضيف')} disabled={opts.filter((o) => o.trim()).length < 2}
          onPress={() => onPick({ kind: 'poll', text: a.trim(), extra: { size: 0.05, data: { options: opts.map((o) => o.trim()).filter(Boolean) } } })} />
      </>)}

      {form === 'slider' && (<>
        <TextInput autoFocus value={a} onChangeText={setA} placeholder={t('شو رأيك…؟')} placeholderTextColor="rgba(255,255,255,0.5)" style={input} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {SLIDER_EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => setEmoji(e)} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === e ? 'rgba(255,255,255,0.2)' : 'transparent' }}><Text style={{ fontSize: 28 }}>{e}</Text></Pressable>
          ))}
        </View>
        <Primary label={t('ضيف')} onPress={() => onPick({ kind: 'slider', text: a.trim(), extra: { size: 0.05, data: { emoji } } })} />
      </>)}

      {form === 'countdown' && (<>
        <TextInput autoFocus value={a} onChangeText={setA} placeholder={t('اسم العدّاد (مثلاً: الامتحان النهائي)')} placeholderTextColor="rgba(255,255,255,0.5)" style={input} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[t('بعد ساعة'), t('الليلة ٩م'), t('بكرة الصبح'), t('بعد أسبوع')].map((l, k) => (
            <Pressable key={l} onPress={() => setWhen(k)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center', backgroundColor: when === k ? '#FFFFFF' : FIELD }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: when === k ? '#000' : '#fff' }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Primary label={t('ضيف')} disabled={!a.trim()} onPress={() => onPick({ kind: 'countdown', text: a.trim(), extra: { size: 0.05, data: { endsAt: ends(when) } } })} />
      </>)}

      {form === 'hashtag' && (<>
        <TextInput autoFocus value={a} onChangeText={(v) => setA(v.replace(/\s+/g, '_').replace(/^#/, ''))} placeholder="#" placeholderTextColor="rgba(255,255,255,0.5)" style={input} autoCapitalize="none" />
        <Primary label={t('ضيف')} disabled={!a.trim()} onPress={() => onPick({ kind: 'hashtag', text: a.trim(), extra: { size: 0.06 } })} />
      </>)}

      {form === 'link' && (<>
        <TextInput autoFocus value={a} onChangeText={setA} placeholder="https://" placeholderTextColor="rgba(255,255,255,0.5)" style={[input, { textAlign: 'left', writingDirection: 'ltr' }]} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Primary label={t('ضيف')} disabled={!validUrl} onPress={() => onPick({ kind: 'link', text: url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0], extra: { size: 0.05, data: { url } } })} />
      </>)}

      {form === 'mention' && (<>
        <TextInput autoFocus value={a} onChangeText={setA} placeholder={t('ابحث عن شخص')} placeholderTextColor="rgba(255,255,255,0.5)" style={input} autoCapitalize="none" autoCorrect={false} />
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {people.map((p) => (
            <Pressable key={p.id} onPress={() => onPick({ kind: 'mention', text: p.username ?? p.full_name, extra: { userId: p.id, size: 0.055 } })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
              <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={40} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bodyBold, fontSize: 15, color: '#fff' }}>{p.full_name}</Text>
                {p.username ? <Text style={{ fontFamily: F.body, fontSize: 13, color: 'rgba(255,255,255,0.6)', writingDirection: 'ltr', textAlign: isAR ? 'right' : 'left' }}>@{p.username}</Text> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </>)}

      {form === 'place' && (<>
        <TextInput autoFocus value={a} onChangeText={setA} placeholder={t('ابحث عن مكان بالحرم')} placeholderTextColor="rgba(255,255,255,0.5)" style={input} />
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => onPick({ kind: 'place', text: uniName, extra: { size: 0.055 } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
            <MapPin size={20} color="#B794F6" /><Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: '#fff' }}>{uniName}</Text>
          </Pressable>
          {places.map((p) => (
            <Pressable key={p.id} onPress={() => onPick({ kind: 'place', text: p.title, extra: { size: 0.055, data: { placeId: p.id, lat: p.lat ?? undefined, lng: p.lng ?? undefined } } })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
              <MapPin size={20} color="rgba(255,255,255,0.6)" />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bodyBold, fontSize: 15, color: '#fff' }}>{p.title}</Text>
                {p.subtitle ? <Text numberOfLines={1} style={{ fontFamily: F.body, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{p.subtitle}</Text> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </>)}
    </View>
  );
}
