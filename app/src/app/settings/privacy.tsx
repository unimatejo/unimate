import { Camera, Eye, EyeOff, Heart, Lock, MapPin, MessageCircle, Timer, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip, Header, Row, Screen, T, Tap, Toggle } from '@/components/ui';
import { router } from 'expo-router';
import { useProfilePatch } from '@/lib/settings';
import { C, shadow } from '@/lib/theme';
import type { Profile, VanishMode } from '@/lib/types';
import { t } from '@/lib/i18n';

function Box({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={[{ gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 14 }, shadow]}>
      <T v="h3">{title}</T>
      {hint ? <T v="tiny" color={C.muted} style={{ marginTop: -6 }}>{hint}</T> : null}
      {children}
    </View>
  );
}

function Choice<K extends string>({ items, value, onChange }: { items: [K, string][]; value: K; onChange: (k: K) => void }) {
  return <Row gap={8} style={{ flexWrap: 'wrap' }}>{items.map(([k, l]) => <Chip key={k} label={l} active={value === k} onPress={() => onChange(k)} />)}</Row>;
}

const ic = (n: ReactNode) => <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>{n}</View>;

export default function Privacy() {
  const { value: p, patch } = useProfilePatch();

  return (
    <Screen>
      <Header title={t('الخصوصية')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}>
        <Box title={t('الحساب')}>
          <Toggle icon={ic(<Lock size={18} color={C.violet} />)} label={t('حساب خاص')} hint={t('بس اللي بتقبلهم بيشوفوا منشوراتك بالساحة وستوريّاتك')} value={p.is_private} onChange={(v) => patch({ is_private: v })} />
          <Toggle icon={ic(<Users size={18} color={C.primary} />)} label={t('خبّي قائمة المتابِعين')} hint={t('الرقم بيضل ظاهر، الأسماء لا')} value={p.hide_followers} onChange={(v) => patch({ hide_followers: v })} />
          <Toggle icon={ic(<Users size={18} color={C.green} />)} label={t('خبّي قائمة اللي بتتابعهم')} value={p.hide_following} onChange={(v) => patch({ hide_following: v })} />
          <Toggle icon={ic(<Heart size={18} color={C.pink} />)} label={t('خبّي عدد اللايكات')} hint={t('على منشوراتك، إنت بس بتشوفه')} value={p.hide_like_counts} onChange={(v) => patch({ hide_like_counts: v })} />
        </Box>

        <Box title={t('مين بيقدر يراسلني')} hint={t('اللي مش متابعينك بتوصلك رسالتهم كطلب، وإنت بتقرر')}>
          <Choice<Profile['who_can_message']> value={p.who_can_message} onChange={(v) => patch({ who_can_message: v })}
            items={[['everyone', t('كل الجامعة')], ['college', t('كليتي')], ['major', t('تخصصي')], ['nobody', t('ولا حدا')]]} />
        </Box>

        <Box title={t('مين بيشوف إنستغرام وسناب')} hint={t('الأزرار بتطلع على بروفايلك')}>
          <Choice<Profile['socials_visible_to']> value={p.socials_visible_to} onChange={(v) => patch({ socials_visible_to: v })}
            items={[['everyone', t('الكل')], ['friends', t('المتابعين')], ['close_friends', t('المقربين')], ['nobody', t('ولا حدا')]]} />
        </Box>

        <Box title={t('الرسائل')} hint={t('الإعداد الافتراضي لكل محادثة جديدة، وبتقدر تغيره جوا أي محادثة')}>
          <Row gap={8}><Timer size={18} color={C.ink2} /><T v="bodyMd">{t('اختفاء الرسائل')}</T></Row>
          <Choice<VanishMode> value={p.default_vanish} onChange={(v) => patch({ default_vanish: v })}
            items={[['after_view', t('بعد المشاهدة')], ['h24', t('بعد 24 ساعة')], ['d7', t('بعد أسبوع')], ['never', t('ما تختفي')]]} />
          <Toggle icon={ic(<Camera size={18} color={C.red} />)} label={t('امنع لقطة الشاشة')} hint={t('شاشة المحادثة بتطلع فاضية بالسكرين شوت، وبنخبرك لو حدا حاول')} value={p.block_screenshots} onChange={(v) => patch({ block_screenshots: v })} />
        </Box>

        {/* "nearby friends" is hidden until it really works */}

        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: C.primarySoft, borderRadius: 18, padding: 14 }}>
          {p.is_private ? <EyeOff size={18} color={C.primary} /> : <Eye size={18} color={C.primary} />}
          <T v="small" color={C.ink2} style={{ flex: 1 }}>
            {t('منشوراتك بأقسام الجامعة (ملخصات، مفقودات، سوق...) بتضل ظاهرة لطلاب جامعتك حتى لو حسابك خاص، عشان هيك هي معمولة.')}
          </T>
        </View>
        <Tap scale={0.98} onPress={() => router.push('/settings/legal')} accessibilityRole="link" style={{ flexDirection: 'row', gap: 10, backgroundColor: C.card, borderRadius: 18, padding: 14 }}>
          <MessageCircle size={18} color={C.muted} />
          <View style={{ flex: 1, gap: 6 }}>
            <T v="small" color={C.muted}>
              {t('إدارة يونيميت بتقدر تفتح أي محادثة لما يوصلها بلاغ أو للحماية والأمان، وكل فتح بينسجل. التفاصيل بسياسة الخصوصية.')}
            </T>
            <T v="small" color={C.primary}>{t('اقرأ سياسة الخصوصية')}</T>
          </View>
        </Tap>
      </ScrollView>
    </Screen>
  );
}
