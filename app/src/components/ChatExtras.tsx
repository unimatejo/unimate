import * as Haptics from 'expo-haptics';
import { Heart } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, SlideInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Row, T, Tap } from './ui';
import { C, SPRING, shadow } from '@/lib/theme';
import { isAR, rtlLayout, t } from '@/lib/i18n';

// ---------- bubble look (shared by every message kind) ----------
/** Mine: coral accent with navy text; theirs: surface 2. Round 20 with a 6px "tail" corner on the sender's side. */
export function bubble(mine: boolean, bg?: string): ViewStyle {
  // mine sits at the end edge (left in Arabic), theirs at the start edge
  const endIsLeft = rtlLayout();
  const tail = mine ? (endIsLeft ? 'borderBottomLeftRadius' : 'borderBottomRightRadius') : (endIsLeft ? 'borderBottomRightRadius' : 'borderBottomLeftRadius');
  return { borderRadius: 20, [tail]: 6, backgroundColor: bg ?? (mine ? C.primary : C.soft) };
}
export const inkOn = (mine: boolean) => (mine ? C.onPrimary : C.ink);
export const subOn = (mine: boolean) => (mine ? 'rgba(14,20,48,0.68)' : C.muted);

/** "Today", "Yesterday", weekday, or a date: the separator between days. */
export function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  const time = d.toLocaleTimeString(isAR ? 'ar-JO' : 'en-GB', { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `${t('اليوم')} ${time}`;
  if (diff === 1) return `${t('مبارح')} ${time}`;
  if (diff < 7) return `${d.toLocaleDateString(isAR ? 'ar-JO' : 'en-GB', { weekday: 'long' })} ${time}`;
  return d.toLocaleDateString(isAR ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
export function DateSep({ iso }: { iso: string }) {
  return <T v="tiny" color={C.muted} style={{ alignSelf: 'center', paddingTop: 10, paddingBottom: 6 }}>{dayLabel(iso)}</T>;
}

/** Big heart that pops and fades over a message after a double-tap. */
export function HeartBurst({ onDone }: { onDone: () => void }) {
  const sc = useSharedValue(0), op = useSharedValue(1);
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    sc.value = withSequence(withSpring(1.25, { damping: 9, stiffness: 320 }), withSpring(1, SPRING));
    op.value = withSequence(withTiming(1, { duration: 420 }), withTiming(0, { duration: 260 }, (f) => { if (f) runOnJS(onDone)(); }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: sc.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }, a]}>
      <Heart size={46} color="#FF5470" fill="#FF5470" />
    </Animated.View>
  );
}

// ---------- bottom sheet you can drag down to close ----------
/** A modal bottom sheet: tap outside or drag it down to close. */
export function SheetModal({ open, onClose, children, style, dim = true }: { open: boolean; onClose: () => void; children: ReactNode; style?: StyleProp<ViewStyle>; dim?: boolean }) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  useEffect(() => { if (open) y.value = 0; }, [open, y]);
  const pan = usePanGesture({
    activeOffsetY: 8,
    failOffsetX: [-24, 24],
    onUpdate: (e) => { 'worklet'; y.value = Math.max(0, e.translationY); },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 110 || e.velocityY > 900) y.value = withTiming(900, { duration: 220 }, (f) => { if (f) runOnJS(onClose)(); });
      else y.value = withSpring(0, SPRING);
    },
  });
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: dim ? C.overlay : 'transparent' }} onPress={onClose} accessibilityLabel={t('إغلاق')} />
        <GestureDetector gesture={pan}>
          <Animated.View entering={SlideInDown.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)}
            style={[{ backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: C.line, padding: 18, paddingTop: 10, paddingBottom: insets.bottom + 22, gap: 12 }, style, a]}>
            <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 4 }} />
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'] as const;
export type Reaction = { user_id: string; emoji: string };
type Person = { full_name: string; avatar_url: string | null };

/** The little emoji pill under a bubble: each emoji once, and how many people reacted. */
export function ReactionChips({ list, mine, me, onPress }: { list: Reaction[]; mine: boolean; me?: string; onPress: () => void }) {
  if (!list.length) return null;
  const kinds = [...new Set(list.map((r) => r.emoji))].slice(0, 3);
  const minePicked = list.some((r) => r.user_id === me);
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', marginTop: -12, marginHorizontal: 10, zIndex: 2 }}>
      <Tap onPress={onPress} haptic={false} accessibilityLabel={t('مين تفاعل')} hitSlop={10}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, height: 24, borderRadius: 12, backgroundColor: C.soft, borderWidth: 2, borderColor: minePicked ? C.primary : C.bg }}>
        <T style={{ fontSize: 13 }}>{kinds.join('')}</T>
        {list.length > 1 && <T v="tiny" color={C.muted} style={{ fontSize: 11 }}>{list.length}</T>}
      </Tap>
    </Animated.View>
  );
}

