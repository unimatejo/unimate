import { Minus, Plus } from 'lucide-react-native';
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row, T, Tap } from '@/components/ui';
import { C, F } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Bottom sheet frame (drag handle, dimmed background, safe area). */
export function RideSheet({ open, onClose, title, sub, children }: { open: boolean; onClose: () => void; title: string; sub?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={onClose} accessibilityLabel={t('إغلاق')} />
        <View style={{ maxHeight: '85%', backgroundColor: C.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 10, paddingBottom: insets.bottom + 16, gap: 14 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
          <View style={{ gap: 2 }}>
            <T v="h2" numberOfLines={2}>{title}</T>
            {sub ? <T v="small" color={C.muted}>{sub}</T> : null}
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** − n + with bounds; the label says what is counted. */
export function Stepper({ value, min, max, onChange, label, format }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; format?: (n: number) => string }) {
  const btn = (on: boolean) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? C.soft : C.field, alignItems: 'center' as const, justifyContent: 'center' as const, opacity: on ? 1 : 0.4 });
  return (
    <Row gap={12} style={{ justifyContent: 'space-between', backgroundColor: C.field, borderRadius: 18, paddingHorizontal: 14, minHeight: 60 }}>
      <T v="bold" style={{ flex: 1 }}>{label}</T>
      <Row gap={14}>
        <Tap onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} accessibilityLabel={t('أقل')} style={btn(value > min)}><Minus size={18} color={C.ink} /></Tap>
        <T style={{ fontFamily: F.display, fontSize: 22, minWidth: 34, textAlign: 'center' }} accessibilityLiveRegion="polite">{format ? format(value) : String(value)}</T>
        <Tap onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} accessibilityLabel={t('أكثر')} style={btn(value < max)}><Plus size={18} color={C.ink} /></Tap>
      </Row>
    </Row>
  );
}
