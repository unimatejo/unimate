import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Globe, Mail } from 'lucide-react-native';
import { Linking, ScrollView, View } from 'react-native';

import { Header, IconTile, Screen, T, Tap } from '@/components/ui';
import { C, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

const ic = { size: 19, color: '#FFFFFF' };

/** Who made UniMate, and how to reach us. */
export default function About() {
  const row = (icon: React.ReactNode, color: string, label: string, value: string, url: string) => (
    <Tap haptic={false} onPress={() => Linking.openURL(url).catch(() => {})}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
      <IconTile color={color}>{icon}</IconTile>
      <View style={{ flex: 1 }}>
        <T v="bodyMd">{label}</T>
        <T v="tiny" color={C.muted} style={{ writingDirection: 'ltr', textAlign: 'left' }}>{value}</T>
      </View>
    </Tap>
  );
  return (
    <Screen>
      <Header title={t('عن يونيميت')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 8, gap: 18, paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 14 }}>
          <Image source={require('../../../assets/images/icon.png')} style={{ width: 96, height: 96, borderRadius: 26 }} />
          <T v="h1">UniMate | يونيميت</T>
          <T v="small" color={C.muted}>{t('الإصدار {0}', [Constants.expoConfig?.version ?? ''])}</T>
          <T v="body" color={C.ink2} style={{ textAlign: 'center', marginTop: 4 }}>{t('جامعتك كلها بتطبيق واحد: جدولك، زملاؤك، خريطة الحرم، ومجتمع جامعتك.')}</T>
        </View>

        <View style={[{ backgroundColor: C.card, borderRadius: 22, padding: 18, gap: 4, alignItems: 'center' }, shadow]}>
          <T v="tiny" color={C.muted}>{t('فكرة وتطوير')}</T>
          <T v="h2">{t('محمد شنيك')}</T>
          <T v="small" color={C.muted}>{t('صاحب المشروع ومؤسس يونيميت')}</T>
        </View>

        <View style={[{ backgroundColor: C.card, borderRadius: 22 }, shadow]}>
          <View style={{ borderRadius: 22, overflow: 'hidden' }}>
            {row(<Mail {...ic} />, C.primary, t('تواصل معنا'), 'shannik@unimate.my', 'mailto:shannik@unimate.my')}
            {row(<Globe {...ic} />, C.green, t('الموقع الإلكتروني'), 'unimate.my', 'https://unimate.my')}
          </View>
        </View>

        <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>{t('خرائط الحرم من OpenStreetMap وWikimapia.')}</T>
        <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>© {new Date().getFullYear()} UniMate</T>
      </ScrollView>
    </Screen>
  );
}
