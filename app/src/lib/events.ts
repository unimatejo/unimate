import { t } from './i18n';

/** Exams, deadlines and reminders: the kinds the database knows (event_kind), in plain words. */
export const EVENT_KIND: Record<string, string> = {
  exam_first: t('امتحان أول'), exam_second: t('امتحان ثانٍ'), exam_mid: t('امتحان نصفي'), exam_final: t('امتحان نهائي'),
  quiz: t('اختبار قصير'), assignment: t('تسليم واجب'), project: t('مشروع'), custom: t('موعد'),
};

/** One row of section_event_asks(): classmates added something I haven't, and it isn't official yet. */
export type SectionAsk = {
  section_id: string; course_name: string; course_name_en: string | null; kind: string; day: string;
  starts_at: string; title: string; count: number; needed: number;
};

type Ev = { section_id: string | null; owner_id: string | null; kind: string; starts_at: string; source?: string | null };
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });
/**
 * Moodle is the official source: when it has the same deadline (course section, kind, day) as one that classmates
 * added, only Moodle's shows.
 */
export function preferOfficial<T extends Ev>(list: T[]): T[] {
  const official = new Set(list.filter((e) => e.source === 'moodle' && e.section_id).map((e) => `${e.section_id}|${e.kind}|${dayOf(e.starts_at)}`));
  return list.filter((e) => e.source === 'moodle' || !e.section_id || !official.has(`${e.section_id}|${e.kind}|${dayOf(e.starts_at)}`));
}
