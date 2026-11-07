import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View, type KeyboardTypeOptions } from 'react-native';

import { Chip, Field, Row, T, Tap } from './index';
import { C, F } from '@/lib/theme';
import { t } from '@/lib/i18n';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();

type Group = { title?: string; options: string[] };
type Common = {
  /** quick picks: a flat list, or titled groups ("عمّان", "الزرقاء"…) */
  options: string[] | Group[];
  /** what the "أخرى" box asks for, e.g. "اكتب المنطقة" */
  placeholder: string;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  /** checks a typed value; return an error to show under the box */
  validate?: (v: string) => string | null;
};

function groups(o: string[] | Group[]): Group[] {
  return typeof o[0] === 'string' || !o.length ? [{ options: o as string[] }] : (o as Group[]);
}

/**
 * Quick-pick chips plus "أخرى" to type anything else — the same pattern everywhere a list can't cover everyone.
 * Single choice: tapping the active chip again clears it.
 */
export function ChoiceField({ value, onChange, commitOnBlur, ...p }: Common & {
  value: string | null; onChange: (v: string | null) => void;
  /** report a typed value only when the box loses focus (for screens that save on every change) */
  commitOnBlur?: boolean;
}) {
  const all = groups(p.options);
  const known = all.some((g) => g.options.some((o) => value != null && same(o, value)));
  const [other, setOther] = useState(!!value && !known);
  const [draft, setDraft] = useState(!known && value ? value : '');
  const err = other && draft && p.validate ? p.validate(norm(draft)) : null;
  const commit = (v: string) => { const n = norm(v); onChange(n && !p.validate?.(n) ? n : null); };

  return (
    <View style={{ gap: 8 }}>
      {all.map((g, i) => (
        <View key={g.title ?? i} style={{ gap: 6 }}>
          {g.title ? <T v="tiny" color={C.muted}>{g.title}</T> : null}
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {g.options.map((o) => (
              <Chip key={o} label={o} active={!other && value != null && same(o, value)}
                onPress={() => { setOther(false); onChange(value != null && same(o, value) && !other ? null : o); }} />
            ))}
            {i === all.length - 1 && <Chip label={t('أخرى')} active={other} onPress={() => { setOther(!other); onChange(!other && norm(draft) ? norm(draft) : null); }} />}
          </Row>
        </View>
      ))}
      {other && (
        <>
          <Field value={draft} autoFocus maxLength={p.maxLength} keyboardType={p.keyboardType} placeholder={p.placeholder}
            onChangeText={(v) => { setDraft(v); if (!commitOnBlur) commit(v); }} onEndEditing={() => { if (commitOnBlur) commit(draft); }} />
          {err ? <T v="tiny" color={C.red}>{err}</T> : null}
        </>
      )}
    </View>
  );
}

/** Several picks (up to `max`), from the chips or typed in one by one. The first one picked comes first. */
export function MultiChoiceField({ value, onChange, max, ...p }: Common & { value: string[]; onChange: (v: string[]) => void; max: number }) {
  const all = groups(p.options);
  const [draft, setDraft] = useState('');
  const has = (o: string) => value.some((v) => same(v, o));
  const full = value.length >= max;
  const toggle = (o: string) => (has(o) ? onChange(value.filter((v) => !same(v, o))) : !full && onChange([...value, norm(o)]));
  const extra = value.filter((v) => !all.some((g) => g.options.some((o) => same(o, v))));
  const typed = norm(draft);
  const err = typed && p.validate ? p.validate(typed) : null;
  const add = () => { if (!typed || err || full) return; if (!has(typed)) onChange([...value, typed]); setDraft(''); };

  return (
    <View style={{ gap: 8 }}>
      {extra.length > 0 && <Row gap={8} style={{ flexWrap: 'wrap' }}>{extra.map((o) => <Chip key={o} label={`${o}  ✕`} active onPress={() => toggle(o)} />)}</Row>}
      {all.map((g, i) => (
        <View key={g.title ?? i} style={{ gap: 6 }}>
          {g.title ? <T v="tiny" color={C.muted}>{g.title}</T> : null}
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{g.options.map((o) => <Chip key={o} label={o} active={has(o)} onPress={() => toggle(o)} />)}</Row>
        </View>
      ))}
      <Row gap={8}>
        <View style={{ flex: 1 }}>
          <Field value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" maxLength={p.maxLength} editable={!full}
            placeholder={full ? t('وصلت إلى الحد ({0})', [String(max)]) : p.placeholder} />
        </View>
        <Tap onPress={add} disabled={!typed || !!err || full} accessibilityRole="button" accessibilityLabel={t('أضف')}
          style={{ height: 52, paddingHorizontal: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: typed && !err && !full ? C.primary : C.soft }}>
          <Plus size={16} color={typed && !err && !full ? C.onPrimary : C.muted} />
          <T v="small" color={typed && !err && !full ? C.onPrimary : C.muted} style={{ fontFamily: F.bodyBold }}>{t('أضف')}</T>
        </Tap>
      </Row>
      {err ? <T v="tiny" color={C.red}>{err}</T> : null}
    </View>
  );
}
