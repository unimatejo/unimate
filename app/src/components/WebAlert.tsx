import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, View, type AlertButton } from 'react-native';

import { T } from './ui';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Item = { title: string; message?: string; buttons: AlertButton[] };
let show: ((i: Item | null) => void) | null = null;

/** On the web, React Native's Alert does nothing; route it to an in-app dialog instead. */
if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    show?.({ title, message, buttons: buttons?.length ? buttons : [{ text: t('تمام') }] });
  };
}

export function WebAlertHost() {
  const [item, setItem] = useState<Item | null>(null);
  useEffect(() => { show = setItem; return () => { show = null; }; }, []);
  if (Platform.OS !== 'web' || !item) return null;
  const close = (b?: AlertButton) => { setItem(null); b?.onPress?.(); };
  const cancel = item.buttons.find((b) => b.style === 'cancel');
  const rest = item.buttons.filter((b) => b !== cancel);
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={() => close(cancel)} accessibilityLabel="close" />
      <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 340, backgroundColor: C.card, borderRadius: 22, overflow: 'hidden' }}>
        {(item.title || item.message) ? (
          <View style={{ padding: 18, gap: 6, alignItems: 'center' }}>
            {item.title ? <T v="h3" style={{ textAlign: 'center' }}>{item.title}</T> : null}
            {item.message ? <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{item.message}</T> : null}
          </View>
        ) : null}
        {[...rest, ...(cancel ? [cancel] : [])].map((b, i) => (
          <Pressable key={i} onPress={() => close(b)} accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: 50, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: pressed ? C.soft : 'transparent' })}>
            <T v="bold" color={b.style === 'destructive' ? C.red : b.style === 'cancel' ? C.muted : C.primary}>{b.text ?? 'OK'}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
