import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Activity, LogOut, MessageCircle, PenSquare, UserPlus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AdminScreen, Muted, Panel, Section, fmtNum, go, useAdminRole, useWide } from '@/components/admin/kit';
import { ADMIN_SECTIONS, GROUPS, type AdminCounts } from '@/components/admin/sections';
import { IconButton, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTeamStatus } from '@/lib/team';
import { C, F, R, shadow } from '@/lib/theme';
import { isAR, t } from '@/lib/i18n';

type Stats = AdminCounts & {
  users: number; users_7d: number; active_today: number; posts: number; posts_7d: number; messages_7d: number; ads_live: number;
  per_university: { id: string; slug: string; name_ar: string; data_status: string; users: number; posts_7d: number }[];
};
type Day = { day: string; signups: number; posts: number; messages: number; active: number };

/** The admin home: what needs you now, today's numbers, the last two weeks, and every section. */
export default function AdminHome() {
  const role = useAdminRole();
  const wide = useWide();
  const { profile, session, signOut } = useAuth();
  const team = useTeamStatus(session);
  const [s, setS] = useState<Stats | null>(null);
  const [days, setDays] = useState<Day[]>([]);

  useFocusEffect(useCallback(() => {
    if (!role) return;
    Promise.all([
      supabase.rpc('admin_stats'),
      supabase.from('title_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('moderation_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.rpc('admin_series', { p_days: 14 }),
    ]).then(([st, tr, mq, se]) => {
      if (st.data) setS({ ...(st.data as Stats), titles_pending: tr.count ?? 0, mod_pending: mq.count ?? 0 });
      if (se.data) setDays(se.data as Day[]);
    }, () => {});
  }, [role]));

  const sections = ADMIN_SECTIONS.filter((x) => x.key && (!x.owner || role === 'owner'));
  const waiting = s ? sections.filter((x) => x.badge && x.badge(s) > 0) : [];
  const hour = new Date().getHours();
  const hello = hour < 12 ? t('صباح الخير') : hour < 18 ? t('مسا الخير') : t('مسا النور');
  const first = profile?.full_name?.split(' ')[0] ?? '';
  const today = days[days.length - 1];

  return (
    <AdminScreen title={t('لوحة الإدارة')} subtitle={role === 'owner' ? t('المالك · كل الصلاحيات') : t('مشرف')}
      right={team?.team && !wide ? <IconButton label={t('تسجيل خروج')} onPress={() => signOut()}><LogOut size={20} color={C.ink} /></IconButton> : undefined}>

      {/* hero: who's here and what is waiting */}
      <View style={{ borderRadius: 28, overflow: 'hidden' }}>
        <LinearGradient colors={['#101633', '#1E2A6B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20, gap: 14 }}>
          <View style={{ gap: 2 }}>
            <T v="small" color="#C9D1F0">{new Date().toLocaleDateString(isAR ? 'ar-JO' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</T>
            <T style={{ fontFamily: F.display, fontSize: 26, lineHeight: 38 }} color="#FFFFFF">{first ? `${hello}، ${first}` : hello}</T>
            <T v="small" color="#C9D1F0">{!s ? t('بيحمّل الأرقام…') : waiting.length ? t('في {0} أشياء بستنوك.', [fmtNum(waiting.reduce((n, x) => n + x.badge!(s), 0))]) : t('كل إشي تمام، ما في إشي بستناك.')}</T>
          </View>
          {waiting.length > 0 && (
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {waiting.map((x) => {
                const Icon = x.icon;
                return (
                  <Tap key={x.key} onPress={() => go(`/admin/${x.key}`)} scale={0.96} accessibilityLabel={x.label}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                    <Icon size={15} color="#FFFFFF" />
                    <T v="bold" color="#FFFFFF" style={{ fontSize: 13 }}>{x.label} · {fmtNum(x.badge!(s!))}</T>
                  </Tap>
                );
              })}
            </Row>
          )}
        </LinearGradient>
      </View>

      {/* today's numbers */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Kpi icon={UserPlus} color={C.blue} n={s?.users} label={t('حساب')} sub={s ? t('+{0} هالأسبوع', [fmtNum(s.users_7d)]) : ''} onPress={() => go('/admin/users')} wide={wide} />
        <Kpi icon={Activity} color={C.green} n={today?.active} label={t('نشطين اليوم')} sub={s ? t('{0} نشروا آخر 24 ساعة', [fmtNum(s.active_today)]) : ''} wide={wide} />
        <Kpi icon={PenSquare} color={C.violet} n={s?.posts_7d} label={t('منشور هالأسبوع')} sub={s ? t('{0} بالمجمل', [fmtNum(s.posts)]) : ''} onPress={() => go('/admin/content')} wide={wide} />
        <Kpi icon={MessageCircle} color={C.pink} n={s?.messages_7d} label={t('رسالة هالأسبوع')} sub={today ? t('{0} اليوم', [fmtNum(today.messages)]) : ''} wide={wide} />
      </View>

      {/* the last 14 days */}
      {days.length > 0 && (
        <Panel style={{ gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="h3">{t('آخر أسبوعين')}</T>
            <Row gap={12}><Legend color={C.blue} label={t('حسابات جديدة')} /><Legend color={C.green} label={t('نشطين')} /></Row>
          </Row>
          <Bars days={days} />
        </Panel>
      )}

      {/* every section, grouped (on wide screens the side menu has them) */}
      {!wide && GROUPS.map((g) => {
        const items = sections.filter((x) => x.group === g);
        if (!items.length) return null;
        return (
          <View key={g} style={{ gap: 8 }}>
            <Section title={g} />
            <View style={{ gap: 8 }}>
              {items.map((x) => {
                const Icon = x.icon;
                const b = s && x.badge ? x.badge(s) : 0;
                return (
                  <Tap key={x.key} onPress={() => go(`/admin/${x.key}`)} scale={0.98} accessibilityLabel={x.label}
                    style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, borderRadius: R.lg, backgroundColor: C.card }, shadow]}>
                    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={x.color} /></View>
                    <View style={{ flex: 1 }}>
                      <T v="bodyMd">{x.label}</T>
                      <T v="tiny" color={C.muted} numberOfLines={1}>{x.hint}</T>
                    </View>
                    {b > 0 && <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><T v="tiny" color={C.onPrimary}>{b > 99 ? '99+' : b}</T></View>}
                  </Tap>
                );
              })}
            </View>
          </View>
        );
      })}

      {s && s.per_university.length > 0 && (
        <>
          <Section title={t('الجامعات')} />
          <Panel>
            {s.per_university.map((u) => (
              <Row key={u.id} gap={8} style={{ minHeight: 44, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
                <T v="small" style={{ flex: 1 }} numberOfLines={1}>{u.name_ar}</T>
                <T v="tiny" color={C.muted}>{t('{0} طالب · {1} منشور هالأسبوع', [fmtNum(u.users), fmtNum(u.posts_7d)])}</T>
              </Row>
            ))}
          </Panel>
        </>
      )}
      {!s && <Muted>{t('بيحمّل…')}</Muted>}
    </AdminScreen>
  );
}

function Kpi({ icon: Icon, color, n, label, sub, onPress, wide }: { icon: typeof Activity; color: string; n?: number; label: string; sub: string; onPress?: () => void; wide: boolean }) {
  return (
    <Tap onPress={onPress} disabled={!onPress} scale={0.97}
      style={[{ flexBasis: wide ? '23%' : '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: R.lg, padding: 14, gap: 6 }, shadow]}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={color} /></View>
      <T style={{ fontFamily: F.display, fontSize: 26, lineHeight: 36 }}>{n == null ? '—' : fmtNum(n)}</T>
      <T v="small" style={{ fontFamily: F.bodyBold }}>{label}</T>
      {sub ? <T v="tiny" color={C.muted}>{sub}</T> : null}
    </Tap>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <Row gap={5}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} /><T v="tiny" color={C.muted}>{label}</T></Row>;
}

/** Two bars a day: new accounts and active people. Each bar says its numbers to screen readers. */
function Bars({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.signups, d.active)));
  const H = 120;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: H + 22 }}>
      {days.map((d) => {
        const label = new Date(`${d.day}T12:00:00`).toLocaleDateString(isAR ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'numeric' });
        return (
          <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessible accessibilityLabel={t('{0}: {1} حساب جديد، {2} نشطين', [label, String(d.signups), String(d.active)])}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: H }}>
              <View style={{ width: 7, height: Math.max(2, (d.signups / max) * H), borderRadius: 4, backgroundColor: C.blue }} />
              <View style={{ width: 7, height: Math.max(2, (d.active / max) * H), borderRadius: 4, backgroundColor: C.green }} />
            </View>
            <T v="tiny" color={C.faint} style={{ fontSize: 9 }}>{label}</T>
          </View>
        );
      })}
    </View>
  );
}
