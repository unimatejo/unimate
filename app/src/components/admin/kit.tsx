import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronLeft, Search, ShieldAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, ScrollView, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { SheetModal } from '@/components/chat/ChatExtras';
import { Button, Chip, Empty, Field, Header, Loading, Row, Screen, T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C, F, R, isDark } from '@/lib/theme';
import { flip, isAR, t, ta } from '@/lib/i18n';

// ---------- data ----------
type Res<T> = { data: T | null; error: { message: string } | null };
/** Runs `fn`, exposes data + reload. Same shape as the web admin's hook so the queries port 1:1. */
export function useLoad<T>(fn: () => PromiseLike<Res<T>>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    setLoading(true);
    try { const r = await fn(); setData(r.data); setError(r.error?.message ?? null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export type Uni = { id: string; slug: string; name_ar: string; name_en: string; city: string | null; email_domains: string[]; brand_color: string; center_lat: number | null; center_lng: number | null; is_active: boolean; data_status: string; data_notes: string | null };
let uniCache: Uni[] | null = null;
export function useUnis() {
  const [unis, setUnis] = useState<Uni[]>(uniCache ?? []);
  useEffect(() => {
    if (uniCache) return;
    supabase.from('universities').select('*').order('name_ar').then(({ data }) => { uniCache = (data ?? []) as Uni[]; setUnis(uniCache); });
  }, []);
  return unis;
}
export function clearUniCache() { uniCache = null; }

export const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString(isAR ? 'ar-JO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtNum = (n?: number | null) => (n ?? 0).toLocaleString(isAR ? 'ar-JO' : 'en-US');

export async function audit(action: string, target_type: string, target_id: string, meta: Record<string, unknown> = {}) {
  await supabase.rpc('admin_log', { action, target_type, target_id, meta });
}

/** Ask first, always: resolves true only when the admin taps the red button. */
export function confirm(title: string, message: string, ok = t('أكيد')): Promise<boolean> {
  return new Promise((res) => Alert.alert(title, message, [
    { text: t('تراجع'), style: 'cancel', onPress: () => res(false) },
    { text: ok, style: 'destructive', onPress: () => res(true) },
  ], { cancelable: true, onDismiss: () => res(false) }));
}

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const done = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

// ---------- who is looking ----------
type Role = 'owner' | 'moderator';
let roleCache: Role | null | undefined;
export function useAdminRole() {
  const [role, setRole] = useState<Role | null | undefined>(roleCache);
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id;
      if (!id) { if (live) setRole(null); return; }
      const { data: a } = await supabase.from('admins').select('role').eq('user_id', id).maybeSingle();
      roleCache = (a?.role as Role) ?? null;
      if (live) setRole(roleCache);
    });
    return () => { live = false; };
  }, []);
  return role;
}

/** Every admin screen: header + guard. Non-admins see one line and nothing else. */
export function AdminScreen({ title, subtitle, right, ownerOnly, children, scroll = true }: { title: string; subtitle?: string; right?: ReactNode; ownerOnly?: boolean; children: ReactNode; scroll?: boolean }) {
  const role = useAdminRole();
  const allowed = role === 'owner' || (role === 'moderator' && !ownerOnly);
  return (
    <Screen>
      <Header title={title} subtitle={subtitle} right={allowed ? right : undefined} />
      {role === undefined ? <Loading /> : !allowed ? (
        <Empty icon={<ShieldAlert size={28} color={C.primary} />} title={t('للمشرفين بس')} body={ownerOnly && role ? t('هالقسم للمالك بس.') : t('هالحساب مش مشرف.')} />
      ) : scroll ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : <View style={{ flex: 1 }}>{children}</View>}
      <PromptHost />
    </Screen>
  );
}

// ---------- building blocks ----------
export function Panel({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const s = [{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8 }, style];
  if (onPress) return <Tap onPress={onPress} scale={0.98} style={s}>{children}</Tap>;
  return <View style={s}>{children}</View>;
}

/** A tappable list row: title, sub line, end slot, chevron. */
export function Item({ title, sub, end, onPress, dim, start }: { title: string; sub?: string; end?: ReactNode; onPress?: () => void; dim?: boolean; start?: ReactNode }) {
  return (
    <Tap onPress={onPress} disabled={!onPress} scale={0.98}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, opacity: dim ? 0.55 : 1 }}>
      {start}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyMd" numberOfLines={2}>{title}</T>
        {sub ? <T v="tiny" color={C.muted} numberOfLines={3}>{sub}</T> : null}
      </View>
      {end}
      {onPress && <ChevronLeft size={18} color={C.faint} style={flip} />}
    </Tap>
  );
}

const TONE: Record<string, [string, string]> = {
  green: [C.greenSoft, C.greenInk], orange: [C.orangeSoft, C.orangeInk], red: [C.redSoft, C.red], violet: [C.violetSoft, C.violetInk], blue: [C.skySoft, C.skyInk], '': [C.soft, C.muted],
};
export function Pill({ label, tone = '' }: { label: string; tone?: string }) {
  const [bg, fg] = TONE[tone] ?? TONE[''];
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}><T v="tiny" color={fg}>{label}</T></View>;
}

const STATUS: Record<string, [string, string]> = {
  active: [t('فعّال'), 'green'], suspended: [t('موقوف مؤقتاً'), 'orange'], banned: [t('محظور'), 'red'],
  open: [t('مفتوح'), 'red'], reviewing: [t('قيد المراجعة'), 'orange'], resolved: [t('انحل'), 'green'], dismissed: [t('مرفوض'), ''],
  pending: [t('بانتظار الموافقة'), 'orange'], approved: [t('مقبول'), 'green'], rejected: [t('مرفوض'), ''],
  answered: [t('انرد عليه'), 'green'], closed: [t('مسكّر'), ''], draft: [t('مسودة'), 'orange'], verified: [t('موثّق'), 'green'],
};
export function Status({ s }: { s: string }) {
  const [l, c] = STATUS[s] ?? [s, ''];
  return <Pill label={l} tone={c} />;
}

