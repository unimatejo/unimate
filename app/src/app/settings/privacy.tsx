import { Camera, Eye, EyeOff, Heart, Lock, MapPin, MessageCircle, Timer, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip, Header, Row, Screen, T, Toggle } from '@/components/ui';
import { useProfilePatch } from '@/lib/settings';
import { C } from '@/lib/theme';
import type { Profile, VanishMode } from '@/lib/types';

function Box({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10, backgroundColor: C.white, borderRadius: 22, padding: 14 }}>
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
      <Header title="الخصوصية" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}>
        <Box title="الحساب">
          <Toggle icon={ic(<Lock size={18} color={C.violet} />)} label="حساب خاص" hint="بس اللي بتقبلهم بيشوفوا منشوراتك بالساحة وستوريّاتك" value={p.is_private} onChange={(v) => patch({ is_private: v })} />
          <Toggle icon={ic(<Users size={18} color={C.primary} />)} label="خبّي قائمة المتابِعين" hint="الرقم بيضل ظاهر، الأسماء لا" value={p.hide_followers} onChange={(v) => patch({ hide_followers: v })} />
          <Toggle icon={ic(<Users size={18} color={C.green} />)} label="خبّي قائمة اللي بتتابعهم" value={p.hide_following} onChange={(v) => patch({ hide_following: v })} />
          <Toggle icon={ic(<Heart size={18} color={C.pink} />)} label="خبّي عدد اللايكات" hint="على منشوراتك، إنت بس بتشوفه" value={p.hide_like_counts} onChange={(v) => patch({ hide_like_counts: v })} />
        </Box>

        <Box title="مين بيقدر يراسلني" hint="اللي مش متابعينك بتوصلك رسالتهم كطلب، وإنت بتقرر">
          <Choice<Profile['who_can_message']> value={p.who_can_message} onChange={(v) => patch({ who_can_message: v })}
            items={[['everyone', 'كل الجامعة'], ['college', 'كليتي'], ['major', 'تخصصي'], ['nobody', 'ولا حدا']]} />
        </Box>

        <Box title="مين بيشوف إنستغرام وسناب" hint="الأزرار بتطلع على بروفايلك">
          <Choice<Profile['socials_visible_to']> value={p.socials_visible_to} onChange={(v) => patch({ socials_visible_to: v })}
            items={[['everyone', 'الكل'], ['friends', 'المتابعين'], ['close_friends', 'المقربين'], ['nobody', 'ولا حدا']]} />
        </Box>

        <Box title="الرسائل" hint="الإعداد الافتراضي لكل محادثة جديدة، وبتقدر تغيره جوا أي محادثة">
          <Row gap={8}><Timer size={18} color={C.ink2} /><T v="bodyMd">اختفاء الرسائل</T></Row>
          <Choice<VanishMode> value={p.default_vanish} onChange={(v) => patch({ default_vanish: v })}
            items={[['after_view', 'بعد المشاهدة'], ['h24', 'بعد 24 ساعة'], ['d7', 'بعد أسبوع'], ['never', 'ما تختفي']]} />
          <Toggle icon={ic(<Camera size={18} color={C.red} />)} label="امنع لقطة الشاشة" hint="شاشة المحادثة بتطلع فاضية بالسكرين شوت، وبنخبرك لو حدا حاول" value={p.block_screenshots} onChange={(v) => patch({ block_screenshots: v })} />
        </Box>

        <Box title="الأصحاب القريبين">
          <Toggle icon={ic(<MapPin size={18} color={C.orange} />)} label="خبّرني لما صاحب قريب مني" hint="بس للأصحاب المتبادلين اللي مفعلينها كمان، وبنبيّن المبنى مش موقعك الدقيق" value={p.nearby_enabled} onChange={(v) => patch({ nearby_enabled: v })} />
        </Box>

        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: C.primarySoft, borderRadius: 18, padding: 14 }}>
          {p.is_private ? <EyeOff size={18} color={C.primary} /> : <Eye size={18} color={C.primary} />}
          <T v="small" color={C.ink2} style={{ flex: 1 }}>
            منشوراتك بأقسام الجامعة (ملخصات، مفقودات، سوق...) بتضل ظاهرة لطلاب جامعتك حتى لو حسابك خاص، عشان هيك هي معمولة.
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: C.white, borderRadius: 18, padding: 14 }}>
          <MessageCircle size={18} color={C.muted} />
          <T v="small" color={C.muted} style={{ flex: 1 }}>
            إدارة يونيميت بتقدر تفتح أي محادثة لما يوصلها بلاغ أو للحماية والأمان، وكل فتح بينسجل. التفاصيل بسياسة الخصوصية.
          </T>
        </View>
      </ScrollView>
    </Screen>
  );
}
