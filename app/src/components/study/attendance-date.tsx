import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { createElement, useState } from 'react';
import { Platform, View } from 'react-native';

import { Row, T, Tap } from '../ui';
import { C, F } from '@/lib/theme';
import { LOCALE, t } from '@/lib/i18n';

export const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Which day was the absence: today by default, never in the future, at most 240 days back (same rule as the server). */
export function AbsenceDate({ value, onChange, min, max }: { value: Date; onChange: (d: Date) => void; min: Date; max: Date }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date', value: ymdOf(value), min: ymdOf(min), max: ymdOf(max), 'aria-label': t('تاريخ الغياب'),
      onChange: (e: { target: { value: string } }) => {
        const d = new Date(`${e.target.value}T12:00:00`);
        if (!Number.isNaN(d.getTime()) && d >= min && d <= max) onChange(d);
      },
      style: { fontFamily: F.bodyBold, fontSize: 16, padding: '12px 14px', borderRadius: 14, border: `1px solid ${C.line}`, background: C.field, color: C.ink, direction: 'ltr' },
    });
  }
  if (Platform.OS === 'ios') {
    return (
      <View style={{ alignItems: 'flex-start' }}>
        <DateTimePicker value={value} mode="date" display="compact" minimumDate={min} maximumDate={max} locale="ar" onChange={(_, d) => d && onChange(d)} />
      </View>
    );
  }
  return (
    <>
      <Tap onPress={() => setOpen(true)} accessibilityLabel={t('تاريخ الغياب')} style={{ minHeight: 48, borderRadius: 14, backgroundColor: C.field, paddingHorizontal: 14, justifyContent: 'center' }}>
        <Row gap={8}>
          <CalendarDays size={18} color={C.muted} />
          <T v="bodyMd">{value.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}</T>
        </Row>
      </Tap>
      {open && <DateTimePicker value={value} mode="date" minimumDate={min} maximumDate={max} onChange={(_, d) => { setOpen(false); if (d) onChange(d); }} />}
    </>
  );
}
