import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Platform, View } from 'react-native';

import { T, Tap } from './ui';
import { C, F } from '@/lib/theme';
import { LOCALE, t } from '@/lib/i18n';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A date picker that works on iPhone, Android and in the browser. */
export function DateField({ value, onChange, max }: { value: Date | null; onChange: (d: Date) => void; max?: Date }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date', value: value ? ymd(value) : '', max: max ? ymd(max) : undefined, 'aria-label': t('تاريخ الميلاد'),
      onChange: (e: { target: { value: string } }) => { const d = new Date(`${e.target.value}T12:00:00`); if (!Number.isNaN(d.getTime())) onChange(d); },
      style: { fontFamily: F.bodyBold, fontSize: 16, padding: '12px 14px', borderRadius: 14, border: `1px solid ${C.line}`, background: C.field, color: C.ink, direction: 'ltr' },
    });
  }
  if (Platform.OS === 'ios') {
    return <View style={{ alignItems: 'flex-start' }}><DateTimePicker value={value ?? new Date(2005, 0, 1)} mode="date" display="compact" maximumDate={max} onChange={(_, d) => d && onChange(d)} /></View>;
  }
  return (
    <>
      <Tap onPress={() => setOpen(true)} style={{ minHeight: 48, borderRadius: 14, backgroundColor: C.field, paddingHorizontal: 14, justifyContent: 'center' }}>
        <T v="bodyMd" color={value ? C.ink : C.faint}>{value ? value.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : t('اختار التاريخ')}</T>
      </Tap>
      {open && <DateTimePicker value={value ?? new Date(2005, 0, 1)} mode="date" maximumDate={max} onChange={(_, d) => { setOpen(false); if (d) onChange(d); }} />}
    </>
  );
}
