import { router } from 'expo-router';
import { ArrowLeftRight, BookOpen, Bus, Briefcase, ClipboardCheck, GraduationCap, MessageCircle, Search, ShoppingBag, Sparkles } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Header, Screen, T, Tap } from '@/components/ui';
import { CATEGORY, C } from '@/lib/theme';
import { t } from '@/lib/i18n';

const ICON: Record<string, typeof Search> = {
  square: MessageCircle, summaries: BookOpen, assignments: ClipboardCheck, tutoring: GraduationCap, lost_found: Search,
  market: ShoppingBag, exchange: ArrowLeftRight, transport_housing: Bus, events: Sparkles, opportunities: Briefcase,
};
const DESC: Record<string, string> = {
  square: t('أسئلة سريعة ونقاشات'), summaries: t('شارك ونزّل ملخصات المواد'), assignments: t('مواعيد ونقاش الواجبات'),
  tutoring: t('درّس أو لاقي مدرّس'), lost_found: t('ضاع منك إشي أو لقيت إشي'), market: t('بيع وشراء كتب وأدوات'),
  exchange: t('بدّل كتابك أو تبرع فيه'), transport_housing: t('توصيلة مشتركة وسكن'), events: t('نشاطات وأندية ورياضة'), opportunities: t('تدريب وشغل جزئي ومنح'),
};

export default function Sections() {
  return (
    <Screen>
      <Header title={t('أقسام المجتمع')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {Object.entries(CATEGORY).map(([k, v], i) => {
          const Icon = ICON[k];
          return (
            <Animated.View key={k} entering={FadeInDown.delay(i * 40)} style={{ width: '48.5%' }}>
              <Tap onPress={() => router.push({ pathname: '/section/[category]', params: { category: k } })}
                style={{ alignItems: 'center', gap: 8, paddingVertical: 18, paddingHorizontal: 10, borderRadius: 22, backgroundColor: v.soft }}>
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: v.color, alignItems: 'center', justifyContent: 'center' }}><Icon size={23} color={C.white} /></View>
                <T v="bold" style={{ textAlign: 'center' }}>{v.label}</T>
                <T v="tiny" color={C.ink2} style={{ textAlign: 'center', fontFamily: 'Rubik_400Regular' }}>{DESC[k]}</T>
              </Tap>
            </Animated.View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
