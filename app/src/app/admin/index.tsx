import { useFocusEffect } from 'expo-router';
import {
  BadgePercent, BarChart3, Bug, Flag, LifeBuoy, Map, Megaphone, MessagesSquare, ScrollText, Send, ShieldCheck, SquareStack, Users, type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AdminScreen, Muted, Panel, Section, fmtNum, go, useAdminRole } from '@/components/admin/kit';
import { Row, T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C, R } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Stats = {
  users: number; users_7d: number; active_today: number; posts: number; posts_7d: number; messages_7d: number;
  reports_open: number; tickets_open: number; aliases_pending: number; places_pending: number; ads_live: number;
  per_university: { id: string; slug: string; name_ar: string; data_status: string; users: number; posts_7d: number }[];
};

type Sec = { key: string; label: string; icon: LucideIcon; color: string; badge?: (s: Stats) => number; owner?: boolean };
const SECTIONS: Sec[] = [
  { key: 'reports', label: t('البلاغات'), icon: Flag, color: C.red, badge: (s) => s.reports_open },
  { key: 'users', label: t('المستخدمين'), icon: Users, color: C.blue },
  { key: 'chats', label: t('المحادثات'), icon: MessagesSquare, color: C.violet },
  { key: 'content', label: t('المحتوى'), icon: SquareStack, color: C.sky },
  { key: 'support', label: t('الدعم'), icon: LifeBuoy, color: C.green, badge: (s) => s.tickets_open },
  { key: 'ads', label: t('الإعلانات'), icon: Megaphone, color: C.orange },
  { key: 'campus', label: t('الجامعات والخرائط'), icon: Map, color: C.green, badge: (s) => s.aliases_pending + s.places_pending },
  { key: 'offers', label: t('العروض'), icon: BadgePercent, color: C.pink },
  { key: 'notify', label: t('إرسال إشعار'), icon: Send, color: C.primary },
  { key: 'audit', label: t('سجل الإدارة'), icon: ScrollText, color: C.muted },
  { key: 'errors', label: t('أخطاء التطبيق'), icon: Bug, color: C.red },
  { key: 'admins', label: t('المشرفين'), icon: ShieldCheck, color: C.violet, owner: true },
];

function Stat({ n, label, alert, onPress }: { n: number; label: string; alert?: boolean; onPress?: () => void }) {
  return (
    <Tap onPress={onPress} disabled={!onPress} scale={0.97} style={{ width: '48%', flexGrow: 1, backgroundColor: alert ? C.primarySoft : C.card, borderRadius: R.lg, borderWidth: 1, borderColor: alert ? C.primary : C.line, padding: 14, gap: 2 }}>
      <T style={{ fontSize: 24, lineHeight: 34 }} v="h1" color={alert ? C.primaryDark : C.ink}>{fmtNum(n)}</T>
      <T v="tiny" color={C.muted}>{label}</T>
    </Tap>
  );
}

/** The admin home: today's numbers on top, then every section one tap away. */
export default function AdminHome() {
  const role = useAdminRole();
  const [s, setS] = useState<Stats | null>(null);
  useFocusEffect(useCallback(() => {
    if (!role) return;
    supabase.rpc('admin_stats').then(({ data }) => { if (data) setS(data as Stats); }, () => {});
  }, [role]));

  return (
    <AdminScreen title={t('لوحة الإدارة')} subtitle={role === 'owner' ? t('المالك · كل الصلاحيات') : t('مشرف')}>
      {s ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat n={s.users} label={t('طالب مسجّل · {0} هالأسبوع', [fmtNum(s.users_7d)])} onPress={() => go('/admin/users')} />
          <Stat n={s.active_today} label={t('نشروا آخر 24 ساعة')} />
          <Stat n={s.posts_7d} label={t('منشور هالأسبوع · {0} الكل', [fmtNum(s.posts)])} onPress={() => go('/admin/content')} />
          <Stat n={s.messages_7d} label={t('رسالة هالأسبوع')} />
          <Stat n={s.reports_open} label={t('بلاغ مفتوح')} alert={s.reports_open > 0} onPress={() => go('/admin/reports')} />
          <Stat n={s.tickets_open} label={t('طلب دعم مفتوح')} alert={s.tickets_open > 0} onPress={() => go('/admin/support')} />
          <Stat n={s.aliases_pending + s.places_pending} label={t('ألقاب وأماكن بانتظارك')} alert={s.aliases_pending + s.places_pending > 0} onPress={() => go('/admin/campus')} />
          <Stat n={s.ads_live} label={t('إعلان شغّال')} onPress={() => go('/admin/ads')} />
        </View>
      ) : <Muted>{t('بيحمّل…')}</Muted>}

      <Section title={t('الأقسام')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {SECTIONS.filter((x) => !x.owner || role === 'owner').map((x) => {
          const b = s && x.badge ? x.badge(s) : 0;
          const Icon = x.icon;
          return (
            <Tap key={x.key} onPress={() => go(`/admin/${x.key}`)} scale={0.96} accessibilityLabel={x.label}
              style={{ width: '31%', flexGrow: 1, minHeight: 96, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 12, gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Icon size={21} color={x.color} /></View>
              <T v="tiny" style={{ textAlign: 'center' }} numberOfLines={2}>{x.label}</T>
              {b > 0 && (
                <View style={{ position: 'absolute', top: 8, right: 8, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="tiny" color={C.onPrimary}>{b > 99 ? '99+' : b}</T>
                </View>
              )}
            </Tap>
          );
        })}
      </View>

      {s && s.per_university.length > 0 && (
        <>
          <Section title={t('الجامعات')} />
          <Panel>
            {s.per_university.map((u) => (
              <Row key={u.id} gap={8} style={{ minHeight: 40, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
                <T v="small" style={{ flex: 1 }} numberOfLines={1}>{u.name_ar}</T>
                <T v="tiny" color={C.muted}>{t('{0} طالب · {1} منشور هالأسبوع', [fmtNum(u.users), fmtNum(u.posts_7d)])}</T>
              </Row>
            ))}
          </Panel>
        </>
      )}
    </AdminScreen>
  );
}
