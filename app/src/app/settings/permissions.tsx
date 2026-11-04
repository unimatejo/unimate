import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { Bell, Camera, Image as ImageIcon, MapPin, Mic } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, View } from 'react-native';

import { Header, IconTile, Row, Screen, T, Tap } from '@/components/ui';
import { C, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

type State = 'granted' | 'denied' | 'ask' | 'unavailable';
type Perm = { key: string; icon: ReactNode; color: string; label: string; why: string; get: () => Promise<{ granted: boolean; canAskAgain?: boolean; status?: string }>; ask: () => Promise<unknown> };

const ic = { size: 19, color: '#FFFFFF' };
const PERMS: Perm[] = [
  { key: 'notif', icon: <Bell {...ic} />, color: C.orange, label: t('التنبيهات'), why: t('تذكير قبل المحاضرات والامتحانات، وملخص بكرة كل ليلة.'), get: () => Notifications.getPermissionsAsync(), ask: () => Notifications.requestPermissionsAsync() },
  { key: 'camera', icon: <Camera {...ic} />, color: C.pink, label: t('الكاميرا'), why: t('تصوّر ستوري أو صورة بالمحادثة.'), get: () => ImagePicker.getCameraPermissionsAsync(), ask: () => ImagePicker.requestCameraPermissionsAsync() },
  { key: 'photos', icon: <ImageIcon {...ic} />, color: C.green, label: t('الصور'), why: t('تختار صور للمنشورات والستوري والبروفايل.'), get: () => ImagePicker.getMediaLibraryPermissionsAsync(), ask: () => ImagePicker.requestMediaLibraryPermissionsAsync() },
  { key: 'mic', icon: <Mic {...ic} />, color: C.violet, label: t('المايك'), why: t('الرسائل الصوتية وصوت فيديو الستوري.'), get: () => getRecordingPermissionsAsync(), ask: () => requestRecordingPermissionsAsync() },
  { key: 'location', icon: <MapPin {...ic} />, color: C.primary, label: t('الموقع'), why: t('توصل لقاعتك على خريطة الحرم. ما بنشارك موقعك مع حدا.'), get: () => Location.getForegroundPermissionsAsync(), ask: () => Location.requestForegroundPermissionsAsync() },
];

const LABEL: Record<State, [string, string, string]> = {
  granted: [t('مسموح'), C.greenSoft, C.greenInk],
  denied: [t('ممنوع'), C.redSoft, C.red],
  ask: [t('ما انسأل'), C.soft, C.muted],
  unavailable: [t('مش متاح هون'), C.soft, C.faint],
};

/** One place to see and fix what UniMate can use on this phone. */
export default function Permissions() {
  const [st, setSt] = useState<Record<string, State>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const read = useCallback(async () => {
    const out: Record<string, State> = {};
    for (const p of PERMS) {
      try {
        const r = await p.get();
        out[p.key] = r.granted ? 'granted' : r.canAskAgain === false || r.status === 'denied' ? 'denied' : 'ask';
      } catch { out[p.key] = 'unavailable'; }
    }
    setSt(out);
  }, []);
  useFocusEffect(useCallback(() => {
    read();
    // coming back from the phone's Settings app
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') read(); });
    return () => sub.remove();
  }, [read]));

  async function fix(p: Perm) {
    const s = st[p.key];
    if (s === 'granted' || s === 'unavailable' || busy) return;
    if (s === 'denied' && Platform.OS !== 'web') { Linking.openSettings().catch(() => {}); return; }
    setBusy(p.key);
    try { await p.ask(); } catch { /* the browser or phone said no */ } finally { setBusy(null); read(); }
  }

  return (
    <Screen>
      <Header title={t('الصلاحيات')} subtitle={t('شو بيقدر يونيميت يستخدم على جهازك')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}>
        <View style={[{ backgroundColor: C.card, borderRadius: 22 }, shadow]}>
          <View style={{ borderRadius: 22, overflow: 'hidden' }}>
            {PERMS.map((p) => {
              const s = st[p.key];
              const [l, bg, fg] = LABEL[s ?? 'ask'];
              return (
                <Tap key={p.key} haptic={false} scale={0.99} onPress={() => fix(p)} disabled={!s || s === 'granted' || s === 'unavailable'}
                  accessibilityLabel={`${p.label}: ${l}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 74, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
                  <IconTile color={p.color}>{p.icon}</IconTile>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyMd">{p.label}</T>
                    <T v="tiny" color={C.muted}>{p.why}</T>
                  </View>
                  {busy === p.key || !s ? <ActivityIndicator color={C.primary} /> : (
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><T v="tiny" color={fg}>{l}</T></View>
                      {s === 'ask' && <T v="tiny" color={C.primary}>{t('اسمح')}</T>}
                      {s === 'denied' && Platform.OS !== 'web' && <T v="tiny" color={C.primary}>{t('افتح الإعدادات')}</T>}
                    </View>
                  )}
                </Tap>
              );
            })}
          </View>
        </View>
        <Row gap={8} center={false} style={{ backgroundColor: C.primarySoft, borderRadius: 18, padding: 12 }}>
          <T v="small" color={C.ink2} style={{ flex: 1 }}>
            {Platform.OS === 'web'
              ? t('على المتصفح، بتتحكم بالصلاحيات من رمز القفل جنب الرابط فوق.')
              : t('إذا منعت إشي بالغلط، اكبس عليه وبنفتحلك إعدادات الجهاز لترجعه. بنطلب كل صلاحية بس لما تحتاجها.')}
          </T>
        </Row>
      </ScrollView>
    </Screen>
  );
}
