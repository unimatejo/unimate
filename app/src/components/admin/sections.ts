import {
  BadgePercent, Bug, Calculator, CalendarCheck, Flag, GraduationCap, LayoutDashboard, LifeBuoy, Map, Megaphone, MessagesSquare, Paintbrush,
  ScrollText, Send, ShieldAlert, ShieldCheck, SquareStack, Users, type LucideIcon,
} from 'lucide-react-native';

import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Live counts the menu shows as badges (from admin_stats). */
export type AdminCounts = {
  reports_open: number; tickets_open: number; titles_pending?: number; mod_pending?: number; aliases_pending: number; places_pending: number;
};

type AdminSection = {
  key: string; label: string; hint: string; icon: LucideIcon; color: string; group: string;
  /** owner only (the database enforces it too) */
  owner?: boolean;
  badge?: (c: AdminCounts) => number;
};

export const GROUPS = [t('المتابعة اليومية'), t('الناس'), t('المحتوى والتطبيق'), t('الجامعات والدراسة'), t('النظام')];
const [DAILY, PEOPLE, CONTENT, UNI, SYSTEM] = GROUPS;

/** Every admin page, in menu order. The route is /admin/<key> ('' is the dashboard). */
export const ADMIN_SECTIONS: AdminSection[] = [
  { key: '', label: t('الرئيسية'), hint: t('الأرقام اليوم وشو بستناك'), icon: LayoutDashboard, color: C.primary, group: DAILY },
  { key: 'reports', label: t('البلاغات'), hint: t('بلاغات الطلاب على منشورات ورسائل وحسابات'), icon: Flag, color: C.red, group: DAILY, badge: (c) => c.reports_open },
  { key: 'moderation', label: t('فحص المحتوى'), hint: t('صور ونصوص علّمها الفحص التلقائي'), icon: ShieldAlert, color: C.orange, group: DAILY, badge: (c) => c.mod_pending ?? 0 },
  { key: 'support', label: t('الدعم'), hint: t('رسائل الطلاب للدعم'), icon: LifeBuoy, color: C.green, group: DAILY, badge: (c) => c.tickets_open },
  { key: 'titles', label: t('توثيق الأساتذة'), hint: t('طلبات الألقاب وقائمة الكادر'), icon: GraduationCap, color: '#3D6BFF', group: DAILY, badge: (c) => c.titles_pending ?? 0 },
  { key: 'users', label: t('المستخدمين'), hint: t('البحث، الإيقاف، العلامة الزرقاء والألقاب'), icon: Users, color: C.blue, group: PEOPLE },
  { key: 'admins', label: t('المشرفين'), hint: t('مين بيدير التطبيق وصلاحياته'), icon: ShieldCheck, color: C.violet, group: PEOPLE, owner: true },
  { key: 'chats', label: t('المحادثات'), hint: t('عرض المحادثات حسب سياسة الخصوصية'), icon: MessagesSquare, color: C.violet, group: PEOPLE, owner: true },
  { key: 'look', label: t('شكل التطبيق'), hint: t('النصوص، البانر، الاختصارات والميزات'), icon: Paintbrush, color: C.pink, group: CONTENT, owner: true },
  { key: 'content', label: t('المنشورات والقصص'), hint: t('إخفاء وتثبيت وحذف المحتوى'), icon: SquareStack, color: C.sky, group: CONTENT },
  { key: 'notify', label: t('إرسال إشعار'), hint: t('إشعار لكل الطلاب أو لجامعة أو كلية'), icon: Send, color: C.primary, group: CONTENT, owner: true },
  { key: 'offers', label: t('العروض'), hint: t('عروض الشركاء للطلاب'), icon: BadgePercent, color: C.pink, group: CONTENT, owner: true },
  { key: 'ads', label: t('الإعلانات'), hint: t('حملات المعلنين ونتائجها'), icon: Megaphone, color: C.orange, group: CONTENT, owner: true },
  { key: 'campus', label: t('الجامعات والخرائط'), hint: t('الجامعات، المباني والقاعات'), icon: Map, color: C.green, group: UNI, owner: true, badge: (c) => c.aliases_pending + c.places_pending },
  { key: 'events', label: t('مواعيد رسمية'), hint: t('امتحان أو تسليم لشعبة أو مادة أو كلية'), icon: CalendarCheck, color: C.green, group: UNI },
  { key: 'study-rules', label: t('قواعد الدراسة'), hint: t('سلم العلامات ونسبة الحرمان'), icon: Calculator, color: C.blue, group: UNI, owner: true },
  { key: 'grades', label: t('علامات الجامعة'), hint: t('ملف المعدلات الرسمي للمتفوقين'), icon: GraduationCap, color: '#F5A900', group: UNI, owner: true },
  { key: 'audit', label: t('سجل الإدارة'), hint: t('كل إجراء عمله أي مشرف'), icon: ScrollText, color: C.muted, group: SYSTEM, owner: true },
  { key: 'errors', label: t('أخطاء التطبيق'), hint: t('الأخطاء اللي صارت عند الطلاب'), icon: Bug, color: C.red, group: SYSTEM, owner: true },
];
