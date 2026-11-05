import { ExternalLink, Landmark, MoreHorizontal, Pin } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { TitleBadge, titledName } from '@/components/TitleBadge';
import { Avatar, Row, T, Tap } from '@/components/ui';
import { C, F, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';
import { timeAgo } from '@/lib/util';

export type Announcement = {
  id: string; college_id: string | null; college_name: string | null; title: string; body: string; link: string | null;
  pinned: boolean; created_at: string; edited_at: string | null; author_id: string; author_name: string;
  author_avatar: string | null; author_title: string | null; author_verified: boolean; mine: boolean; can_pin: boolean;
};

const LONG = 260;

/** One official announcement: who posted it (with their verified title), to whom, and the text. */
export function AnnouncementCard({ a, index, onAuthor, onMenu }: { a: Announcement; index: number; onAuthor: () => void; onMenu?: () => void }) {
  const [open, setOpen] = useState(false);
  const long = a.body.length > LONG;
  const text = long && !open ? `${a.body.slice(0, LONG).trimEnd()}…` : a.body;

  function openLink() {
    if (!a.link || !/^https:\/\//.test(a.link)) return;
    Linking.openURL(a.link).catch(() => Alert.alert(t('ما قدرنا نفتح الرابط')));
  }

  return (
    <Animated.View entering={FadeIn.delay(Math.min(index, 8) * 50).duration(220)}
      style={[{ backgroundColor: C.card, borderRadius: 24, padding: 14, gap: 10, borderWidth: a.pinned ? 1.5 : 0, borderColor: '#F5B700' }, shadow]}>
      <Row gap={10}>
        <Tap haptic={false} scale={0.96} onPress={onAuthor} accessibilityLabel={a.author_name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Avatar id={a.author_id} name={a.author_name} url={a.author_avatar} size={42} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row gap={5}>
              <T v="bodyMd" numberOfLines={1} style={{ flexShrink: 1 }}>{titledName(a.author_name, a.author_title, a.author_verified)}</T>
              <TitleBadge title={a.author_title} verified={a.author_verified} />
            </Row>
            <Row gap={5}>
              <Landmark size={12} color={C.muted} />
              <T v="tiny" color={C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
                {[a.college_name ?? t('الجامعة كاملة'), timeAgo(a.created_at), a.edited_at ? t('معدّل') : null].filter(Boolean).join(' · ')}
              </T>
            </Row>
          </View>
        </Tap>
        {a.pinned && (
          <Row gap={4} style={{ backgroundColor: '#F5B70022', borderRadius: 999, paddingHorizontal: 8, height: 24 }}>
            <Pin size={12} color="#B98900" /><T v="tiny" color="#B98900" style={{ fontFamily: F.bodyBold }}>{t('مثبّت')}</T>
          </Row>
        )}
        {onMenu && (
          <Tap onPress={onMenu} hitSlop={10} accessibilityLabel={t('خيارات الإعلان')} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <MoreHorizontal size={20} color={C.muted} />
          </Tap>
        )}
      </Row>

      <T v="h3" style={{ lineHeight: 26 }}>{a.title}</T>
      <Tap haptic={false} disabled={!long} onPress={() => setOpen((o) => !o)} accessibilityLabel={long ? (open ? t('أقل') : t('اقرأ أكثر')) : undefined}>
        <T v="body" color={C.ink2} style={{ lineHeight: 24 }} selectable>{text}</T>
        {long && <T v="small" color={C.primary} style={{ marginTop: 4, fontFamily: F.bodyBold }}>{open ? t('أقل') : t('اقرأ أكثر')}</T>}
      </Tap>

      {a.link && /^https:\/\//.test(a.link) && (
        <Tap onPress={openLink} accessibilityRole="link" accessibilityLabel={t('افتح الرابط')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.primarySoft }}>
          <ExternalLink size={16} color={C.primary} />
          <T v="small" color={C.primary} numberOfLines={1} style={{ flex: 1, writingDirection: 'ltr', textAlign: 'left' }}>{a.link.replace(/^https:\/\//, '')}</T>
        </Tap>
      )}
    </Animated.View>
  );
}
