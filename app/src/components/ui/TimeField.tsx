import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement } from 'react';
import { Platform, View } from 'react-native';

import { T } from '@/components/ui';
import { C, F } from '@/lib/theme';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** A time picker that works on iPhone, Android and in the browser. */
export function TimeField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <T v="small" color={C.muted}>{label}</T>
      {Platform.OS === 'web'
        ? createElement('input', {
          type: 'time', step: 300, value: hhmm(value), 'aria-label': label,
          onChange: (e: { target: { value: string } }) => {
            const [h, m] = e.target.value.split(':').map(Number);
            if (Number.isFinite(h) && Number.isFinite(m)) { const d = new Date(value); d.setHours(h, m, 0, 0); onChange(d); }
          },
          style: { fontFamily: F.bodyBold, fontSize: 18, padding: '10px 12px', borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.ink, direction: 'ltr' },
        })
        : <DateTimePicker value={value} mode="time" minuteInterval={5} display={Platform.OS === 'ios' ? 'compact' : 'default'} onChange={(_, d) => d && onChange(d)} />}
    </View>
  );
}
