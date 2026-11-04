import { Bell, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { T, Tap } from './ui';
import { getPref, setPref } from '@/lib/prefs';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';
import { enableWebPush, webPushState, type WebPushState } from '@/lib/webpush';

/** On the web app: a small card asking to turn on message notifications (or, on iPhone Safari, to add the app to the home screen first). */
export function PushNudge() {
  const [st, setSt] = useState<WebPushState>('unavailable');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (Platform.OS === 'web') setSt(webPushState()); }, []);
  if (Platform.OS !== 'web' || (st !== 'ask' && st !== 'install') || getPref(`push_nudge_${st}`) === 'x') return null;

  const hide = () => { setPref(`push_nudge_${st}`, 'x'); setSt('unavailable'); };
  async function on() {
    setBusy(true);
    try { await enableWebPush(); } catch { /* browser said no */ } finally { setBusy(false); setSt(webPushState()); }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.primarySoft, borderRadius: 18, padding: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Bell size={20} color="#fff" /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyMd">{st === 'install' ? t('بدك توصلك إشعارات الرسائل؟') : t('فعّل إشعارات الرسائل')}</T>
        <T v="tiny" color={C.ink2}>{st === 'install'
          ? t('من سفاري اكبس زر المشاركة، بعدين «إضافة إلى الشاشة الرئيسية»، وافتح يونيميت من الأيقونة.')
          : t('بتوصلك الرسالة حتى لو يونيميت مسكّر.')}</T>
      </View>
      {st === 'ask' && (
        <Tap onPress={on} disabled={busy} accessibilityLabel={t('فعّل')} style={{ backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 14, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color="#fff" /> : <T v="bold" color="#fff">{t('فعّل')}</T>}
        </Tap>
      )}
      <Tap onPress={hide} accessibilityLabel={t('إخفاء')} hitSlop={10}><X size={18} color={C.muted} /></Tap>
    </View>
  );
}
