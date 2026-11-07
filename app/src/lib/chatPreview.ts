import { t } from './i18n';

/** One line for a message where its bubble isn't shown: the inbox row, the pinned bar. */
export function messagePreview(m?: { kind: string; body: string | null } | null) {
  if (!m) return null;
  return m.kind === 'image' ? t('📷 صورة') : m.kind === 'view_once' ? t('📸 صورة بتنشاف مرة') : m.kind === 'voice' ? t('🎤 رسالة صوتية')
    : m.kind === 'post_share' ? t('شارك منشور') : m.kind === 'story_reply' ? t('رد على قصتك: {0}', [m.body ?? ''])
    : m.kind === 'sticker' ? t('ستيكر') : m.kind === 'file' ? t('📄 ملف') : m.kind === 'location' ? t('📍 موقع') : m.kind === 'contact' ? t('👤 حساب: {0}', [m.body ?? ''])
    : m.kind === 'poll' ? t('📊 استطلاع رأي') : m.body;
}