/** Small pill action button (≥44px tall). */
export function Act({ label, onPress, kind = 'soft', disabled, loading }: { label: string; onPress: () => void; kind?: 'primary' | 'soft' | 'danger' | 'green'; disabled?: boolean; loading?: boolean }) {
  return <Button title={label} onPress={onPress} kind={kind} disabled={disabled} loading={loading} style={{ minHeight: 44, paddingHorizontal: 16, flexGrow: 0 }} />;
}

export function Actions({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Row gap={8} style={{ minHeight: 48, borderRadius: R.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14 }}>
      <Search size={18} color={C.muted} />
      <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false}
        style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta, minHeight: 46, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
    </Row>
  );
}

/** Pill filters in a horizontal row. */
export function Filters<K extends string>({ items, value, onChange }: { items: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {items.map(([k, l]) => <Chip key={k} label={l} active={value === k} onPress={() => { tap(); onChange(k); }} />)}
    </ScrollView>
  );
}

export function Section({ title, right }: { title: string; right?: ReactNode }) {
  return <Row style={{ marginTop: 6 }}><T v="h3" style={{ flex: 1 }}>{title}</T>{right}</Row>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <T v="small" color={C.muted}>{children}</T>;
}

/** Loading / error / empty for admin lists. */
export function State({ loading, error, empty, children }: { loading: boolean; error: string | null; empty?: boolean; children: ReactNode }) {
  if (error) return <Panel><T v="small" color={C.red}>{/fetch|network|timeout/i.test(error) ? t('تأكد من الإنترنت وجرّب كمان مرة.') : t('صار خطأ: {0}', [error])}</T></Panel>;
  if (loading) return <Loading />;
  if (empty) return <Panel><Muted>{t('ما في إشي هون.')}</Muted></Panel>;
  return <>{children}</>;
}

// ---------- sheets ----------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <SheetModal open={open} onClose={onClose} style={{ maxHeight: '88%' }}>
      {title ? <T v="h2">{title}</T> : null}
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </SheetModal>
  );
}

/** Cross-platform text prompt (Alert.prompt is iOS only). */
type Ask = (p: { title: string; hint?: string; value?: string; resolve: (v: string | null) => void }) => void;
const hosts: Ask[] = []; // one per open admin screen; the top one answers
export function promptText(title: string, hint?: string, value?: string): Promise<string | null> {
  return new Promise((resolve) => { const h = hosts[hosts.length - 1]; if (h) h({ title, hint, value, resolve }); else resolve(null); });
}
function PromptHost() {
  const [p, setP] = useState<{ title: string; hint?: string; value?: string; resolve: (v: string | null) => void } | null>(null);
  const [v, setV] = useState('');
  useEffect(() => {
    const h: Ask = (x) => { setV(x.value ?? ''); setP(x); };
    hosts.push(h);
    return () => { const i = hosts.indexOf(h); if (i >= 0) hosts.splice(i, 1); };
  }, []);
  const close = (val: string | null) => { p?.resolve(val); setP(null); };
  return (
    <Sheet open={!!p} onClose={() => close(null)} title={p?.title}>
      <Field value={v} onChangeText={setV} placeholder={p?.hint} autoFocus multiline style={{ minHeight: 60, paddingTop: 14 }} />
      <Actions>
        <Act label={t('تمام')} kind="primary" onPress={() => close(v)} />
        <Act label={t('إلغاء')} onPress={() => close(null)} />
      </Actions>
    </Sheet>
  );
}

/** Pick one university (or "all") from a sheet. */
export function UniPicker({ value, onChange, allowAll = true, label = t('الجامعة') }: { value: string; onChange: (id: string) => void; allowAll?: boolean; label?: string }) {
  const unis = useUnis();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = unis.find((u) => u.id === value);
  const list = unis.filter((u) => !q || u.name_ar.includes(q) || u.name_en?.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Item title={cur ? (isAR ? cur.name_ar : cur.name_en || cur.name_ar) : allowAll ? t('كل الجامعات') : t('اختار جامعة')} sub={label} onPress={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <SearchBox value={q} onChange={setQ} placeholder={t('ابحث')} />
        {allowAll && <Item title={t('كل الجامعات')} onPress={() => { onChange(''); setOpen(false); }} end={!value ? <Pill label="✓" tone="green" /> : undefined} />}
        {list.map((u) => <Item key={u.id} title={isAR ? u.name_ar : u.name_en || u.name_ar} onPress={() => { onChange(u.id); setOpen(false); }} end={u.id === value ? <Pill label="✓" tone="green" /> : undefined} />)}
      </Sheet>
    </>
  );
}

/** Pick one option from a short fixed list. */
export function OptionPicker<K extends string>({ label, value, options, onChange }: { label: string; value: K; options: Record<K, string>; onChange: (k: K) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Item title={options[value] ?? value} sub={label} onPress={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {(Object.entries(options) as [K, string][]).map(([k, l]) => <Item key={k} title={l} onPress={() => { onChange(k); setOpen(false); }} end={k === value ? <Pill label="✓" tone="green" /> : undefined} />)}
      </Sheet>
    </>
  );
}

export const go = (path: string) => router.push(path as never);
