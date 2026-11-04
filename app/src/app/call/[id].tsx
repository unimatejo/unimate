import { router, useLocalSearchParams } from 'expo-router';
import { Mic, MicOff, Phone } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { rtTopic } from '@/lib/realtime';
import { C, F } from '@/lib/theme';
import { t } from '@/lib/i18n';

function RingPulse({ delay }: { delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) }), -1, false)); }, [t, delay]);
  const s = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.9 }] }));
  return <Animated.View style={[{ position: 'absolute', width: 130, height: 130, borderRadius: 48, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' }, s]} />;
}

/**
 * Call screen. Signalling (ringing / answered / ended) runs live through the database.
 * Audio and video need a real-time media service and a development build; see docs/calls.md.
 */
export default function CallScreen() {
  const { id, name, kind } = useLocalSearchParams<{ id: string; name: string; kind: 'voice' | 'video' }>();
  const [status, setStatus] = useState('ringing');
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const ch = supabase.channel(rtTopic(`call-${id}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${id}` }, (p) => setStatus((p.new as { status: string }).status))
      .subscribe();
    const miss = setTimeout(async () => { await supabase.from('calls').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', id).eq('status', 'ringing'); }, 30000);
    return () => { supabase.removeChannel(ch); clearTimeout(miss); };
  }, [id]);

  useEffect(() => {
    if (status !== 'active') return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const left = useRef(false);
  const leave = () => { if (left.current) return; left.current = true; if (router.canGoBack()) router.back(); };
  useEffect(() => {
    if (!['ended', 'missed', 'declined'].includes(status)) return;
    const tm = setTimeout(leave, 900);
    return () => clearTimeout(tm);
  }, [status]);
  // leaving the screen while it still rings marks the call as missed
  useEffect(() => () => { supabase.from('calls').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', id).eq('status', 'ringing').then(() => {}); }, [id]);

  async function hangUp() {
    await supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id);
    leave();
  }

  const label = status === 'active' ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : status === 'missed' ? t('ما رد') : status === 'declined' ? t('رفض المكالمة') : status === 'ended' ? t('انتهت المكالمة') : kind === 'video' ? t('مكالمة فيديو... بترن') : t('مكالمة صوتية... بترن');

  return (
    <View style={{ flex: 1, backgroundColor: '#0E1430' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 60, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: C.primary, opacity: 0.35 }} />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 140, left: -100, width: 320, height: 320, borderRadius: 160, backgroundColor: C.pink, opacity: 0.25 }} />
      <SafeAreaView style={{ flex: 1, alignItems: 'center', paddingTop: 80, paddingBottom: 40 }}>
        <View style={{ width: 130, height: 130, alignItems: 'center', justifyContent: 'center' }}>
          {status === 'ringing' && <><RingPulse delay={0} /><RingPulse delay={1000} /></>}
          <Avatar id={name} name={name} size={120} radius={44} />
        </View>
        <T style={{ fontFamily: F.display, fontSize: 28, marginTop: 26 }} color={C.white}>{name}</T>
        <T v="body" color="#C9D1F0" style={{ marginTop: 6 }}>{label}</T>
        <View style={{ marginTop: 'auto', flexDirection: 'row', gap: 22 }}>
          <Tap onPress={() => setMuted((m) => !m)} accessibilityLabel={muted ? t('إلغاء الكتم') : t('كتم')} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: muted ? '#FFFFFF' : 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            {muted ? <MicOff size={26} color="#0E1430" /> : <Mic size={26} color={C.white} />}
          </Tap>
          <Tap onPress={hangUp} accessibilityLabel={t('إنهاء المكالمة')} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FF3B5C', alignItems: 'center', justifyContent: 'center' }}>
            <Phone size={28} color={C.white} style={{ transform: [{ rotate: '135deg' }] }} />
          </Tap>
        </View>
      </SafeAreaView>
    </View>
  );
}
