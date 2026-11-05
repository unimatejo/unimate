import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, Clock } from 'lucide-react-native';
import { createElement, useState } from 'react';
import { Platform, View } from 'react-native';

import { Row, T, Tap } from '@/components/ui';
import { C, F } from '@/lib/theme';
import { LOCALE, t } from '@/lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Date + time of departure: today up to `max`, never in the past. Native pickers on phones, inputs on the web. */
export function DepartPicker({ value, onChange, min, max }: { value: Date; onChange: (d: Date) => void; min: Date; max: Date }) {
  const [open, setOpen] = useState<'date' | 'time' | null>(null);
  const setDate = (d: Date) => { const n = new Date(value); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); onChange(n); };
  const setTime = (d: Date) => { const n = new Date(value); n.setHours(d.getHours(), d.getMinutes(), 0, 0); onChange(n); };
  const box = { flex: 1, minHeight: 52, borderRadius: 16, backgroundColor: C.field, paddingHorizontal: 14, justifyContent: 'center' as const };

  if (Platform.OS === 'web') {
    const style = { fontFamily: F.bodyBold, fontSize: 16, padding: '13px 14px', borderRadius: 16, border: `1px solid ${C.line}`, background: C.field, color: C.ink, direction: 'ltr', flex: 1, minWidth: 0 };
    return (
      <Row gap={10}>
        {createElement('input', { type: 'date', value: ymd(value), min: ymd(min), max: ymd(max), 'aria-label': t('اليوم'), style,
          onChange: (e: { target: { value: string } }) => { const d = new Date(`${e.target.value}T12:00:00`); if (!Number.isNaN(d.getTime())) setDate(d); } })}
        {createElement('input', { type: 'time', value: hm(value), step: 300, 'aria-label': t('الساعة'), style,
          onChange: (e: { target: { value: string } }) => { const [h, m] = e.target.value.split(':').map(Number); if (!Number.isNaN(h)) { const d = new Date(value); d.setHours(h, m || 0, 0, 0); onChange(d); } } })}
      </Row>
    );
  }
  if (Platform.OS === 'ios') {
    return (
      <Row gap={10}>
        <DateTimePicker value={value} mode="date" display="compact" minimumDate={min} maximumDate={max} locale="ar" onChange={(_, d) => d && setDate(d)} />
        <DateTimePicker value={value} mode="time" display="compact" minuteInterval={5} locale="ar" onChange={(_, d) => d && setTime(d)} />
      </Row>
    );
  }
  return (
    <View>
      <Row gap={10}>
        <Tap onPress={() => setOpen('date')} accessibilityLabel={t('اليوم')} style={box}>
          <Row gap={8}><CalendarDays size={18} color={C.muted} /><T v="bodyMd">{value.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}</T></Row>
        </Tap>
        <Tap onPress={() => setOpen('time')} accessibilityLabel={t('الساعة')} style={box}>
          <Row gap={8}><Clock size={18} color={C.muted} /><T v="bodyMd">{value.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' })}</T></Row>
        </Tap>
      </Row>
      {open === 'date' && <DateTimePicker value={value} mode="date" minimumDate={min} maximumDate={max} onChange={(_, d) => { setOpen(null); if (d) setDate(d); }} />}
      {open === 'time' && <DateTimePicker value={value} mode="time" minuteInterval={5} onChange={(_, d) => { setOpen(null); if (d) setTime(d); }} />}
    </View>
  );
}
