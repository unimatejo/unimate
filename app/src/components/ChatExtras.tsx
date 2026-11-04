import { Modal, Pressable, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Avatar, Row, T, Tap } from './ui';
import { C, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'] as const;
export type Reaction = { user_id: string; emoji: string };
type Person = { full_name: string; avatar_url: string | null };

/** The little emoji pill under a bubble: each emoji once, and how many people reacted. */
export function ReactionChips({ list, mine, me, onPress }: { list: Reaction[]; mine: boolean; me?: string; onPress: () => void }) {
  if (!list.length) return null;
  const kinds = [...new Set(list.map((r) => r.emoji))].slice(0, 3);
  const minePicked = list.some((r) => r.user_id === me);
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: -10, marginHorizontal: 10 }}>
      <Tap onPress={onPress} haptic={false} accessibilityLabel={t('مين تفاعل')}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, height: 24, borderRadius: 12, backgroundColor: C.card, borderWidth: 2, borderColor: minePicked ? C.primarySoft : C.bg }, shadow]}>
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
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(10,14,30,0.5)', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Animated.View entering={ZoomIn.springify().damping(15)} style={[{ alignSelf: 'center', flexDirection: 'row', gap: 4, backgroundColor: C.card, borderRadius: 32, padding: 6 }, shadow]}>
          {REACTIONS.map((e) => (
            <Tap key={e} onPress={() => { onReact(e); onClose(); }} scale={0.8} accessibilityLabel={e}
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: picked === e ? C.primarySoft : 'transparent' }}>
              <T style={{ fontSize: 28, lineHeight: 34 }}>{e}</T>
            </Tap>
          ))}
        </Animated.View>
        <Animated.View entering={FadeIn.delay(60)} style={[{ alignSelf: 'center', width: '100%', maxWidth: 320, backgroundColor: C.card, borderRadius: 20, overflow: 'hidden' }, shadow]}>
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
    <Modal visible={!!list} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(10,14,30,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 36, gap: 6 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 6 }} />
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
        </View>
      </Pressable>
    </Modal>
  );
}

/** Under your last message in a group: "Seen by everyone", or the faces of who saw it. */
export function SeenBy({ readers, total, people, onPress }: { readers: string[]; total: number; people: Record<string, Person>; onPress: () => void }) {
  if (!readers.length) return <T v="tiny" color={C.faint} style={{ fontSize: 10 }}>{t('انبعتت')}</T>;
  if (readers.length >= total) return <T v="tiny" color={C.primary} style={{ fontSize: 10 }}>{t('شافها الكل')}</T>;
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
        <T v="tiny" color={C.primary} style={{ fontSize: 10 }}>{t('شافها {0}', [String(readers.length)])}</T>
      </Row>
    </Tap>
  );
}
