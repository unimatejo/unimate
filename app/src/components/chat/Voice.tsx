import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState,
} from 'expo-audio';
import { Mic, Pause, Play, Send, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { T, Tap } from '@/components/ui';
import { bubble, subOn } from '@/components/chat/ChatExtras';
import { mediaUrl } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { isAR, t } from '@/lib/i18n';

const MAX_SEC = 120;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Dot() {
  const o = useSharedValue(1);
  useEffect(() => { o.value = withRepeat(withTiming(0.25, { duration: 600 }), -1, true); }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.red }, st]} />;
}

/**
 * Mic button for the chat composer. Tap to record, tap send to send, trash to drop.
 * Gives back a local file and its length; the chat screen uploads it.
 */
export function VoiceRecorder({ onRecorded, onRecording, disabled }: {
  onRecorded: (file: { uri: string; mime: string }, seconds: number) => Promise<void> | void; onRecording?: (on: boolean) => void; disabled?: boolean;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [on, setOn] = useState(false);
  const [sending, setSending] = useState(false);
  const stopping = useRef(false);
  const secs = (state.durationMillis ?? 0) / 1000;

  useEffect(() => { onRecording?.(on); }, [on, onRecording]);
  useEffect(() => { if (on && secs >= MAX_SEC) finish(true); }, [secs, on]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('الوصول إلى الميكروفون غير مسموح'), t('اسمح ليونيميت باستخدام الميكروفون لإرسال رسائل صوتية.'), [
        { text: t('لاحقاً'), style: 'cancel' }, ...(Platform.OS !== 'web' ? [{ text: t('افتح الإعدادات'), onPress: () => Linking.openSettings() }] : []),
      ]);
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setOn(true);
    } catch { Alert.alert(t('تعذّر التسجيل'), t('حاول مرة أخرى.')); }
  }

  async function finish(send: boolean) {
    if (stopping.current) return;
    stopping.current = true;
    const length = secs;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      setOn(false);
      const uri = recorder.uri;
      if (!send || !uri) return;
      if (length < 1) { Alert.alert(t('التسجيل قصير جداً'), t('اضغط على الميكروفون وتحدّث، ثم اضغط إرسال.')); return; }
      const mime = Platform.OS === 'web' ? 'audio/webm' : uri.endsWith('.m4a') || uri.endsWith('.mp4') ? 'audio/m4a' : 'audio/aac';
      setSending(true);
      await onRecorded({ uri, mime }, Math.round(length));
    } catch { Alert.alert(t('لم تُرسل الرسالة الصوتية'), t('حاول مرة أخرى.')); }
    finally { setSending(false); setOn(false); stopping.current = false; }
  }

  if (sending) return <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.onPrimary} /></View>;
  if (!on) {
    return (
      <Tap onPress={start} disabled={disabled} accessibilityLabel={t('سجّل رسالة صوتية')} scale={0.9}
        style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Mic size={21} color={C.ink} strokeWidth={1.8} />
      </Tap>
    );
  }
  return (
    <Animated.View entering={FadeIn} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Tap onPress={() => finish(false)} accessibilityLabel={t('احذف التسجيل')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={19} color={C.red} /></Tap>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 22, backgroundColor: C.soft, paddingHorizontal: 14 }}>
        <Dot />
        <T v="bold" style={{ fontVariant: ['tabular-nums'] }}>{fmt(secs)}</T>
        <T v="tiny" color={C.muted} style={{ flex: 1 }} numberOfLines={1}>{t('جارٍ التسجيل… اضغط إرسال عند الانتهاء')}</T>
      </View>
      <Tap onPress={() => finish(true)} accessibilityLabel={t('إرسال')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Send size={19} color={C.onPrimary} style={isAR ? { transform: [{ scaleX: -1 }] } : undefined} />
      </Tap>
    </Animated.View>
  );
}

const BARS = [8, 14, 20, 12, 24, 18, 10, 22, 16, 26, 12, 8, 18, 24, 14, 10, 20, 16, 12, 22, 8, 14, 18, 10, 12, 8];

/** A voice message in the chat: play/pause, progress over a little waveform, and the length. */
export function VoiceBubble({ path, seconds, mine }: { path: string; seconds: number; mine: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { mediaUrl('chat', path).then(setUri); }, [path]);
  const player = useAudioPlayer(uri ? { uri } : null);
  const st = useAudioPlayerStatus(player);
  const total = st.duration || seconds || 1;
  const pct = Math.min(1, (st.currentTime || 0) / total);
  const fg = mine ? C.onPrimary : C.ink;

  function toggle() {
    if (!uri) return;
    if (st.playing) { player.pause(); return; }
    if (st.didJustFinish || (st.currentTime && st.currentTime >= total - 0.2)) player.seekTo(0);
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    player.play();
  }

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 230, paddingHorizontal: 12, paddingVertical: 8 }, bubble(mine), { borderRadius: 22 }]}>
      <Tap onPress={toggle} disabled={!uri} accessibilityLabel={st.playing ? t('إيقاف الرسالة الصوتية') : t('تشغيل الرسالة الصوتية')} scale={0.9} hitSlop={4}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: mine ? C.onPrimary : C.inverse, alignItems: 'center', justifyContent: 'center' }}>
        {!uri ? <ActivityIndicator size="small" color={mine ? C.primary : C.onInverse} /> : st.playing ? <Pause size={15} color={mine ? C.primary : C.onInverse} fill={mine ? C.primary : C.onInverse} /> : <Play size={15} color={mine ? C.primary : C.onInverse} fill={mine ? C.primary : C.onInverse} style={{ marginStart: 2 }} />}
      </Tap>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 26, direction: 'ltr' }}>
        {BARS.map((h, i) => (
          <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / BARS.length <= pct ? fg : mine ? 'rgba(14,20,48,0.3)' : C.line }} />
        ))}
      </View>
      <T v="tiny" color={subOn(mine)} style={{ fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}>{fmt(st.playing || pct > 0 ? st.currentTime || 0 : total)}</T>
    </View>
  );
}
