import { t } from './i18n';

/** Exams, deadlines and reminders: the kinds the database knows (event_kind), in plain words. */
export const EVENT_KIND: Record<string, string> = {
  exam_first: t('امتحان أول'), exam_second: t('امتحان ثاني'), exam_mid: t('امتحان نصفي'), exam_final: t('امتحان نهائي'),
  quiz: t('كويز'), assignment: t('تسليم واجب'), project: t('مشروع'), custom: t('موعد'),
};

/** One row of section_event_asks(): classmates added something I haven't, and it isn't official yet. */
export type SectionAsk = {
  section_id: string; course_name: string; course_name_en: string | null; kind: string; day: string;
  starts_at: string; title: string; count: number; needed: number;
};
