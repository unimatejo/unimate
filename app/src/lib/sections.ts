import { t } from './i18n';

/**
 * A section whose number isn't known yet (a Teams team or a course added without one): stored as "?xxxxxx" (0106).
 * It gets no section-wide events until the student says which section they're in.
 */
export const sectionKnown = (no?: string | null) => !!no && !no.startsWith('?');

/** "شعبة 3", or "شعبة غير محددة" */
export const sectionLabel = (no?: string | null) => (sectionKnown(no) ? t('شعبة {0}', [no!]) : t('شعبة غير محددة'));

type EventTrust = 'official' | 'crowd' | 'mine';
/** Where an exam or deadline came from: official (Moodle, the university/admins), classmates (not official yet), or mine. */
export function eventSource(e: { owner_id: string | null; source?: string | null; shared_ask?: boolean | null; confirmations?: number | null; edited?: boolean | null }): { trust: EventTrust; label: string } {
  // the section's event, moved by this student for themselves (0135)
  if (!e.owner_id && e.edited) return { trust: 'mine', label: t('عدّلته عندك') };
  if (e.source === 'moodle') return { trust: 'official', label: t('رسمي · المودل') };
  if (!e.owner_id) return e.source === 'crowd'
    ? { trust: 'crowd', label: t('من زملاءك · مش رسمي ({0})', [String(e.confirmations ?? 0)]) }
    : { trust: 'official', label: t('رسمي') };
  return { trust: 'mine', label: e.shared_ask ? t('بانتظار زملاءك يأكدوه') : t('خاص فيك') };
}
