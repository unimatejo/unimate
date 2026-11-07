import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, View, type AlertButton } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import { T } from '@/components/ui';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Item = { title: string; message?: string; buttons: AlertButton[] };
/**
 * Hosts, the most recently mounted last: the root one, and one inside each open sheet. A sheet is drawn above the
 * root, so a dialog asked for from inside it must show in the sheet's own host, or it would sit hidden under it.
 */
const hosts: ((i: Item | null) => void)[] = [];

/** On the web, React Native's Alert does nothing; route it to an in-app dialog instead. */
if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    hosts[hosts.length - 1]?.({ title, message, buttons: buttons?.length ? buttons : [{ text: t('حسناً') }] });
  };
}

export function WebAlertHost() {
  const [item, setItem] = useState<Item | null>(null);
  useEffect(() => {
    hosts.push(setItem);
    return () => { const i = hosts.indexOf(setItem); if (i >= 0) hosts.splice(i, 1); };
  }, []);
  if (Platform.OS !== 'web' || !item) return null;
  const close = (b?: AlertButton) => { setItem(null); b?.onPress?.(); };
  const cancel = item.buttons.find((b) => b.style === 'cancel');
  const rest = item.buttons.filter((b) => b !== cancel);
  // a bottom action sheet (like the phone's own), not a box in the middle
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.overlay, justifyContent: 'flex-end', alignItems: 'center', padding: 12, paddingBottom: 20 }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={() => close(cancel)} accessibilityLabel={t('إلغاء')} />
      <Animated.View entering={SlideInDown.duration(240)} style={{ width: '100%', maxWidth: 480, gap: 8 }}>
        <View accessibilityRole="alert" style={{ backgroundColor: C.card, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
          {(item.title || item.message) ? (
            <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 4, alignItems: 'center' }}>
              {item.title ? <T v="h3" style={{ textAlign: 'center' }}>{item.title}</T> : null}
              {item.message ? <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{item.message}</T> : null}
            </View>
          ) : null}
          {rest.map((b, i) => (
            <Pressable key={i} onPress={() => close(b)} accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: 54, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderTopWidth: (i || item.title || item.message) ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.soft : 'transparent' })}>
              <T v="bodyMd" color={b.style === 'destructive' ? C.red : C.ink} style={{ textAlign: 'center' }}>{b.text ?? t('حسناً')}</T>
            </Pressable>
          ))}
        </View>
        {cancel ? (
          <Pressable onPress={() => close(cancel)} accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? C.soft : C.card, borderWidth: 1, borderColor: C.line })}>
            <T v="bold">{cancel.text ?? t('إلغاء')}</T>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