/** Long-press menu: a row of reactions on top (like Instagram), the message's actions below. */
export function MessageMenu({ open, onClose, picked, onReact, actions }: {
  open: boolean; onClose: () => void; picked?: string | null; onReact: (e: string) => void;
  actions: { label: string; danger?: boolean; onPress: () => void }[];
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: C.overlay, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Animated.View entering={ZoomIn.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)} style={[{ alignSelf: 'center', flexDirection: 'row', gap: 4, backgroundColor: C.card, borderRadius: 32, padding: 6, borderWidth: 1, borderColor: C.line }, shadow]}>
          {REACTIONS.map((e, i) => (
            <Animated.View key={e} entering={ZoomIn.delay(i * 30).springify().damping(14)}>
            <Tap onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onReact(e); onClose(); }} scale={0.8} haptic={false} accessibilityLabel={e}
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: picked === e ? C.soft : 'transparent' }}>
              <T style={{ fontSize: 28, lineHeight: 34 }}>{e}</T>
            </Tap>
            </Animated.View>
          ))}
        </Animated.View>
        <Animated.View entering={FadeIn.delay(60)} style={[{ alignSelf: 'center', width: '100%', maxWidth: 320, backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.line }, shadow]}>
          {actions.map((a, i) => (
            <Tap key={a.label} haptic={false} onPress={() => { onClose(); a.onPress(); }}
              style={{ minHeight: 52, paddingHorizontal: 18, justifyContent: 'center', borderTopWidth: i ? 0.5 : 0, borderTopColor: C.line }}>
              <T v="bodyMd" color={a.danger ? C.red : C.ink}>{a.label}</T>
            </Tap>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Who reacted with what. */
export function ReactionsSheet({ list, people, me, onClose, onRemove }: {
  list: Reaction[] | null; people: Record<string, Person>; me?: string; onClose: () => void; onRemove: () => void;
}) {
  return (
    <SheetModal open={!!list} onClose={onClose} style={{ gap: 6 }}>
      <T v="h3">{t('التفاعلات')}</T>
      {(list ?? []).map((r) => {
        const p = people[r.user_id];
        const isMe = r.user_id === me;
        return (
          <Tap key={r.user_id} disabled={!isMe} onPress={() => { onRemove(); onClose(); }} haptic={false}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
            <Avatar id={r.user_id} name={p?.full_name ?? ''} url={p?.avatar_url ?? null} size={40} />
            <View style={{ flex: 1 }}>
              <T v="bodyMd">{isMe ? t('إنت') : p?.full_name ?? ''}</T>
              {isMe && <T v="tiny" color={C.muted}>{t('اكبس لتشيله')}</T>}
            </View>
            <T style={{ fontSize: 26 }}>{r.emoji}</T>
          </Tap>
        );
      })}
    </SheetModal>
  );
}

/** Under your last message in a group: "Seen by everyone", or the faces of who saw it. */
export function SeenBy({ readers, total, people, onPress }: { readers: string[]; total: number; people: Record<string, Person>; onPress: () => void }) {
  if (!readers.length) return <T v="tiny" color={C.faint} style={{ fontSize: 11 }}>{t('انبعتت')}</T>;
  if (readers.length >= total) return <T v="tiny" color={C.muted} style={{ fontSize: 11 }}>{t('شافها الكل')}</T>;
  return (
    <Tap onPress={onPress} haptic={false} accessibilityLabel={t('مين شافها')}>
      <Row gap={4}>
        <View style={{ flexDirection: 'row' }}>
          {readers.slice(0, 3).map((u, i) => (
            <View key={u} style={{ marginStart: i ? -6 : 0, borderRadius: 9, borderWidth: 1.5, borderColor: C.bg }}>
              <Avatar id={u} name={people[u]?.full_name ?? ''} url={people[u]?.avatar_url ?? null} size={15} />
            </View>
          ))}
        </View>
        <T v="tiny" color={C.muted} style={{ fontSize: 11 }}>{t('شافها {0}', [String(readers.length)])}</T>
      </Row>
    </Tap>
  );
}
